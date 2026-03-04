/**
 * Thin LearningStore wrapper for cross-project intelligence.
 *
 * Tracks gate outcomes, model performance, and project insights
 * in a global SQLite store that accumulates across all projects.
 */

import { getLearningStore } from '../core/learning/store.js';
import type { GateOutcome, LearningStore } from '../core/learning/store.js';

/** Safe accessor. Returns null if SQLite init fails. */
function safeStore(): LearningStore | null {
  try {
    return getLearningStore();
  } catch {
    return null;
  }
}

/** Record a gate outcome for cross-project learning. Never throws. */
export function recordGateOutcome(outcome: GateOutcome): void {
  try {
    safeStore()?.recordGateOutcome(outcome);
  } catch {
    // silent
  }
}

/** Record model performance data. Never throws. */
export function recordModelPerformance(params: {
  provider: string;
  model: string;
  taskType: string;
  qualityScore?: number;
  latencyMs?: number;
  costUsd?: number;
  tokensUsed?: number;
  success?: boolean;
}): void {
  try {
    safeStore()?.recordModelPerformance(params);
  } catch {
    // silent
  }
}

/** Get learning store summary for status display. Returns '' if no data. */
export function getLearningSummary(): string {
  try {
    const store = safeStore();
    if (!store) return '';
    const s = store.getSummary();
    if (s.totalProjects === 0) return '';
    return `\n  LEARNING INTELLIGENCE:
    Projects tracked: ${s.totalProjects} (${s.shippedProjects} shipped)
    Gate decisions: ${s.totalGateDecisions}
    Model evaluations: ${s.totalModelRecords}`;
  } catch {
    return '';
  }
}
