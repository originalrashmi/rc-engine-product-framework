/**
 * Tests for Observability module -- EventBus and Tracer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/observability/event-bus.js';
import { Tracer } from '../../src/core/observability/tracer.js';
import type { EngineEvent } from '../../src/core/observability/event-bus.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

// ── EventBus ────────────────────────────────────────────────────────────────

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('wildcard listeners', () => {
    it('receives all events', () => {
      const events: EngineEvent[] = [];
      bus.onAll((e) => events.push(e));

      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('pipeline:start');
      expect(events[1].type).toBe('node:start');
    });

    it('unsubscribe stops receiving events', () => {
      const events: EngineEvent[] = [];
      const unsub = bus.onAll((e) => events.push(e));

      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      unsub();
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });

      expect(events).toHaveLength(1);
    });

    it('handles listener errors gracefully', () => {
      bus.onAll(() => {
        throw new Error('crash');
      });
      const events: EngineEvent[] = [];
      bus.onAll((e) => events.push(e));

      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });

      // Second listener should still receive the event
      expect(events).toHaveLength(1);
    });
  });

  describe('channel listeners', () => {
    it('receives only matching event types', () => {
      const nodeEvents: EngineEvent[] = [];
      bus.on('node:start', (e) => nodeEvents.push(e));

      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({ type: 'node:complete', timestamp: now(), pipelineId: 'p1', nodeId: 'n1', durationMs: 100 });

      expect(nodeEvents).toHaveLength(1);
      expect(nodeEvents[0].type).toBe('node:start');
    });

    it('unsubscribe stops channel listener', () => {
      const events: EngineEvent[] = [];
      const unsub = bus.on('node:start', (e) => events.push(e));

      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      unsub();
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n2' });

      expect(events).toHaveLength(1);
    });

    it('handles listener errors gracefully', () => {
      bus.on('node:start', () => {
        throw new Error('crash');
      });

      expect(() => {
        bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      }).not.toThrow();
    });

    it('supports multiple listeners on same channel', () => {
      const events1: EngineEvent[] = [];
      const events2: EngineEvent[] = [];
      bus.on('node:start', (e) => events1.push(e));
      bus.on('node:start', (e) => events2.push(e));

      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  describe('history', () => {
    it('stores event history', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });

      const history = bus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('filters history by type', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n2' });

      const nodeStarts = bus.getHistory({ type: 'node:start' });
      expect(nodeStarts).toHaveLength(2);
    });

    it('filters history by pipelineId', () => {
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p2', nodeId: 'n1' });

      const p1Events = bus.getHistory({ pipelineId: 'p1' });
      expect(p1Events).toHaveLength(1);
    });

    it('respects history size limit', () => {
      bus = new EventBus({ historySize: 3 });

      for (let i = 0; i < 5; i++) {
        bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: `n${i}` });
      }

      expect(bus.getHistory()).toHaveLength(3);
    });

    it('clears history', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.clearHistory();

      expect(bus.getHistory()).toHaveLength(0);
    });

    it('returns a copy (not a reference)', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });

      const history = bus.getHistory();
      history.pop();

      expect(bus.getHistory()).toHaveLength(1);
    });
  });

  describe('listener count', () => {
    it('counts all listeners', () => {
      bus.onAll(() => {});
      bus.on('node:start', () => {});
      bus.on('node:complete', () => {});

      expect(bus.listenerCount()).toBe(3);
    });

    it('decrements on unsubscribe', () => {
      const unsub1 = bus.onAll(() => {});
      const unsub2 = bus.on('node:start', () => {});

      expect(bus.listenerCount()).toBe(2);

      unsub1();
      expect(bus.listenerCount()).toBe(1);

      unsub2();
      expect(bus.listenerCount()).toBe(0);
    });
  });
});

// ── Tracer ──────────────────────────────────────────────────────────────────

describe('Tracer', () => {
  let bus: EventBus;
  let tracer: Tracer;

  beforeEach(() => {
    bus = new EventBus();
    tracer = new Tracer();
    tracer.attach(bus);
  });

  describe('pipeline tracing', () => {
    it('creates a trace on pipeline start', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });

      const trace = tracer.getTrace('p1');
      expect(trace).toBeDefined();
      expect(trace!.pipelineId).toBe('p1');
      expect(trace!.graphId).toBe('g1');
      expect(trace!.status).toBe('running');
    });

    it('completes a trace on pipeline complete', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({
        type: 'pipeline:complete',
        timestamp: now(),
        pipelineId: 'p1',
        graphId: 'g1',
        status: 'completed',
        durationMs: 5000,
      });

      const trace = tracer.getTrace('p1');
      expect(trace!.status).toBe('completed');
      expect(trace!.durationMs).toBe(5000);
    });

    it('marks failed pipeline', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({
        type: 'pipeline:complete',
        timestamp: now(),
        pipelineId: 'p1',
        graphId: 'g1',
        status: 'failed',
        durationMs: 1000,
      });

      expect(tracer.getTrace('p1')!.status).toBe('failed');
    });

    it('marks interrupted pipeline', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({
        type: 'pipeline:complete',
        timestamp: now(),
        pipelineId: 'p1',
        graphId: 'g1',
        status: 'interrupted',
        durationMs: 2000,
      });

      expect(tracer.getTrace('p1')!.status).toBe('interrupted');
    });
  });

  describe('node tracing', () => {
    it('tracks node start and complete', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'node:complete',
        timestamp: now(),
        pipelineId: 'p1',
        nodeId: 'n1',
        durationMs: 500,
        metadata: { tokensUsed: 100 },
      });

      const trace = tracer.getTrace('p1');
      expect(trace!.nodes).toHaveLength(1);
      expect(trace!.nodes[0].nodeId).toBe('n1');
      expect(trace!.nodes[0].status).toBe('completed');
      expect(trace!.nodes[0].durationMs).toBe(500);
    });

    it('tracks node errors', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'node:error',
        timestamp: now(),
        pipelineId: 'p1',
        nodeId: 'n1',
        error: 'API timeout',
        retryCount: 2,
        willRetry: false,
      });

      const trace = tracer.getTrace('p1');
      expect(trace!.nodes[0].status).toBe('failed');
      expect(trace!.nodes[0].error).toBe('API timeout');
      expect(trace!.nodes[0].retryCount).toBe(2);
    });

    it('keeps node running during retries', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'node:error',
        timestamp: now(),
        pipelineId: 'p1',
        nodeId: 'n1',
        error: 'Transient error',
        retryCount: 0,
        willRetry: true,
      });

      const trace = tracer.getTrace('p1');
      expect(trace!.nodes[0].status).toBe('running');
    });
  });

  describe('LLM call tracing', () => {
    it('tracks LLM calls as children of node spans', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'llm:start',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        tool: 'Orchestrator',
      });
      bus.emit({
        type: 'llm:complete',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        tool: 'Orchestrator',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0105,
        durationMs: 2000,
      });

      const trace = tracer.getTrace('p1');
      const nodeSpan = trace!.nodes[0];
      expect(nodeSpan.children).toHaveLength(1);
      expect(nodeSpan.children[0].provider).toBe('claude');
      expect(nodeSpan.children[0].inputTokens).toBe(1000);
      expect(nodeSpan.children[0].costUsd).toBe(0.0105);
      expect(nodeSpan.children[0].status).toBe('completed');
    });

    it('accumulates cost totals on pipeline trace', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'llm:complete',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        tool: 'A',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.01,
        durationMs: 1000,
      });
      bus.emit({
        type: 'llm:complete',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        tool: 'B',
        inputTokens: 2000,
        outputTokens: 800,
        costUsd: 0.001,
        durationMs: 500,
      });

      const trace = tracer.getTrace('p1');
      expect(trace!.totalCostUsd).toBeCloseTo(0.011, 4);
      expect(trace!.totalInputTokens).toBe(3000);
      expect(trace!.totalOutputTokens).toBe(1300);
    });

    it('tracks LLM errors', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'llm:start',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'openai',
        model: 'gpt-4o',
        tool: 'Agent',
      });
      bus.emit({
        type: 'llm:error',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'openai',
        model: 'gpt-4o',
        tool: 'Agent',
        error: 'Rate limited',
      });

      const nodeSpan = tracer.getTrace('p1')!.nodes[0];
      expect(nodeSpan.children[0].status).toBe('failed');
      expect(nodeSpan.children[0].error).toBe('Rate limited');
    });
  });

  describe('progress reporting', () => {
    it('reports progress during execution', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'node:complete',
        timestamp: now(),
        pipelineId: 'p1',
        nodeId: 'n1',
        durationMs: 100,
      });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n2' });

      const progress = tracer.getProgress('p1');
      expect(progress).not.toBeNull();
      expect(progress!.totalNodes).toBe(2);
      expect(progress!.completedNodes).toBe(1);
      expect(progress!.runningNodes).toBe(1);
      expect(progress!.percentComplete).toBe(50);
    });

    it('returns null for unknown pipeline', () => {
      expect(tracer.getProgress('nonexistent')).toBeNull();
    });

    it('includes cost in progress', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'node:start', timestamp: now(), pipelineId: 'p1', nodeId: 'n1' });
      bus.emit({
        type: 'llm:complete',
        timestamp: now(),
        pipelineId: 'p1',
        provider: 'claude',
        model: 'x',
        tool: 'A',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.05,
        durationMs: 100,
      });

      const progress = tracer.getProgress('p1');
      expect(progress!.totalCostUsd).toBe(0.05);
    });
  });

  describe('serialization', () => {
    it('serializes a trace', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });

      const serialized = tracer.serialize('p1');
      expect(serialized).not.toBeNull();
      expect(serialized!.pipelineId).toBe('p1');
      // Should be a deep copy
      expect(serialized).not.toBe(tracer.getTrace('p1'));
    });

    it('returns null for unknown pipeline', () => {
      expect(tracer.serialize('nonexistent')).toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('getAllTraces returns all tracked pipelines', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p2', graphId: 'g2' });

      expect(tracer.getAllTraces()).toHaveLength(2);
    });

    it('clear removes all traces', () => {
      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });
      tracer.clear();

      expect(tracer.getAllTraces()).toHaveLength(0);
    });

    it('detach stops receiving events', () => {
      tracer.detach();

      bus.emit({ type: 'pipeline:start', timestamp: now(), pipelineId: 'p1', graphId: 'g1' });

      expect(tracer.getTrace('p1')).toBeUndefined();
    });
  });
});
