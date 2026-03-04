/**
 * Tests for dynamic send (fan-out at runtime) in GraphRunner.
 *
 * The `send` field on NodeResult allows action nodes to dynamically
 * spawn parallel executions, equivalent to LangGraph's Send() primitive.
 */

import { describe, it, expect } from 'vitest';
import { GraphRunner } from '../../src/core/graph/runner.js';
import { GraphBuilder } from '../../src/core/graph/builder.js';

// ── Test State ──────────────────────────────────────────────────────────────

interface TestState {
  items: string[];
  processed: string[];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GraphRunner -- dynamic send', () => {
  it('dispatches to a single worker and merges via fan-in', async () => {
    const graph = new GraphBuilder<TestState>('send-test', 'Send Test')
      .addNode({
        id: 'dispatcher',
        name: 'Dispatcher',
        type: 'action',
        execute: async (state) => ({
          state,
          send: [{ nodeId: 'worker', state: { ...state, items: ['a'] } }],
        }),
      })
      .addNode({
        id: 'worker',
        name: 'Worker',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: [...state.processed, `done:${state.items[0]}`] },
        }),
      })
      .addNode({
        id: 'merge',
        name: 'Merge',
        type: 'fan-in',
        merge: (states, original) => ({
          ...original,
          processed: states.flatMap((s) => s.processed),
        }),
      })
      .addEdge('dispatcher', 'worker')
      .addEdge('worker', 'merge')
      .setEntry('dispatcher')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: [], processed: [] });

    expect(result.state.processed).toEqual(['done:a']);
    expect(result.trace.status).toBe('completed');
  });

  it('dispatches to multiple workers in parallel', async () => {
    const executionLog: string[] = [];

    const graph = new GraphBuilder<TestState>('multi-send', 'Multi Send')
      .addNode({
        id: 'dispatcher',
        name: 'Dispatcher',
        type: 'action',
        execute: async (state) => ({
          state,
          send: [
            { nodeId: 'worker', state: { ...state, items: ['a'] } },
            { nodeId: 'worker', state: { ...state, items: ['b'] } },
            { nodeId: 'worker', state: { ...state, items: ['c'] } },
          ],
        }),
      })
      .addNode({
        id: 'worker',
        name: 'Worker',
        type: 'action',
        execute: async (state) => {
          const item = state.items[0];
          executionLog.push(item);
          return {
            state: { ...state, processed: [...state.processed, `done:${item}`] },
          };
        },
      })
      .addNode({
        id: 'merge',
        name: 'Merge',
        type: 'fan-in',
        merge: (states, original) => ({
          ...original,
          processed: states.flatMap((s) => s.processed),
        }),
      })
      .addEdge('dispatcher', 'worker')
      .addEdge('worker', 'merge')
      .setEntry('dispatcher')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: ['a', 'b', 'c'], processed: [] });

    // All 3 workers should have executed
    expect(executionLog).toHaveLength(3);
    expect(executionLog.sort()).toEqual(['a', 'b', 'c']);

    // Merged results should contain all 3
    expect(result.state.processed).toHaveLength(3);
    expect(result.state.processed.sort()).toEqual(['done:a', 'done:b', 'done:c']);
  });

  it('handles partial failure -- surviving workers still merge', async () => {
    let callCount = 0;

    const graph = new GraphBuilder<TestState>('partial-fail', 'Partial Fail')
      .addNode({
        id: 'dispatcher',
        name: 'Dispatcher',
        type: 'action',
        execute: async (state) => ({
          state,
          send: [
            { nodeId: 'worker', state: { ...state, items: ['ok-1'] } },
            { nodeId: 'worker', state: { ...state, items: ['fail'] } },
            { nodeId: 'worker', state: { ...state, items: ['ok-2'] } },
          ],
        }),
      })
      .addNode({
        id: 'worker',
        name: 'Worker',
        type: 'action',
        errorStrategy: 'skip-and-continue',
        execute: async (state) => {
          callCount++;
          if (state.items[0] === 'fail') {
            throw new Error('Worker failed');
          }
          return {
            state: { ...state, processed: [...state.processed, `done:${state.items[0]}`] },
          };
        },
      })
      .addNode({
        id: 'merge',
        name: 'Merge',
        type: 'fan-in',
        merge: (states, original) => ({
          ...original,
          processed: states.flatMap((s) => s.processed),
        }),
      })
      .addEdge('dispatcher', 'worker')
      .addEdge('worker', 'merge')
      .setEntry('dispatcher')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: [], processed: [] });

    // All 3 workers attempted
    expect(callCount).toBe(3);

    // Only 2 succeeded
    expect(result.state.processed).toHaveLength(2);
    expect(result.state.processed.sort()).toEqual(['done:ok-1', 'done:ok-2']);
  });

  it('no send -- normal execution unaffected', async () => {
    const graph = new GraphBuilder<TestState>('no-send', 'No Send')
      .addNode({
        id: 'step-1',
        name: 'Step 1',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: ['step-1'] },
          // No send field
        }),
      })
      .addNode({
        id: 'step-2',
        name: 'Step 2',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: [...state.processed, 'step-2'] },
        }),
      })
      .addEdge('step-1', 'step-2')
      .setEntry('step-1')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: [], processed: [] });

    expect(result.state.processed).toEqual(['step-1', 'step-2']);
    expect(result.trace.status).toBe('completed');
  });

  it('send with empty array behaves like no send', async () => {
    const graph = new GraphBuilder<TestState>('empty-send', 'Empty Send')
      .addNode({
        id: 'step-1',
        name: 'Step 1',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: ['step-1'] },
          send: [], // Empty send
        }),
      })
      .addNode({
        id: 'step-2',
        name: 'Step 2',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: [...state.processed, 'step-2'] },
        }),
      })
      .addEdge('step-1', 'step-2')
      .setEntry('step-1')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: [], processed: [] });

    expect(result.state.processed).toEqual(['step-1', 'step-2']);
  });

  it('send followed by a gate -- graph pauses correctly', async () => {
    const graph = new GraphBuilder<TestState>('send-gate', 'Send then Gate')
      .addNode({
        id: 'dispatcher',
        name: 'Dispatcher',
        type: 'action',
        execute: async (state) => ({
          state,
          send: [
            { nodeId: 'worker', state: { ...state, items: ['x'] } },
            { nodeId: 'worker', state: { ...state, items: ['y'] } },
          ],
        }),
      })
      .addNode({
        id: 'worker',
        name: 'Worker',
        type: 'action',
        execute: async (state) => ({
          state: { ...state, processed: [...state.processed, state.items[0]] },
        }),
      })
      .addNode({
        id: 'merge',
        name: 'Merge',
        type: 'fan-in',
        merge: (states, original) => ({
          ...original,
          processed: states.flatMap((s) => s.processed),
        }),
      })
      .addNode({
        id: 'review-gate',
        name: 'Review Gate',
        type: 'gate',
      })
      .addEdge('dispatcher', 'worker')
      .addEdge('worker', 'merge')
      .addEdge('merge', 'review-gate')
      .setEntry('dispatcher')
      .build();

    const runner = new GraphRunner<TestState>();
    const result = await runner.run(graph, { items: [], processed: [] });

    // Should stop at gate after send+merge
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('review-gate');
    expect(result.state.processed.sort()).toEqual(['x', 'y']);
  });
});
