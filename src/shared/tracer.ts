/**
 * Thin Tracer wrapper for structured pipeline execution tracing.
 *
 * Builds hierarchical traces from EventBus events:
 * Pipeline > Node > LLM Call spans.
 */

import { Tracer } from '../core/observability/tracer.js';
import { getEventBus } from './event-bus.js';

let _tracer: Tracer | null = null;

/** Get the shared Tracer singleton (auto-attaches to EventBus). */
export function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = new Tracer();
    try {
      _tracer.attach(getEventBus());
    } catch {
      // silent
    }
  }
  return _tracer;
}

/** Get trace progress for status display. Returns null on error. */
export function getTraceProgress(pipelineId: string): {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  percentComplete: number;
  totalCostUsd: number;
  elapsedMs: number;
} | null {
  try {
    return getTracer().getProgress(pipelineId);
  } catch {
    return null;
  }
}
