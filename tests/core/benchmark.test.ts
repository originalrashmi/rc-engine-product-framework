import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BenchmarkStore } from '../../src/core/benchmark/index.js';

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;

  beforeEach(() => {
    store = new BenchmarkStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('recording', () => {
    it('records a single metric', () => {
      const id = store.record({
        runId: 'run-1',
        metric: 'pipeline.duration.total',
        value: 45000,
        unit: 'ms',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('records pipeline run with phase timings', () => {
      store.recordPipelineRun('run-1', [
        { domain: 'pre-rc', phase: 'classify', durationMs: 2000, tokenCount: 500, estimatedCostUsd: 0.01 },
        { domain: 'pre-rc', phase: 'stage-1', durationMs: 15000, tokenCount: 5000, estimatedCostUsd: 0.15 },
        { domain: 'rc', phase: 'architect', durationMs: 20000, tokenCount: 8000, estimatedCostUsd: 0.3 },
      ]);

      const results = store.getRunResults('run-1');
      // 3 phases x 3 metrics each (duration, tokens, cost) + 3 totals = 12
      expect(results.length).toBe(12);

      const total = results.find((r) => r.metric === 'pipeline.duration.total');
      expect(total?.value).toBe(37000);

      const costTotal = results.find((r) => r.metric === 'pipeline.cost.total');
      expect(costTotal?.value).toBeCloseTo(0.46);
    });

    it('records quality metrics', () => {
      store.recordQualityMetrics('run-1', {
        gateApprovalRate: 85.0,
        scanPassRate: 92.5,
        requirementCoverage: 78.0,
        totalGates: 8,
        totalFindings: 3,
      });

      const results = store.getRunResults('run-1');
      expect(results).toHaveLength(5);

      const coverage = results.find((r) => r.metric === 'quality.requirement_coverage');
      expect(coverage?.value).toBe(78.0);
      expect(coverage?.unit).toBe('percent');
    });
  });

  describe('querying', () => {
    it('gets latest metric value', () => {
      store.record({ runId: 'run-1', metric: 'pipeline.cost.total', value: 1.5, unit: 'usd' });
      store.record({ runId: 'run-2', metric: 'pipeline.cost.total', value: 2.0, unit: 'usd' });

      const latest = store.getLatestMetric('pipeline.cost.total');
      expect(latest?.value).toBe(2.0);
      expect(latest?.runId).toBe('run-2');
    });

    it('returns null for unknown metrics', () => {
      expect(store.getLatestMetric('nonexistent')).toBeNull();
    });

    it('gets metric history', () => {
      for (let i = 0; i < 5; i++) {
        store.record({ runId: `run-${i}`, metric: 'pipeline.duration.total', value: 30000 + i * 1000, unit: 'ms' });
      }

      const history = store.getMetricHistory('pipeline.duration.total', 3);
      expect(history).toHaveLength(3);
      // Most recent first
      expect(history[0].value).toBe(34000);
    });

    it('lists runs', () => {
      store.record({ runId: 'run-a', metric: 'm1', value: 1, unit: 'count' });
      store.record({ runId: 'run-a', metric: 'm2', value: 2, unit: 'count' });
      store.record({ runId: 'run-b', metric: 'm1', value: 3, unit: 'count' });

      const runs = store.listRuns();
      expect(runs).toHaveLength(2);
      expect(runs[0].metricCount).toBe(1); // run-b (most recent, 1 metric)
      expect(runs[1].metricCount).toBe(2); // run-a (2 metrics)
    });

    it('gets last run ID', () => {
      store.record({ runId: 'run-alpha', metric: 'm1', value: 1, unit: 'ms' });
      store.record({ runId: 'run-beta', metric: 'm1', value: 2, unit: 'ms' });

      expect(store.getLastRunId()).toBe('run-beta');
    });

    it('returns null when no runs exist', () => {
      expect(store.getLastRunId()).toBeNull();
    });
  });

  describe('regression detection', () => {
    it('detects time regression', () => {
      store.record({ runId: 'run-1', metric: 'pipeline.duration.total', value: 30000, unit: 'ms' });
      store.record({ runId: 'run-2', metric: 'pipeline.duration.total', value: 45000, unit: 'ms' });

      const regressions = store.compareRuns('run-2', 'run-1');
      expect(regressions).toHaveLength(1);
      expect(regressions[0].isDegradation).toBe(true);
      expect(regressions[0].changePercent).toBe(50);
    });

    it('detects cost regression', () => {
      store.record({ runId: 'run-1', metric: 'pipeline.cost.total', value: 1.0, unit: 'usd' });
      store.record({ runId: 'run-2', metric: 'pipeline.cost.total', value: 1.5, unit: 'usd' });

      const regressions = store.compareRuns('run-2', 'run-1');
      expect(regressions).toHaveLength(1);
      expect(regressions[0].isDegradation).toBe(true);
    });

    it('ignores small changes under 10%', () => {
      store.record({ runId: 'run-1', metric: 'pipeline.duration.total', value: 30000, unit: 'ms' });
      store.record({ runId: 'run-2', metric: 'pipeline.duration.total', value: 31000, unit: 'ms' });

      const regressions = store.compareRuns('run-2', 'run-1');
      expect(regressions).toHaveLength(0);
    });

    it('does not flag improvements as regressions', () => {
      store.record({ runId: 'run-1', metric: 'pipeline.duration.total', value: 45000, unit: 'ms' });
      store.record({ runId: 'run-2', metric: 'pipeline.duration.total', value: 30000, unit: 'ms' });

      const regressions = store.compareRuns('run-2', 'run-1');
      expect(regressions).toHaveLength(0);
    });
  });

  describe('summary and reporting', () => {
    it('generates summary with regression check', () => {
      store.recordPipelineRun('run-1', [{ domain: 'pre-rc', phase: 'classify', durationMs: 2000 }]);

      const summary = store.summarize('run-1');
      expect(summary.runId).toBe('run-1');
      expect(summary.metrics.length).toBeGreaterThan(0);
      expect(summary.regressions).toEqual([]); // No previous run to compare
    });

    it('formats markdown report', () => {
      store.recordPipelineRun('run-1', [
        { domain: 'pre-rc', phase: 'classify', durationMs: 2000, estimatedCostUsd: 0.01 },
      ]);
      store.recordQualityMetrics('run-1', { gateApprovalRate: 90, requirementCoverage: 80 });

      const summary = store.summarize('run-1');
      const report = store.formatReport(summary);
      expect(report).toContain('# Benchmark Report');
      expect(report).toContain('run-1');
      expect(report).toContain('Metric');
    });
  });
});
