/**
 * Tests for Budget module -- Cost tracking, budgets, circuit breaker.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../../src/core/budget/cost-tracker.js';
import { CircuitBreaker } from '../../src/core/budget/circuit-breaker.js';

// ── CostTracker ─────────────────────────────────────────────────────────────

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  // ── Recording ─────────────────────────────────────────────────────────

  describe('recording', () => {
    it('records an LLM call and returns cost', () => {
      const cost = tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Orchestrator',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });

      // 1000/1M * $3 + 500/1M * $15 = $0.003 + $0.0075 = $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('uses fallback rate for unknown models', () => {
      const cost = tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Agent',
        provider: 'custom',
        model: 'unknown-model-xyz',
        inputTokens: 1000,
        outputTokens: 500,
      });

      // Fallback: 1000/1M * $3 + 500/1M * $15 = $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('supports custom cost rates', () => {
      tracker = new CostTracker({
        'my-model': { inputPerMTok: 1.0, outputPerMTok: 2.0 },
      });

      const cost = tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Agent',
        provider: 'custom',
        model: 'my-model',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // 1M/1M * $1 + 1M/1M * $2 = $3.00
      expect(cost).toBeCloseTo(3.0, 2);
    });

    it('records timestamp on each record', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Agent',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 100,
        outputTokens: 50,
      });

      const records = tracker.getRecords('pipe-1');
      expect(records).toHaveLength(1);
      expect(records[0].timestamp).toBeTruthy();
      // Should be valid ISO date
      expect(new Date(records[0].timestamp).getTime()).not.toBeNaN();
    });
  });

  // ── Summaries ─────────────────────────────────────────────────────────

  describe('summaries', () => {
    it('aggregates cost by provider', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Agent',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'Agent',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        inputTokens: 2000,
        outputTokens: 1000,
      });

      const summary = tracker.getSummary('pipe-1');

      expect(summary.totalCalls).toBe(2);
      expect(summary.byProvider.claude.calls).toBe(1);
      expect(summary.byProvider.gemini.calls).toBe(1);
      expect(summary.byProvider.gemini.costUsd).toBeLessThan(summary.byProvider.claude.costUsd);
    });

    it('aggregates cost by domain', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'pre-rc',
        tool: 'Persona-1',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'pre-rc',
        tool: 'Persona-2',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'post-rc',
        tool: 'Scanner',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 500,
        outputTokens: 200,
      });

      const summary = tracker.getSummary('pipe-1');

      expect(summary.byDomain['pre-rc'].calls).toBe(2);
      expect(summary.byDomain['post-rc'].calls).toBe(1);
    });

    it('filters by pipelineId', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-2',
        domain: 'rc',
        tool: 'B',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 2000,
        outputTokens: 1000,
      });

      const s1 = tracker.getSummary('pipe-1');
      const s2 = tracker.getSummary('pipe-2');

      expect(s1.totalCalls).toBe(1);
      expect(s2.totalCalls).toBe(1);
      expect(s2.totalCostUsd).toBeGreaterThan(s1.totalCostUsd);
    });

    it('returns all records when no pipelineId specified', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-2',
        domain: 'rc',
        tool: 'B',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(2);
    });

    it('tracks input and output tokens separately', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 3000,
        outputTokens: 1000,
      });

      const summary = tracker.getSummary('pipe-1');
      expect(summary.totalInputTokens).toBe(3000);
      expect(summary.totalOutputTokens).toBe(1000);
      expect(summary.byProvider.claude.inputTokens).toBe(3000);
      expect(summary.byProvider.claude.outputTokens).toBe(1000);
    });
  });

  // ── Budgets ───────────────────────────────────────────────────────────

  describe('budgets', () => {
    it('tracks remaining budget', () => {
      tracker.setBudget('pipe-1', { maxCostUsd: 1.0 });

      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        inputTokens: 100_000,
        outputTokens: 50_000,
      });

      const remaining = tracker.getRemainingBudget('pipe-1');
      expect(remaining).not.toBeNull();
      expect(remaining!).toBeLessThan(1.0);
      expect(remaining!).toBeGreaterThan(0);
    });

    it('returns null remaining for pipelines without budget', () => {
      expect(tracker.getRemainingBudget('no-budget')).toBeNull();
    });

    it('detects over-budget pipelines', () => {
      tracker.setBudget('pipe-1', { maxCostUsd: 0.001 });

      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 10_000,
        outputTokens: 5_000,
      });

      expect(tracker.isOverBudget('pipe-1')).toBe(true);
    });

    it('reports not over budget when spending is within limit', () => {
      tracker.setBudget('pipe-1', { maxCostUsd: 100.0 });

      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(tracker.isOverBudget('pipe-1')).toBe(false);
    });

    it('reports not over budget when no budget is set', () => {
      expect(tracker.isOverBudget('no-budget')).toBe(false);
    });

    it('emits warning at threshold', () => {
      const events: { type: string; percentUsed: number }[] = [];
      tracker.onBudget((e) => events.push({ type: e.type, percentUsed: e.percentUsed }));

      tracker.setBudget('pipe-1', { maxCostUsd: 0.01, warnThreshold: 0.5 });

      // Record a call that costs ~$0.0105 (exceeds $0.01 budget)
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });

      // Should have emitted an exceeded event (not just warn, since we blew past both)
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.type === 'exceeded')).toBe(true);
    });

    it('emits warning only once per pipeline', () => {
      const events: string[] = [];
      tracker.onBudget((e) => events.push(e.type));

      tracker.setBudget('pipe-1', { maxCostUsd: 1.0, warnThreshold: 0.01 });

      // Two small calls that should both be over the warn threshold
      for (let i = 0; i < 3; i++) {
        tracker.record({
          pipelineId: 'pipe-1',
          domain: 'rc',
          tool: 'A',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          inputTokens: 100_000,
          outputTokens: 50_000,
        });
      }

      // warn should only fire once
      const warns = events.filter((e) => e === 'warn');
      expect(warns).toHaveLength(1);
    });

    it('unsubscribe removes listener', () => {
      const events: string[] = [];
      const unsub = tracker.onBudget((e) => events.push(e.type));

      tracker.setBudget('pipe-1', { maxCostUsd: 0.001 });
      unsub();

      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 10_000,
        outputTokens: 5_000,
      });

      expect(events).toHaveLength(0);
    });
  });

  // ── Estimation ────────────────────────────────────────────────────────

  describe('estimation', () => {
    it('estimates cost without recording', () => {
      const cost = tracker.estimate('claude-sonnet-4-5-20250929', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 4);

      // No records should have been created
      expect(tracker.getRecords()).toHaveLength(0);
    });

    it('uses fallback rate for unknown models', () => {
      const cost = tracker.estimate('unknown-model', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 4); // Same as fallback rate
    });
  });

  // ── Records ───────────────────────────────────────────────────────────

  describe('records', () => {
    it('returns records filtered by pipeline', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });
      tracker.record({
        pipelineId: 'pipe-2',
        domain: 'rc',
        tool: 'B',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(tracker.getRecords('pipe-1')).toHaveLength(1);
      expect(tracker.getRecords('pipe-2')).toHaveLength(1);
      expect(tracker.getRecords()).toHaveLength(2);
    });

    it('reset clears all records', () => {
      tracker.record({
        pipelineId: 'pipe-1',
        domain: 'rc',
        tool: 'A',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
      });

      tracker.reset();
      expect(tracker.getRecords()).toHaveLength(0);
    });
  });

  // ── Rate Lookup ───────────────────────────────────────────────────────

  describe('rate lookup', () => {
    it('returns known model rate', () => {
      const rate = tracker.getRate('gpt-4o');
      expect(rate.inputPerMTok).toBe(2.5);
      expect(rate.outputPerMTok).toBe(10.0);
    });

    it('returns fallback for unknown model', () => {
      const rate = tracker.getRate('nonexistent');
      expect(rate.inputPerMTok).toBe(3.0);
      expect(rate.outputPerMTok).toBe(15.0);
    });
  });
});

// ── CircuitBreaker ──────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, successThreshold: 1 });
  });

  // ── Basic State Transitions ───────────────────────────────────────────

  describe('state transitions', () => {
    it('starts in closed state', () => {
      expect(breaker.getStatus('claude').state).toBe('closed');
    });

    it('allows requests in closed state', () => {
      expect(breaker.canRequest('claude')).toBe(true);
    });

    it('opens after reaching failure threshold', () => {
      breaker.recordFailure('claude');
      breaker.recordFailure('claude');
      expect(breaker.getStatus('claude').state).toBe('closed');

      breaker.recordFailure('claude');
      expect(breaker.getStatus('claude').state).toBe('open');
    });

    it('blocks requests in open state', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure('claude');

      expect(breaker.canRequest('claude')).toBe(false);
    });

    it('transitions to half-open after reset timeout', async () => {
      breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

      breaker.recordFailure('claude');
      expect(breaker.getStatus('claude').state).toBe('open');

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));

      expect(breaker.canRequest('claude')).toBe(true);
      expect(breaker.getStatus('claude').state).toBe('half-open');
    });

    it('closes from half-open after success threshold', async () => {
      breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50, successThreshold: 1 });

      breaker.recordFailure('claude');
      await new Promise((r) => setTimeout(r, 60));

      breaker.canRequest('claude'); // Move to half-open
      breaker.recordSuccess('claude');

      expect(breaker.getStatus('claude').state).toBe('closed');
    });

    it('reopens from half-open on failure', async () => {
      breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

      breaker.recordFailure('claude');
      await new Promise((r) => setTimeout(r, 60));

      breaker.canRequest('claude'); // Move to half-open
      breaker.recordFailure('claude');

      expect(breaker.getStatus('claude').state).toBe('open');
    });
  });

  // ── Counters ──────────────────────────────────────────────────────────

  describe('counters', () => {
    it('tracks consecutive failures', () => {
      breaker.recordFailure('claude');
      breaker.recordFailure('claude');

      expect(breaker.getStatus('claude').consecutiveFailures).toBe(2);
    });

    it('resets consecutive failures on success', () => {
      breaker.recordFailure('claude');
      breaker.recordSuccess('claude');

      expect(breaker.getStatus('claude').consecutiveFailures).toBe(0);
    });

    it('tracks total failures and successes', () => {
      breaker.recordSuccess('claude');
      breaker.recordSuccess('claude');
      breaker.recordFailure('claude');
      breaker.recordSuccess('claude');

      const status = breaker.getStatus('claude');
      expect(status.totalSuccesses).toBe(3);
      expect(status.totalFailures).toBe(1);
    });

    it('records last failure time', () => {
      const before = Date.now();
      breaker.recordFailure('claude');
      const after = Date.now();

      const status = breaker.getStatus('claude');
      expect(status.lastFailureTime).not.toBeNull();
      expect(status.lastFailureTime!).toBeGreaterThanOrEqual(before);
      expect(status.lastFailureTime!).toBeLessThanOrEqual(after);
    });
  });

  // ── Per-Provider Isolation ────────────────────────────────────────────

  describe('per-provider isolation', () => {
    it('tracks providers independently', () => {
      breaker.recordFailure('claude');
      breaker.recordFailure('claude');
      breaker.recordFailure('claude');

      expect(breaker.getStatus('claude').state).toBe('open');
      expect(breaker.getStatus('openai').state).toBe('closed');
      expect(breaker.canRequest('openai')).toBe(true);
    });

    it('returns all statuses', () => {
      breaker.canRequest('claude');
      breaker.canRequest('openai');

      const statuses = breaker.getAllStatuses();
      expect(Object.keys(statuses)).toContain('claude');
      expect(Object.keys(statuses)).toContain('openai');
    });
  });

  // ── Manual Reset ──────────────────────────────────────────────────────

  describe('manual reset', () => {
    it('resets circuit to closed', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure('claude');
      expect(breaker.getStatus('claude').state).toBe('open');

      breaker.resetCircuit('claude');
      expect(breaker.getStatus('claude').state).toBe('closed');
      expect(breaker.getStatus('claude').consecutiveFailures).toBe(0);
    });

    it('emits state change event on reset', () => {
      const events: { previousState: string; newState: string }[] = [];
      breaker.onStateChange((e) => events.push({ previousState: e.previousState, newState: e.newState }));

      for (let i = 0; i < 3; i++) breaker.recordFailure('claude');
      breaker.resetCircuit('claude');

      // Should have: closed->open (from failures), open->closed (from reset)
      expect(events).toHaveLength(2);
      expect(events[1].previousState).toBe('open');
      expect(events[1].newState).toBe('closed');
    });

    it('does not emit event if already closed', () => {
      const events: string[] = [];
      breaker.onStateChange(() => events.push('change'));

      breaker.resetCircuit('claude');
      expect(events).toHaveLength(0);
    });
  });

  // ── Event Listener ────────────────────────────────────────────────────

  describe('event listener', () => {
    it('emits on state transitions', () => {
      const events: { provider: string; previousState: string; newState: string }[] = [];
      breaker.onStateChange((e) =>
        events.push({ provider: e.provider, previousState: e.previousState, newState: e.newState }),
      );

      for (let i = 0; i < 3; i++) breaker.recordFailure('claude');

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ provider: 'claude', previousState: 'closed', newState: 'open' });
    });

    it('unsubscribe works', () => {
      const events: string[] = [];
      const unsub = breaker.onStateChange(() => events.push('event'));

      unsub();
      for (let i = 0; i < 3; i++) breaker.recordFailure('claude');

      expect(events).toHaveLength(0);
    });

    it('handles listener errors gracefully', () => {
      breaker.onStateChange(() => {
        throw new Error('listener crash');
      });

      // Should not throw
      expect(() => {
        for (let i = 0; i < 3; i++) breaker.recordFailure('claude');
      }).not.toThrow();
    });
  });

  // ── Default Config ────────────────────────────────────────────────────

  describe('default config', () => {
    it('uses defaults when no config provided', () => {
      breaker = new CircuitBreaker();

      // Default failure threshold is 3
      breaker.recordFailure('test');
      breaker.recordFailure('test');
      expect(breaker.getStatus('test').state).toBe('closed');

      breaker.recordFailure('test');
      expect(breaker.getStatus('test').state).toBe('open');
    });
  });
});
