/**
 * Thin BenchmarkStore wrapper for pipeline performance measurement.
 *
 * Tracks speed, cost, and quality across pipeline runs
 * with regression detection against previous runs.
 */

import { getBenchmarkStore } from '../core/benchmark/runner.js';
import type { PhaseTimingInput } from '../core/benchmark/runner.js';

/** Record pipeline phase timings. Never throws. */
export function recordPipelineTimings(runId: string, timings: PhaseTimingInput[]): void {
  try {
    getBenchmarkStore().recordPipelineRun(runId, timings);
  } catch {
    // silent
  }
}

/** Record quality metrics. Never throws. */
export function recordQualityMetrics(
  runId: string,
  metrics: {
    gateApprovalRate?: number;
    scanPassRate?: number;
    requirementCoverage?: number;
    totalGates?: number;
    totalFindings?: number;
  },
): void {
  try {
    getBenchmarkStore().recordQualityMetrics(runId, metrics);
  } catch {
    // silent
  }
}

/** Get benchmark summary for status display. Returns '' if no data. */
export function getBenchmarkSummary(): string {
  try {
    const store = getBenchmarkStore();
    const runs = store.listRuns(3);
    if (runs.length === 0) return '';
    return `\n  BENCHMARKS:
    Runs recorded: ${runs.length}
    Latest: ${runs[0]}`;
  } catch {
    return '';
  }
}
