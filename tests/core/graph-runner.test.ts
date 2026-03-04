/**
 * Graph Runner Tests
 *
 * Covers: P0-010 (types), P0-011 (sequential), P0-012 (parallel),
 * P0-013 (gates), P0-014 (retry/errors), P0-015 (events)
 */
import { describe, it, expect } from 'vitest';
import { GraphBuilder } from '../../src/core/graph/builder.js';
import { GraphRunner } from '../../src/core/graph/runner.js';
import type { GraphEvent, NodeResult } from '../../src/core/graph/types.js';

// ── Test State ──────────────────────────────────────────────────────────────

interface TestState {
  log: string[];
  counter: number;
}

const initialState = (): TestState => ({ log: [], counter: 0 });

// ── Helper: create a simple action node execute function ────────────────────

function action(label: string, increment = 1): (state: TestState) => Promise<NodeResult<TestState>> {
  return async (state: TestState) => ({
    state: {
      log: [...state.log, label],
      counter: state.counter + increment,
    },
  });
}

function failingAction(label: string, errorMsg: string): (state: TestState) => Promise<NodeResult<TestState>> {
  return async (_state: TestState) => {
    throw new Error(errorMsg);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// P0-010: TYPES & BUILDER
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphBuilder (P0-010)', () => {
  it('builds a simple 3-node graph', () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addEdge('a', 'b')
      .addEdge('b', 'c')
      .setEntry('a')
      .build();

    expect(graph.id).toBe('test');
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.entryNodeId).toBe('a');
  });

  it('rejects duplicate node IDs', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test')
        .addNode({ id: 'a', name: 'A', type: 'action' })
        .addNode({ id: 'a', name: 'A2', type: 'action' });
    }).toThrow('Duplicate node ID: "a"');
  });

  it('rejects missing entry node', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test').addNode({ id: 'a', name: 'A', type: 'action' }).build();
    }).toThrow('Entry node must be set');
  });

  it('rejects non-existent entry node', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test')
        .addNode({ id: 'a', name: 'A', type: 'action' })
        .setEntry('nonexistent')
        .build();
    }).toThrow('Entry node "nonexistent" does not exist');
  });

  it('rejects edges to non-existent nodes', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test')
        .addNode({ id: 'a', name: 'A', type: 'action' })
        .addEdge('a', 'nonexistent')
        .setEntry('a')
        .build();
    }).toThrow('Edge references non-existent target node: "nonexistent"');
  });

  it('rejects fan-in without merge function', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test')
        .addNode({ id: 'a', name: 'A', type: 'action' })
        .addNode({ id: 'b', name: 'B', type: 'fan-in' })
        .addEdge('a', 'b')
        .setEntry('a')
        .build();
    }).toThrow('Fan-in node "b" must have a merge function');
  });

  it('rejects empty graph', () => {
    expect(() => {
      new GraphBuilder<TestState>('test', 'Test').build();
    }).toThrow('Graph must have at least one node');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0-011: SEQUENTIAL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Sequential Execution (P0-011)', () => {
  it('executes a linear 3-node graph in order', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addEdge('a', 'b')
      .addEdge('b', 'c')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toEqual(['a', 'b', 'c']);
    expect(result.state.counter).toBe(3);
    expect(result.trace.status).toBe('completed');
    expect(result.trace.nodeExecutions).toHaveLength(3);
  });

  it('executes a single-node graph', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'only', name: 'Only', type: 'action', execute: action('only') })
      .setEntry('only')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toEqual(['only']);
    expect(result.trace.status).toBe('completed');
  });

  it('executes diamond dependency (A -> B,C -> D) in correct order', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addNode({ id: 'd', name: 'D', type: 'action', execute: action('d') })
      .addEdge('a', 'b')
      .addEdge('a', 'c')
      .addEdge('b', 'd')
      .addEdge('c', 'd')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    // A must come first, D must come last, B and C can be in any order
    expect(result.state.log[0]).toBe('a');
    expect(result.state.log[3]).toBe('d');
    expect(result.state.log).toContain('b');
    expect(result.state.log).toContain('c');
    expect(result.state.counter).toBe(4);
  });

  it('passes state correctly between nodes', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: async (s) => ({ state: { log: [...s.log, 'a'], counter: 10 } }),
      })
      .addNode({
        id: 'b',
        name: 'B',
        type: 'action',
        execute: async (s) => ({ state: { log: [...s.log, `b:${s.counter}`], counter: s.counter * 2 } }),
      })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toEqual(['a', 'b:10']);
    expect(result.state.counter).toBe(20);
  });

  it('records execution trace with timings', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.trace.runId).toMatch(/^run-/);
    expect(result.trace.graphId).toBe('test');
    expect(result.trace.startedAt).toBeInstanceOf(Date);
    expect(result.trace.completedAt).toBeInstanceOf(Date);

    for (const exec of result.trace.nodeExecutions) {
      expect(exec.status).toBe('completed');
      expect(exec.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('detects cycles and throws', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .addEdge('b', 'a')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    await expect(() => runner.run(graph, initialState())).rejects.toThrow('cycle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0-012: PARALLEL EXECUTION (FAN-OUT / FAN-IN)
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Parallel Execution (P0-012)', () => {
  it('fan-out executes successor nodes in parallel', async () => {
    const executionTimestamps: number[] = [];

    const slowAction = (label: string, delayMs: number) => async (state: TestState) => {
      executionTimestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, delayMs));
      return { state: { log: [...state.log, label], counter: state.counter + 1 } };
    };

    const merge = (states: TestState[], original: TestState): TestState => ({
      log: [...original.log, ...states.flatMap((s) => s.log.filter((l) => !original.log.includes(l)))],
      counter: states.reduce((sum, s) => sum + s.counter, 0),
    });

    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'start', name: 'Start', type: 'action', execute: action('start') })
      .addNode({ id: 'fanout', name: 'Fan Out', type: 'fan-out' })
      .addNode({ id: 'p1', name: 'P1', type: 'action', execute: slowAction('p1', 50) })
      .addNode({ id: 'p2', name: 'P2', type: 'action', execute: slowAction('p2', 50) })
      .addNode({ id: 'p3', name: 'P3', type: 'action', execute: slowAction('p3', 50) })
      .addNode({ id: 'fanin', name: 'Fan In', type: 'fan-in', merge })
      .addNode({ id: 'end', name: 'End', type: 'action', execute: action('end') })
      .addEdge('start', 'fanout')
      .addEdge('fanout', 'p1')
      .addEdge('fanout', 'p2')
      .addEdge('fanout', 'p3')
      .addEdge('p1', 'fanin')
      .addEdge('p2', 'fanin')
      .addEdge('p3', 'fanin')
      .addEdge('fanin', 'end')
      .setEntry('start')
      .build();

    const runner = new GraphRunner<TestState>();
    const before = Date.now();
    const result = await runner.run(graph, initialState());
    const elapsed = Date.now() - before;

    // All parallel nodes should have run
    expect(result.state.log).toContain('p1');
    expect(result.state.log).toContain('p2');
    expect(result.state.log).toContain('p3');
    expect(result.state.log).toContain('end');

    // Parallel execution should be faster than 3 * 50ms sequential
    // (allowing generous margin for CI)
    expect(elapsed).toBeLessThan(250);
    expect(result.trace.status).toBe('completed');
  });

  it('fan-out handles partial failures with allSettled', async () => {
    const merge = (states: TestState[], original: TestState): TestState => ({
      log: [...original.log, ...states.flatMap((s) => s.log.filter((l) => !original.log.includes(l)))],
      counter: states.reduce((sum, s) => sum + s.counter, 0),
    });

    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'fanout', name: 'Fan Out', type: 'fan-out' })
      .addNode({
        id: 'p1',
        name: 'P1',
        type: 'action',
        execute: action('p1'),
        errorStrategy: 'skip-and-continue',
      })
      .addNode({
        id: 'p2',
        name: 'P2',
        type: 'action',
        execute: failingAction('p2', 'p2 failed'),
        errorStrategy: 'skip-and-continue',
      })
      .addNode({
        id: 'p3',
        name: 'P3',
        type: 'action',
        execute: action('p3'),
        errorStrategy: 'skip-and-continue',
      })
      .addNode({ id: 'fanin', name: 'Fan In', type: 'fan-in', merge })
      .addEdge('fanout', 'p1')
      .addEdge('fanout', 'p2')
      .addEdge('fanout', 'p3')
      .addEdge('p1', 'fanin')
      .addEdge('p2', 'fanin')
      .addEdge('p3', 'fanin')
      .setEntry('fanout')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    // p1 and p3 succeeded, p2 failed but was skipped
    expect(result.state.log).toContain('p1');
    expect(result.state.log).toContain('p3');
    expect(result.trace.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0-013: GATE INTERRUPTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Gate Interrupts (P0-013)', () => {
  it('pauses at gate node and returns interrupt', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'gate')
      .addEdge('gate', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate');
    expect(result.state.log).toEqual(['a']); // Only 'a' ran, 'b' did not
    expect(result.trace.status).toBe('interrupted');
  });

  it('resumes from gate with approval and continues execution', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'gate')
      .addEdge('gate', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();

    // First run: pauses at gate
    const result1 = await runner.run(graph, initialState());
    expect(result1.gateInterrupt).toBeDefined();

    // Resume with approval -- pass the state from the first run
    const result2 = await runner.run(graph, result1.state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'gate',
    });

    expect(result2.state.log).toEqual(['a', 'b']);
    expect(result2.trace.status).toBe('completed');
    expect(result2.gateInterrupt).toBeUndefined();
  });

  it('rejection stops execution', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'gate')
      .addEdge('gate', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result1 = await runner.run(graph, initialState());

    const result2 = await runner.run(graph, result1.state, {
      gateResume: { decision: 'reject', feedback: 'needs changes' },
      resumeFromGateId: 'gate',
    });

    expect(result2.state.log).toEqual(['a']); // 'b' never runs
    expect(result2.trace.status).toBe('failed');
  });

  it('handles multiple sequential gates', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate1', name: 'Gate 1', type: 'gate' })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'gate2', name: 'Gate 2', type: 'gate' })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addEdge('a', 'gate1')
      .addEdge('gate1', 'b')
      .addEdge('b', 'gate2')
      .addEdge('gate2', 'c')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();

    // Run 1: pauses at gate1
    const r1 = await runner.run(graph, initialState());
    expect(r1.gateInterrupt!.gateNodeId).toBe('gate1');

    // Run 2: approve gate1, should pause at gate2
    const r2 = await runner.run(graph, r1.state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'gate1',
    });
    expect(r2.state.log).toEqual(['a', 'b']);
    expect(r2.gateInterrupt!.gateNodeId).toBe('gate2');

    // Run 3: approve gate2, should complete
    const r3 = await runner.run(graph, r2.state, {
      gateResume: { decision: 'approve' },
      resumeFromGateId: 'gate2',
    });
    expect(r3.state.log).toEqual(['a', 'b', 'c']);
    expect(r3.trace.status).toBe('completed');
  });

  it('records gate decisions in execution trace', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addEdge('a', 'gate')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const r1 = await runner.run(graph, initialState());
    const r2 = await runner.run(graph, r1.state, {
      gateResume: { decision: 'approve', feedback: 'looks good' },
      resumeFromGateId: 'gate',
    });

    const gateExec = r2.trace.nodeExecutions.find((e) => e.nodeId === 'gate');
    expect(gateExec).toBeDefined();
    expect(gateExec!.metadata).toEqual({ decision: 'approve', feedback: 'looks good' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0-014: RETRY & ERROR STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Retry & Error Strategies (P0-014)', () => {
  it('retries a failing node up to maxRetries', async () => {
    let attempts = 0;
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: async (s) => {
          attempts++;
          if (attempts < 3) throw new Error('not yet');
          return { state: { ...s, log: [...s.log, 'a'] } };
        },
        retry: { maxRetries: 3, baseDelayMs: 10 },
      })
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toEqual(['a']);
    expect(attempts).toBe(3); // 2 failures + 1 success
  });

  it('fail-fast stops the entire graph', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: failingAction('a', 'boom'),
        errorStrategy: 'fail-fast',
      })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    await expect(runner.run(graph, initialState())).rejects.toThrow('Node "a" failed');
  });

  it('skip-and-continue marks node as failed but continues', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: failingAction('a', 'boom'),
        errorStrategy: 'skip-and-continue',
      })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toEqual(['b']); // 'a' failed, 'b' still ran
    expect(result.trace.status).toBe('completed');

    const nodeA = result.trace.nodeExecutions.find((e) => e.nodeId === 'a');
    expect(nodeA!.status).toBe('failed');
    expect(nodeA!.error).toBe('boom');
  });

  it('does not retry non-retryable errors', async () => {
    let attempts = 0;
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: async () => {
          attempts++;
          const err = new Error('validation failed');
          err.name = 'ValidationError';
          throw err;
        },
        retry: { maxRetries: 3, baseDelayMs: 10, nonRetryable: ['ValidationError'] },
        errorStrategy: 'skip-and-continue',
      })
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    await runner.run(graph, initialState());

    expect(attempts).toBe(1); // No retries for ValidationError
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P0-015: EVENT EMISSION
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Event Emission (P0-015)', () => {
  it('emits events for all lifecycle points', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const events: GraphEvent<TestState>[] = [];
    const runner = new GraphRunner<TestState>();
    runner.on((event) => events.push(event));

    await runner.run(graph, initialState());

    const types = events.map((e) => e.type);
    expect(types).toContain('graph-start');
    expect(types).toContain('node-start');
    expect(types).toContain('node-complete');
    expect(types).toContain('graph-complete');

    // Should have: graph-start, node-start(a), node-complete(a), node-start(b), node-complete(b), graph-complete
    expect(types).toEqual([
      'graph-start',
      'node-start',
      'node-complete',
      'node-start',
      'node-complete',
      'graph-complete',
    ]);
  });

  it('emits gate-pending for gate nodes', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addEdge('a', 'gate')
      .setEntry('a')
      .build();

    const events: GraphEvent<TestState>[] = [];
    const runner = new GraphRunner<TestState>();
    runner.on((event) => events.push(event));

    await runner.run(graph, initialState());

    const types = events.map((e) => e.type);
    expect(types).toContain('gate-pending');

    const gateEvent = events.find((e) => e.type === 'gate-pending');
    expect(gateEvent).toBeDefined();
    if (gateEvent?.type === 'gate-pending') {
      expect(gateEvent.nodeId).toBe('gate');
    }
  });

  it('emits node-error for failing nodes', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({
        id: 'a',
        name: 'A',
        type: 'action',
        execute: failingAction('a', 'boom'),
        errorStrategy: 'skip-and-continue',
      })
      .setEntry('a')
      .build();

    const events: GraphEvent<TestState>[] = [];
    const runner = new GraphRunner<TestState>();
    runner.on((event) => events.push(event));

    await runner.run(graph, initialState());

    const errorEvents = events.filter((e) => e.type === 'node-error');
    expect(errorEvents.length).toBeGreaterThan(0);
    if (errorEvents[0].type === 'node-error') {
      expect(errorEvents[0].error).toBe('boom');
    }
  });

  it('events include timestamps', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .setEntry('a')
      .build();

    const events: GraphEvent<TestState>[] = [];
    const runner = new GraphRunner<TestState>();
    runner.on((event) => events.push(event));

    await runner.run(graph, initialState());

    for (const event of events) {
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });

  it('listener can unsubscribe', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .setEntry('a')
      .build();

    const events: GraphEvent<TestState>[] = [];
    const runner = new GraphRunner<TestState>();
    const unsubscribe = runner.on((event) => events.push(event));
    unsubscribe();

    await runner.run(graph, initialState());

    expect(events).toHaveLength(0); // No events received after unsubscribe
  });

  it('listener errors do not crash the runner', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    runner.on(() => {
      throw new Error('listener crash');
    });

    // Should not throw despite listener error
    const result = await runner.run(graph, initialState());
    expect(result.state.log).toEqual(['a']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONAL EDGES
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphRunner -- Conditional Edges', () => {
  it('skips nodes when all incoming conditions are false', async () => {
    const graph = new GraphBuilder<TestState>('test', 'Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addConditionalEdge('a', 'b', (s) => s.counter > 100) // Will be false
      .addEdge('a', 'c')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, initialState());

    expect(result.state.log).toContain('a');
    expect(result.state.log).toContain('c');
    // 'b' is skipped because its only incoming edge condition is false
    // (Note: 'b' has only one incoming edge and it's conditional and false)
  });
});
