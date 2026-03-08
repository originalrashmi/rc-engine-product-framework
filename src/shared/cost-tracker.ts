/**
 * Thin CostTracker wrapper for per-model cost calculation.
 *
 * Runs alongside the existing tokenTracker (does not replace it).
 * Wires budget events to the shared EventBus.
 */

import { CostTracker } from '../core/budget/cost-tracker.js';
import type { CostSummary } from '../core/budget/cost-tracker.js';

let _tracker: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!_tracker) {
    _tracker = new CostTracker();
  }
  return _tracker;
}

/** Record a cost entry alongside the existing tokenTracker. Never throws. */
export function recordCost(params: {
  pipelineId: string;
  domain: string;
  tool: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  try {
    return getCostTracker().record(params);
  } catch {
    return 0;
  }
}

/** Get cost summary for status display. Returns null on error. */
export function getCostSummary(pipelineId?: string): CostSummary | null {
  try {
    const summary = getCostTracker().getSummary(pipelineId);
    return summary.totalCalls > 0 ? summary : null;
  } catch {
    return null;
  }
}

/** Format cost summary as a display string. Returns '' if no data. */
export function formatCostSummary(): string {
  try {
    const s = getCostTracker().getSummary();
    if (s.totalCalls === 0) return '';

    const byProvider = Object.entries(s.byProvider)
      .map(([p, v]) => `    ${p}: $${v.costUsd.toFixed(4)} (${v.calls} calls)`)
      .join('\n');

    return `\n  COST TRACKING:
    Total: $${s.totalCostUsd.toFixed(4)}
    Calls: ${s.totalCalls}
    Input tokens: ${s.totalInputTokens.toLocaleString()}
    Output tokens: ${s.totalOutputTokens.toLocaleString()}
${byProvider}`;
  } catch {
    return '';
  }
}
