/**
 * Tests for GraphCoordinator -- gate interrupt persistence via CheckpointStore.
 *
 * Uses a minimal test state and in-memory store to verify:
 * - Run executes graph and persists state
 * - Gate interrupt is persisted and resumable
 * - Resume feeds decision to runner and continues
 * - Cleared interrupts return null
 * - Multiple gates in sequence work correctly
 */

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';
import { GraphCoordinator } from '../../src/core/graph/coordinator.js';
import { GraphBuilder } from '../../src/core/graph/builder.js';
import type { GraphDefinition } from '../../src/core/graph/types.js';
import { derivePipelineId } from '../../src/shared/state/pipeline-id.js';

// ── Test State ──────────────────────────────────────────────────────────────

interface TestState {
  value: number;
  log: string[];
}

const TestStateSchema = z.object({
  value: z.number(),
  log: z.array(z.string()),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const stores: CheckpointStore[] = [];

function createStoreFactory() {
  const store = new CheckpointStore(':memory:');
  stores.push(store);
  return (_projectPath: string) => ({
    store,
    pipelineId: derivePipelineId('/test/project'),
  });
}

afterEach(() => {
  for (const s of stores) {
    s.close();
  }
  stores.length = 0;
});

function buildSimpleGraph(): GraphDefinition<TestState> {
  return new GraphBuilder<TestState>('test-graph', 'Test Graph')
    .addNode({
      id: 'step-1',
      name: 'Step 1',
      type: 'action',
      execute: async (state) => ({
        state: { value: state.value + 1, log: [...state.log, 'step-1'] },
      }),
    })
    .addNode({
      id: 'gate-1',
      name: 'Gate 1',
      type: 'gate',
    })
    .addNode({
      id: 'step-2',
      name: 'Step 2',
      type: 'action',
      execute: async (state) => ({
        state: { value: state.value + 10, log: [...state.log, 'step-2'] },
      }),
    })
    .addEdge('step-1', 'gate-1')
    .addEdge('gate-1', 'step-2')
    .setEntry('step-1')
    .build();
}

function buildTwoGateGraph(): GraphDefinition<TestState> {
  return new GraphBuilder<TestState>('two-gate-graph', 'Two Gate Graph')
    .addNode({
      id: 'step-1',
      name: 'Step 1',
      type: 'action',
      execute: async (state) => ({
        state: { value: state.value + 1, log: [...state.log, 'step-1'] },
      }),
    })
    .addNode({
      id: 'gate-1',
      name: 'Gate 1',
      type: 'gate',
    })
    .addNode({
      id: 'step-2',
      name: 'Step 2',
      type: 'action',
      execute: async (state) => ({
        state: { value: state.value + 10, log: [...state.log, 'step-2'] },
      }),
    })
    .addNode({
      id: 'gate-2',
      name: 'Gate 2',
      type: 'gate',
    })
    .addNode({
      id: 'step-3',
      name: 'Step 3',
      type: 'action',
      execute: async (state) => ({
        state: { value: state.value + 100, log: [...state.log, 'step-3'] },
      }),
    })
    .addEdge('step-1', 'gate-1')
    .addEdge('gate-1', 'step-2')
    .addEdge('step-2', 'gate-2')
    .addEdge('gate-2', 'step-3')
    .setEntry('step-1')
    .build();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GraphCoordinator', () => {
  describe('run', () => {
    it('executes graph and stops at gate', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();
      const initial: TestState = { value: 0, log: [] };

      const result = await coordinator.run('/test/project', graph, initial);

      expect(result.gateInterrupt).toBeDefined();
      expect(result.gateInterrupt!.gateNodeId).toBe('gate-1');
      expect(result.state.value).toBe(1);
      expect(result.state.log).toEqual(['step-1']);
    });

    it('persists state to CheckpointStore', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();
      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      // State should be loadable from the store
      const loaded = coordinator.loadState('/test/project');
      expect(loaded.value).toBe(1);
    });

    it('persists gate interrupt metadata', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();
      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      const interrupt = coordinator.loadPendingInterrupt('/test/project');
      expect(interrupt).not.toBeNull();
      expect(interrupt!.gateNodeId).toBe('gate-1');
      expect(interrupt!.graphId).toBe('test-graph');
    });

    it('completes graph with no gates', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      // Graph with no gates
      const graph = new GraphBuilder<TestState>('no-gate', 'No Gate')
        .addNode({
          id: 'only',
          name: 'Only',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 42, log: [...state.log, 'done'] },
          }),
        })
        .setEntry('only')
        .build();

      const result = await coordinator.run('/test/project', graph, { value: 0, log: [] });

      expect(result.gateInterrupt).toBeUndefined();
      expect(result.state.value).toBe(42);

      // No pending interrupt
      const interrupt = coordinator.loadPendingInterrupt('/test/project');
      expect(interrupt).toBeNull();
    });
  });

  describe('resume', () => {
    it('resumes from gate and completes', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();

      // Run until gate
      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      // Resume with approval
      const result = await coordinator.resume('/test/project', graph, { decision: 'approve' });

      expect(result.gateInterrupt).toBeUndefined();
      expect(result.state.value).toBe(11); // 0 + 1 (step-1 from initial run state) + 10 (step-2)
      expect(result.state.log).toEqual(['step-1', 'step-2']);
    });

    it('throws when no pending interrupt exists', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();

      await expect(coordinator.resume('/test/project', graph, { decision: 'approve' })).rejects.toThrow(
        /No pending gate interrupt/,
      );
    });

    it('handles rejection -- stops execution', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();

      // Run until gate
      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      // Reject
      const result = await coordinator.resume('/test/project', graph, {
        decision: 'reject',
        feedback: 'Not ready',
      });

      // Value should not have changed (step-2 was not executed)
      expect(result.state.value).toBe(1);
      expect(result.trace.status).toBe('failed');
    });

    it('clears interrupt after completion', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildSimpleGraph();

      await coordinator.run('/test/project', graph, { value: 0, log: [] });
      await coordinator.resume('/test/project', graph, { decision: 'approve' });

      // Interrupt should be cleared
      const interrupt = coordinator.loadPendingInterrupt('/test/project');
      expect(interrupt).toBeNull();
    });
  });

  describe('multi-gate sequence', () => {
    it('handles two gates in sequence', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildTwoGateGraph();

      // Run -> stops at gate-1
      const r1 = await coordinator.run('/test/project', graph, { value: 0, log: [] });
      expect(r1.gateInterrupt!.gateNodeId).toBe('gate-1');
      expect(r1.state.value).toBe(1);

      // Approve gate-1 -> runs step-2 -> stops at gate-2
      const r2 = await coordinator.resume('/test/project', graph, { decision: 'approve' });
      expect(r2.gateInterrupt!.gateNodeId).toBe('gate-2');
      expect(r2.state.value).toBe(11); // 1 + 10

      // Approve gate-2 -> runs step-3 -> completes
      const r3 = await coordinator.resume('/test/project', graph, { decision: 'approve' });
      expect(r3.gateInterrupt).toBeUndefined();
      expect(r3.state.value).toBe(111); // 11 + 100
      expect(r3.state.log).toEqual(['step-1', 'step-2', 'step-3']);
    });

    it('persists correct interrupt at each gate', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = buildTwoGateGraph();

      await coordinator.run('/test/project', graph, { value: 0, log: [] });
      expect(coordinator.loadPendingInterrupt('/test/project')!.gateNodeId).toBe('gate-1');

      await coordinator.resume('/test/project', graph, { decision: 'approve' });
      expect(coordinator.loadPendingInterrupt('/test/project')!.gateNodeId).toBe('gate-2');

      await coordinator.resume('/test/project', graph, { decision: 'approve' });
      expect(coordinator.loadPendingInterrupt('/test/project')).toBeNull();
    });
  });

  describe('loadPendingInterrupt', () => {
    it('returns null when no store data exists', () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      expect(coordinator.loadPendingInterrupt('/test/project')).toBeNull();
    });
  });

  describe('loadState', () => {
    it('throws when no state exists', () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      expect(() => coordinator.loadState('/test/project')).toThrow(/No checkpoint found/);
    });
  });

  describe('per-step checkpointing', () => {
    it('calls onNodeComplete after each action node', async () => {
      const factory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(factory, 'test:state', 'test:interrupt', TestStateSchema);

      const graph = new GraphBuilder<TestState>('checkpoint-graph', 'Checkpoint Graph')
        .addNode({
          id: 'a',
          name: 'A',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 1, log: [...state.log, 'a'] },
          }),
        })
        .addNode({
          id: 'b',
          name: 'B',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 10, log: [...state.log, 'b'] },
          }),
        })
        .addNode({
          id: 'c',
          name: 'C',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 100, log: [...state.log, 'c'] },
          }),
        })
        .addEdge('a', 'b')
        .addEdge('b', 'c')
        .setEntry('a')
        .build();

      const checkpoints: Array<{ nodeId: string; value: number }> = [];

      await coordinator.run(
        '/test/project',
        graph,
        { value: 0, log: [] },
        {
          onNodeComplete: (nodeId, state) => {
            checkpoints.push({ nodeId, value: state.value });
          },
        },
      );

      // onNodeComplete should fire after each action node
      expect(checkpoints).toEqual([
        { nodeId: 'a', value: 1 },
        { nodeId: 'b', value: 11 },
        { nodeId: 'c', value: 111 },
      ]);
    });

    it('saves per-node checkpoints to the store', async () => {
      const storeFactory = createStoreFactory();
      const store = storeFactory('/test/project').store;
      const pipelineId = storeFactory('/test/project').pipelineId;
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      const graph = new GraphBuilder<TestState>('checkpoint-graph', 'Checkpoint Graph')
        .addNode({
          id: 'a',
          name: 'A',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 1, log: [...state.log, 'a'] },
          }),
        })
        .addNode({
          id: 'b',
          name: 'B',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 10, log: [...state.log, 'b'] },
          }),
        })
        .addEdge('a', 'b')
        .setEntry('a')
        .build();

      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      // Per-node checkpoints should exist
      const cpA = store.load(pipelineId, 'test:state:a', TestStateSchema);
      expect(cpA.state.value).toBe(1);

      const cpB = store.load(pipelineId, 'test:state:b', TestStateSchema);
      expect(cpB.state.value).toBe(11);
    });

    it('saves per-node checkpoints during gate-interrupted runs', async () => {
      const storeFactory = createStoreFactory();
      const store = storeFactory('/test/project').store;
      const pipelineId = storeFactory('/test/project').pipelineId;
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      const graph = buildSimpleGraph(); // step-1 -> gate-1 -> step-2

      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      // step-1 checkpoint should exist even though we stopped at gate-1
      const cp = store.load(pipelineId, 'test:state:step-1', TestStateSchema);
      expect(cp.state.value).toBe(1);
    });
  });

  describe('crash recovery', () => {
    it('recovers from crash -- skips completed nodes', async () => {
      const storeFactory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      const executionLog: string[] = [];

      const graph = new GraphBuilder<TestState>('recovery-graph', 'Recovery Graph')
        .addNode({
          id: 'a',
          name: 'A',
          type: 'action',
          execute: async (state) => {
            executionLog.push('a');
            return { state: { value: state.value + 1, log: [...state.log, 'a'] } };
          },
        })
        .addNode({
          id: 'b',
          name: 'B',
          type: 'action',
          execute: async (state) => {
            executionLog.push('b');
            return { state: { value: state.value + 10, log: [...state.log, 'b'] } };
          },
        })
        .addNode({
          id: 'c',
          name: 'C',
          type: 'action',
          execute: async (state) => {
            executionLog.push('c');
            return { state: { value: state.value + 100, log: [...state.log, 'c'] } };
          },
        })
        .addEdge('a', 'b')
        .addEdge('b', 'c')
        .setEntry('a')
        .build();

      // Run the full graph -- creates per-node checkpoints for a and b
      // Simulate crash by running normally first
      await coordinator.run('/test/project', graph, { value: 0, log: [] });
      executionLog.length = 0; // Reset log

      // Now simulate recovery: manually remove the 'c' checkpoint so it looks like
      // we crashed after 'b' completed
      const { store, pipelineId } = storeFactory('/test/project');
      // Verify 'b' checkpoint exists
      const cpB = store.load(pipelineId, 'test:state:b', TestStateSchema);
      expect(cpB.state.value).toBe(11);

      // recoverFromCrash should find 'b' as the last checkpoint,
      // but since 'c' also has a checkpoint, it will say all done.
      // Let's do a proper test: delete the 'c' checkpoint
      store.deletePipeline(pipelineId);
      // Re-save only a and b checkpoints
      store.save(pipelineId, 'test:state:a', { value: 1, log: ['a'] });
      store.save(pipelineId, 'test:state:b', { value: 11, log: ['a', 'b'] });

      const recovery = coordinator.recoverFromCrash('/test/project', graph);
      expect(recovery).not.toBeNull();
      expect(recovery!.resumeFromNodeId).toBe('c');
      expect(recovery!.state.value).toBe(11);

      // Resume from the recovery point
      const result = await coordinator.run('/test/project', graph, recovery!.state, {
        resumeFromNodeId: recovery!.resumeFromNodeId,
      });

      // Only 'c' should have executed
      expect(executionLog).toEqual(['c']);
      expect(result.state.value).toBe(111);
      expect(result.state.log).toEqual(['a', 'b', 'c']);
    });

    it('returns null when no checkpoints exist', () => {
      const storeFactory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      const graph = buildSimpleGraph();
      const recovery = coordinator.recoverFromCrash('/test/project', graph);
      expect(recovery).toBeNull();
    });

    it('returns null when all nodes completed', async () => {
      const storeFactory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      // Graph with no gates -- runs to completion
      const graph = new GraphBuilder<TestState>('no-gate', 'No Gate')
        .addNode({
          id: 'only',
          name: 'Only',
          type: 'action',
          execute: async (state) => ({
            state: { value: state.value + 42, log: [...state.log, 'done'] },
          }),
        })
        .setEntry('only')
        .build();

      await coordinator.run('/test/project', graph, { value: 0, log: [] });

      const recovery = coordinator.recoverFromCrash('/test/project', graph);
      expect(recovery).toBeNull();
    });

    it('does not interfere with gate interrupt checkpoints', async () => {
      const storeFactory = createStoreFactory();
      const coordinator = new GraphCoordinator<TestState>(
        storeFactory,
        'test:state',
        'test:interrupt',
        TestStateSchema,
      );

      const graph = buildSimpleGraph(); // step-1 -> gate-1 -> step-2

      // Run until gate
      const r1 = await coordinator.run('/test/project', graph, { value: 0, log: [] });
      expect(r1.gateInterrupt).toBeDefined();

      // Gate interrupt should still work
      const interrupt = coordinator.loadPendingInterrupt('/test/project');
      expect(interrupt).not.toBeNull();
      expect(interrupt!.gateNodeId).toBe('gate-1');

      // Main state should still be loadable
      const state = coordinator.loadState('/test/project');
      expect(state.value).toBe(1);

      // Per-node checkpoint should also exist
      const { store, pipelineId } = storeFactory('/test/project');
      const cp = store.load(pipelineId, 'test:state:step-1', TestStateSchema);
      expect(cp.state.value).toBe(1);

      // Resume should still work normally
      const r2 = await coordinator.resume('/test/project', graph, { decision: 'approve' });
      expect(r2.state.value).toBe(11);
    });
  });
});
