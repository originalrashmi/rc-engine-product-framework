/**
 * Tests for GraphRunner.stream() -- async generator interface.
 *
 * Verifies that stream() yields all GraphEvents in correct order and
 * produces the same final state as run().
 */

import { describe, it, expect } from 'vitest';
import { GraphRunner } from '../../src/core/graph/runner.js';
import { GraphBuilder } from '../../src/core/graph/builder.js';
import type { GraphEvent, NodeResult } from '../../src/core/graph/types.js';

// ── Test State ──────────────────────────────────────────────────────────────

interface TestState {
  log: string[];
  counter: number;
}

const initialState = (): TestState => ({ log: [], counter: 0 });

function action(label: string): (state: TestState) => Promise<NodeResult<TestState>> {
  return async (state: TestState) => ({
    state: { log: [...state.log, label], counter: state.counter + 1 },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GraphRunner -- streaming', () => {
  it('yields all events in correct order for a 3-node graph', async () => {
    const graph = new GraphBuilder<TestState>('stream-test', 'Stream Test')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addNode({ id: 'c', name: 'C', type: 'action', execute: action('c') })
      .addEdge('a', 'b')
      .addEdge('b', 'c')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const events: GraphEvent<TestState>[] = [];

    const gen = runner.stream(graph, initialState());
    let iterResult = await gen.next();
    while (!iterResult.done) {
      events.push(iterResult.value);
      iterResult = await gen.next();
    }
    const result = iterResult.value;

    // Verify event types in order
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toEqual([
      'graph-start',
      'node-start',
      'node-complete',
      'node-start',
      'node-complete',
      'node-start',
      'node-complete',
      'graph-complete',
    ]);

    // Verify final state matches
    expect(result.state.log).toEqual(['a', 'b', 'c']);
    expect(result.state.counter).toBe(3);
    expect(result.trace.status).toBe('completed');
  });

  it('stream() and run() produce equivalent final states', async () => {
    const graph = new GraphBuilder<TestState>('equiv-test', 'Equivalence Test')
      .addNode({ id: 'x', name: 'X', type: 'action', execute: action('x') })
      .addNode({ id: 'y', name: 'Y', type: 'action', execute: action('y') })
      .addEdge('x', 'y')
      .setEntry('x')
      .build();

    // Run normally
    const runner1 = new GraphRunner<TestState>();
    const runResult = await runner1.run(graph, initialState());

    // Stream
    const runner2 = new GraphRunner<TestState>();
    const gen = runner2.stream(graph, initialState());
    let iterResult = await gen.next();
    while (!iterResult.done) {
      iterResult = await gen.next();
    }
    const streamResult = iterResult.value;

    expect(streamResult.state).toEqual(runResult.state);
    expect(streamResult.trace.status).toBe(runResult.trace.status);
    expect(streamResult.trace.nodeExecutions.length).toBe(runResult.trace.nodeExecutions.length);
  });

  it('gate interrupt event is yielded before stream terminates', async () => {
    const graph = new GraphBuilder<TestState>('gate-stream', 'Gate Stream')
      .addNode({ id: 'step', name: 'Step', type: 'action', execute: action('step') })
      .addNode({ id: 'gate', name: 'Gate', type: 'gate' })
      .addNode({ id: 'after', name: 'After', type: 'action', execute: action('after') })
      .addEdge('step', 'gate')
      .addEdge('gate', 'after')
      .setEntry('step')
      .build();

    const runner = new GraphRunner<TestState>();
    const events: GraphEvent<TestState>[] = [];

    const gen = runner.stream(graph, initialState());
    let iterResult = await gen.next();
    while (!iterResult.done) {
      events.push(iterResult.value);
      iterResult = await gen.next();
    }
    const result = iterResult.value;

    // Gate-pending should be in the events
    const gateEvent = events.find((e) => e.type === 'gate-pending');
    expect(gateEvent).toBeDefined();
    expect(gateEvent!.type === 'gate-pending' && gateEvent!.nodeId).toBe('gate');

    // Graph-complete with interrupted status
    const completeEvent = events.find((e) => e.type === 'graph-complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent!.type === 'graph-complete' && completeEvent!.status).toBe('interrupted');

    // Result has gate interrupt
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate');

    // After-gate node was NOT executed
    expect(result.state.log).toEqual(['step']);
  });

  it('errors propagate to stream consumer', async () => {
    const graph = new GraphBuilder<TestState>('error-stream', 'Error Stream')
      .addNode({
        id: 'boom',
        name: 'Boom',
        type: 'action',
        execute: async () => {
          throw new Error('Kaboom');
        },
      })
      .setEntry('boom')
      .build();

    const runner = new GraphRunner<TestState>();
    const events: GraphEvent<TestState>[] = [];

    const gen = runner.stream(graph, initialState());

    // Collect events until the error
    await expect(async () => {
      let iterResult = await gen.next();
      while (!iterResult.done) {
        events.push(iterResult.value);
        iterResult = await gen.next();
      }
    }).rejects.toThrow('Kaboom');

    // graph-start and node-start/error events should still have been yielded
    expect(events.some((e) => e.type === 'graph-start')).toBe(true);
    expect(events.some((e) => e.type === 'node-error')).toBe(true);
  });

  it('for-await-of works for consuming events', async () => {
    const graph = new GraphBuilder<TestState>('for-await', 'For Await')
      .addNode({ id: 'a', name: 'A', type: 'action', execute: action('a') })
      .addNode({ id: 'b', name: 'B', type: 'action', execute: action('b') })
      .addEdge('a', 'b')
      .setEntry('a')
      .build();

    const runner = new GraphRunner<TestState>();
    const eventTypes: string[] = [];

    // for-await-of consumes yielded values (but not the return value)
    for await (const event of runner.stream(graph, initialState())) {
      eventTypes.push(event.type);
    }

    expect(eventTypes).toContain('graph-start');
    expect(eventTypes).toContain('node-start');
    expect(eventTypes).toContain('node-complete');
    expect(eventTypes).toContain('graph-complete');
  });

  it('fan-out/fan-in events are streamed', async () => {
    const graph = new GraphBuilder<TestState>('fanout-stream', 'Fan-out Stream')
      .addNode({ id: 'start', name: 'Start', type: 'fan-out' })
      .addNode({ id: 'w1', name: 'Worker 1', type: 'action', execute: action('w1') })
      .addNode({ id: 'w2', name: 'Worker 2', type: 'action', execute: action('w2') })
      .addNode({
        id: 'merge',
        name: 'Merge',
        type: 'fan-in',
        merge: (states, original) => ({
          ...original,
          log: states.flatMap((s) => s.log),
          counter: states.reduce((sum, s) => sum + s.counter, 0),
        }),
      })
      .addNode({ id: 'end', name: 'End', type: 'action', execute: action('end') })
      .addEdge('start', 'w1')
      .addEdge('start', 'w2')
      .addEdge('w1', 'merge')
      .addEdge('w2', 'merge')
      .addEdge('merge', 'end')
      .setEntry('start')
      .build();

    const runner = new GraphRunner<TestState>();
    const eventTypes: string[] = [];

    for await (const event of runner.stream(graph, initialState())) {
      eventTypes.push(event.type);
    }

    // Should include fan-out node events and worker events
    expect(eventTypes.filter((t) => t === 'node-start').length).toBeGreaterThanOrEqual(3); // w1, w2, end (+ fan-out start)
    expect(eventTypes.filter((t) => t === 'node-complete').length).toBeGreaterThanOrEqual(3);
    expect(eventTypes).toContain('graph-start');
    expect(eventTypes).toContain('graph-complete');
  });
});
