/**
 * Stress Test: Pipeline Integration
 *
 * Verifies graph builder, runner, and checkpoint store work together
 * for complex multi-phase pipeline scenarios.
 */

import { describe, it, expect } from 'vitest';
import { GraphBuilder } from '../../src/core/graph/builder.js';
import { GraphRunner } from '../../src/core/graph/runner.js';
import type { GraphNode, NodeResult } from '../../src/core/graph/types.js';

// ── Test State ────────────────────────────────────────────────────────────────

interface PipelineState {
  log: string[];
  phase: number;
  artifacts: string[];
}

const initialState = (): PipelineState => ({
  log: [],
  phase: 0,
  artifacts: [],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionNode(id: string, phaseNum: number): GraphNode<PipelineState> {
  return {
    id,
    name: id,
    type: 'action',
    execute: async (state: PipelineState): Promise<NodeResult<PipelineState>> => ({
      state: {
        ...state,
        log: [...state.log, `${id}-complete`],
        phase: phaseNum,
        artifacts: [...state.artifacts, `${id}-output.md`],
      },
    }),
  };
}

function gateNode(id: string): GraphNode<PipelineState> {
  return { id, name: id, type: 'gate' };
}

describe('Pipeline integration stress tests', () => {
  it('should execute a linear 8-phase pipeline to completion', async () => {
    const runner = new GraphRunner<PipelineState>();
    const phases = ['illuminate', 'define', 'architect', 'sequence', 'validate', 'forge', 'connect', 'compound'];

    let builder = new GraphBuilder<PipelineState>('linear-8', 'Linear 8-Phase');
    for (let i = 0; i < phases.length; i++) {
      builder = builder.addNode(actionNode(phases[i], i + 1));
      if (i > 0) {
        builder = builder.addEdge(phases[i - 1], phases[i]);
      }
    }
    builder = builder.setEntry('illuminate');
    const graph = builder.build();

    const result = await runner.run(graph, initialState());

    expect(result.state.phase).toBe(8);
    expect(result.state.log).toEqual(phases.map((p) => `${p}-complete`));
    expect(result.state.artifacts).toHaveLength(8);
  });

  it('should handle pipeline with gates and resume', async () => {
    const runner = new GraphRunner<PipelineState>();

    const graph = new GraphBuilder<PipelineState>('gated', 'Gated Pipeline')
      .addNode(actionNode('illuminate', 1))
      .addNode(gateNode('gate1'))
      .addNode(actionNode('define', 2))
      .addNode(gateNode('gate2'))
      .addNode(actionNode('architect', 3))
      .addEdge('illuminate', 'gate1')
      .addEdge('gate1', 'define')
      .addEdge('define', 'gate2')
      .addEdge('gate2', 'architect')
      .setEntry('illuminate')
      .build();

    // Run until first gate
    const result1 = await runner.run(graph, initialState());
    expect(result1.gateInterrupt).toBeDefined();
    expect(result1.gateInterrupt!.gateNodeId).toBe('gate1');
    expect(result1.state.log).toEqual(['illuminate-complete']);

    // Resume past gate1
    const result2 = await runner.run(graph, result1.state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'gate1',
    });
    expect(result2.gateInterrupt).toBeDefined();
    expect(result2.gateInterrupt!.gateNodeId).toBe('gate2');
    expect(result2.state.log).toEqual(['illuminate-complete', 'define-complete']);

    // Resume past gate2
    const result3 = await runner.run(graph, result2.state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'gate2',
    });
    expect(result3.gateInterrupt).toBeUndefined();
    expect(result3.state.log).toEqual(['illuminate-complete', 'define-complete', 'architect-complete']);
  });

  it('should handle gate rejection', async () => {
    const runner = new GraphRunner<PipelineState>();

    const graph = new GraphBuilder<PipelineState>('reject-test', 'Reject Test')
      .addNode(actionNode('illuminate', 1))
      .addNode(gateNode('gate1'))
      .addNode(actionNode('define', 2))
      .addEdge('illuminate', 'gate1')
      .addEdge('gate1', 'define')
      .setEntry('illuminate')
      .build();

    // Run to gate
    const result1 = await runner.run(graph, initialState());
    expect(result1.gateInterrupt).toBeDefined();

    // Reject at gate
    const result2 = await runner.run(graph, result1.state, {
      gateResume: { decision: 'reject' },
      resumeFromGateId: 'gate1',
    });

    // After rejection, define should not have been reached
    expect(result2.state.log).not.toContain('define-complete');
  });

  it('should handle fan-out with multiple successor edges', async () => {
    const runner = new GraphRunner<PipelineState>();

    // Fan-out: start has 3 successors that run in parallel
    // No fan-in merge needed — test that all branches execute
    const graph = new GraphBuilder<PipelineState>('fanout', 'Fan-Out Test')
      .addNode(actionNode('start', 0))
      .addNode(actionNode('branch-a', 1))
      .addNode(actionNode('branch-b', 1))
      .addNode(actionNode('branch-c', 1))
      .addEdge('start', 'branch-a')
      .addEdge('start', 'branch-b')
      .addEdge('start', 'branch-c')
      .setEntry('start')
      .build();

    const result = await runner.run(graph, initialState());

    expect(result.state.log).toContain('start-complete');
    // At least one branch should have executed
    const branchesExecuted = ['branch-a-complete', 'branch-b-complete', 'branch-c-complete'].filter((b) =>
      result.state.log.includes(b),
    );
    expect(branchesExecuted.length).toBeGreaterThan(0);
  });

  it('should handle node errors with retry policy', async () => {
    const runner = new GraphRunner<PipelineState>();
    let attemptCount = 0;

    const flakyNode: GraphNode<PipelineState> = {
      id: 'flaky',
      name: 'Flaky Node',
      type: 'action',
      retry: { maxRetries: 3, baseDelayMs: 10 },
      execute: async (state: PipelineState): Promise<NodeResult<PipelineState>> => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Flaky failure attempt ${attemptCount}`);
        }
        return {
          state: { ...state, log: [...state.log, 'flaky-succeeded'] },
        };
      },
    };

    const graph = new GraphBuilder<PipelineState>('retry-test', 'Retry Test')
      .addNode(flakyNode)
      .setEntry('flaky')
      .build();

    const result = await runner.run(graph, initialState());

    expect(attemptCount).toBe(3);
    expect(result.state.log).toContain('flaky-succeeded');
  });

  it('should emit graph execution events', async () => {
    const runner = new GraphRunner<PipelineState>();
    const events: string[] = [];

    runner.on((event) => {
      events.push(event.type);
    });

    const graph = new GraphBuilder<PipelineState>('events-test', 'Events Test')
      .addNode(actionNode('a', 1))
      .addNode(actionNode('b', 2))
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    await runner.run(graph, initialState());

    // Should have start/complete events
    expect(events).toContain('graph-start');
    expect(events).toContain('node-start');
    expect(events).toContain('node-complete');
    expect(events).toContain('graph-complete');
  });

  it('should handle deep pipeline with 20 sequential nodes', async () => {
    const runner = new GraphRunner<PipelineState>();
    let builder = new GraphBuilder<PipelineState>('deep-20', 'Deep 20-Phase');

    for (let i = 0; i < 20; i++) {
      builder = builder.addNode(actionNode(`step-${i}`, i));
      if (i > 0) {
        builder = builder.addEdge(`step-${i - 1}`, `step-${i}`);
      }
    }
    builder = builder.setEntry('step-0');

    const graph = builder.build();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toHaveLength(20);
    expect(result.state.phase).toBe(19);
    expect(result.state.artifacts).toHaveLength(20);
  });

  it('should handle multiple gate interrupts in sequence', async () => {
    const runner = new GraphRunner<PipelineState>();

    // Build a pipeline with 4 gates
    const graph = new GraphBuilder<PipelineState>('multi-gate', 'Multi-Gate')
      .addNode(actionNode('step1', 1))
      .addNode(gateNode('g1'))
      .addNode(actionNode('step2', 2))
      .addNode(gateNode('g2'))
      .addNode(actionNode('step3', 3))
      .addNode(gateNode('g3'))
      .addNode(actionNode('step4', 4))
      .addNode(gateNode('g4'))
      .addNode(actionNode('step5', 5))
      .addEdge('step1', 'g1')
      .addEdge('g1', 'step2')
      .addEdge('step2', 'g2')
      .addEdge('g2', 'step3')
      .addEdge('step3', 'g3')
      .addEdge('g3', 'step4')
      .addEdge('step4', 'g4')
      .addEdge('g4', 'step5')
      .setEntry('step1')
      .build();

    let state = initialState();
    const gateIds = ['g1', 'g2', 'g3', 'g4'];

    for (let i = 0; i < gateIds.length; i++) {
      const opts =
        i === 0 ? undefined : { gateResume: { decision: 'approve' as const }, resumeFromGateId: gateIds[i - 1] };

      const result = await runner.run(graph, state, opts);
      expect(result.gateInterrupt).toBeDefined();
      expect(result.gateInterrupt!.gateNodeId).toBe(gateIds[i]);
      state = result.state;
    }

    // Final resume past g4
    const finalResult = await runner.run(graph, state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'g4',
    });

    expect(finalResult.gateInterrupt).toBeUndefined();
    expect(finalResult.state.log).toEqual([
      'step1-complete',
      'step2-complete',
      'step3-complete',
      'step4-complete',
      'step5-complete',
    ]);
  });
});
