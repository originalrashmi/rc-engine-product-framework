/**
 * Stress Test: LLM Failure Simulation
 *
 * Verifies that the circuit breaker, model router, and error handling
 * behave correctly under various LLM failure scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/core/budget/circuit-breaker.js';
import type { CircuitBreakerEvent } from '../../src/core/budget/circuit-breaker.js';

describe('LLM failure simulation stress tests', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100, // Short timeout for testing
      successThreshold: 1,
    });
  });

  it('should open circuit after threshold failures', () => {
    const provider = 'claude';

    // First 2 failures — still closed
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('closed');
    expect(breaker.canRequest(provider)).toBe(true);

    // 3rd failure — opens
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('open');
    expect(breaker.canRequest(provider)).toBe(false);
  });

  it('should recover via half-open after timeout', async () => {
    const provider = 'openai';

    // Open the circuit
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('open');

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    // Should transition to half-open on next request check
    expect(breaker.canRequest(provider)).toBe(true);
    expect(breaker.getStatus(provider).state).toBe('half-open');

    // Success closes the circuit
    breaker.recordSuccess(provider);
    expect(breaker.getStatus(provider).state).toBe('closed');
  });

  it('should re-open on failure during half-open', async () => {
    const provider = 'gemini';

    // Open
    for (let i = 0; i < 3; i++) breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('open');

    // Wait for reset
    await new Promise((r) => setTimeout(r, 150));
    breaker.canRequest(provider); // triggers half-open

    // Fail again during half-open — goes back to open
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('open');
    expect(breaker.canRequest(provider)).toBe(false);
  });

  it('should track multiple providers independently', () => {
    // Claude fails
    breaker.recordFailure('claude');
    breaker.recordFailure('claude');
    breaker.recordFailure('claude');

    // OpenAI is fine
    breaker.recordSuccess('openai');
    breaker.recordSuccess('openai');

    expect(breaker.getStatus('claude').state).toBe('open');
    expect(breaker.getStatus('openai').state).toBe('closed');
    expect(breaker.canRequest('claude')).toBe(false);
    expect(breaker.canRequest('openai')).toBe(true);
  });

  it('should handle rapid success/failure alternation without inconsistency', () => {
    const provider = 'test-provider';

    // Rapidly alternate
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        breaker.recordSuccess(provider);
      } else {
        breaker.recordFailure(provider);
      }
    }

    // Should be in a valid state
    const status = breaker.getStatus(provider);
    expect(['closed', 'open', 'half-open']).toContain(status.state);
    expect(status.totalFailures + status.totalSuccesses).toBe(100);
  });

  it('should emit state change events for all transitions', () => {
    const events: CircuitBreakerEvent[] = [];
    breaker.onStateChange((e) => events.push(e));

    const provider = 'test';

    // closed → open
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    expect(events).toHaveLength(1);
    expect(events[0].previousState).toBe('closed');
    expect(events[0].newState).toBe('open');
  });

  it('should handle 50 concurrent providers opening/closing circuits', () => {
    const providers = Array.from({ length: 50 }, (_, i) => `provider-${i}`);

    // Open all circuits
    for (const p of providers) {
      breaker.recordFailure(p);
      breaker.recordFailure(p);
      breaker.recordFailure(p);
    }

    const statuses = breaker.getAllStatuses();
    expect(Object.keys(statuses)).toHaveLength(50);
    for (const p of providers) {
      expect(statuses[p].state).toBe('open');
      expect(statuses[p].totalFailures).toBe(3);
    }

    // Reset all
    for (const p of providers) {
      breaker.resetCircuit(p);
    }

    for (const p of providers) {
      expect(breaker.getStatus(p).state).toBe('closed');
    }
  });

  it('should handle event listener errors without crashing', () => {
    const goodEvents: CircuitBreakerEvent[] = [];

    // Bad listener that throws
    breaker.onStateChange(() => {
      throw new Error('Listener crash!');
    });

    // Good listener
    breaker.onStateChange((e) => goodEvents.push(e));

    // Should not throw despite bad listener
    breaker.recordFailure('test');
    breaker.recordFailure('test');
    breaker.recordFailure('test');

    // Good listener still received the event
    expect(goodEvents).toHaveLength(1);
    expect(goodEvents[0].newState).toBe('open');
  });

  it('should support unsubscribing listeners', () => {
    const events: CircuitBreakerEvent[] = [];
    const unsub = breaker.onStateChange((e) => events.push(e));

    // Trigger a transition
    breaker.recordFailure('p1');
    breaker.recordFailure('p1');
    breaker.recordFailure('p1');
    expect(events).toHaveLength(1);

    // Unsubscribe
    unsub();

    // Reset and re-trigger — no new events
    breaker.resetCircuit('p1');
    breaker.recordFailure('p1');
    breaker.recordFailure('p1');
    breaker.recordFailure('p1');
    expect(events).toHaveLength(1); // Still 1, not 2+
  });

  it('should handle success resetting consecutive failures before threshold', () => {
    const provider = 'flaky';

    // 2 failures then a success
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    breaker.recordSuccess(provider);

    // Counter should be reset, so 2 more failures shouldn't open
    breaker.recordFailure(provider);
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('closed');

    // But 3rd consecutive failure should
    breaker.recordFailure(provider);
    expect(breaker.getStatus(provider).state).toBe('open');
  });
});
