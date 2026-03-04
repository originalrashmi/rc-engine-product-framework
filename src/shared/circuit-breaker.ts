/**
 * Thin CircuitBreaker wrapper for LLM provider failure handling.
 *
 * Prevents cascading failures when a provider is down.
 * Fail-open: if the breaker itself errors, requests proceed.
 */

import { CircuitBreaker } from '../core/budget/circuit-breaker.js';
import type { CircuitStatus } from '../core/budget/circuit-breaker.js';

let _breaker: CircuitBreaker | null = null;

export function getCircuitBreaker(): CircuitBreaker {
  if (!_breaker) {
    _breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 });
  }
  return _breaker;
}

/** Check if a provider call is allowed. Returns true on error (fail-open). */
export function canRequest(provider: string): boolean {
  try {
    return getCircuitBreaker().canRequest(provider);
  } catch {
    return true;
  }
}

/** Record a successful provider call. Never throws. */
export function recordSuccess(provider: string): void {
  try {
    getCircuitBreaker().recordSuccess(provider);
  } catch {
    // silent
  }
}

/** Record a failed provider call. Never throws. */
export function recordFailure(provider: string): void {
  try {
    getCircuitBreaker().recordFailure(provider);
  } catch {
    // silent
  }
}

/** Get all circuit statuses for display. Returns {} on error. */
export function getCircuitStatuses(): Record<string, CircuitStatus> {
  try {
    return getCircuitBreaker().getAllStatuses();
  } catch {
    return {};
  }
}
