/**
 * Benchmark Runner
 *
 * Measures pipeline performance across three dimensions:
 * 1. Speed -- wall-clock time for each phase and the full pipeline
 * 2. Cost -- token usage and estimated USD cost per phase
 * 3. Quality -- gate approval rates, scan pass rates, coverage metrics
 *
 * Results are stored in SQLite for historical comparison and regression detection.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ── Types ───────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  id?: number;
  /** Run identifier (UUID or descriptive name). */
  runId: string;
  /** What was measured. */
  metric: string;
  /** The measured value. */
  value: number;
  /** Unit of measurement (ms, usd, percent, count). */
  unit: string;
  /** Additional context. */
  tags?: Record<string, string>;
  /** ISO timestamp. */
  timestamp?: string;
}

export interface BenchmarkSummary {
  runId: string;
  timestamp: string;
  metrics: BenchmarkResult[];
  /** Comparison against previous run (if available). */
  regressions: Regression[];
}

export interface Regression {
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  unit: string;
  /** True if the change is a degradation (higher is worse for time/cost, lower is worse for quality). */
  isDegradation: boolean;
}

export interface PhaseTimingInput {
  domain: string;
  phase: string;
  durationMs: number;
  tokenCount?: number;
  estimatedCostUsd?: number;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS benchmark_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    tags_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bench_run ON benchmark_results(run_id);
  CREATE INDEX IF NOT EXISTS idx_bench_metric ON benchmark_results(metric, created_at DESC);
`;

// ── Benchmark Store ─────────────────────────────────────────────────────────

export class BenchmarkStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? BenchmarkStore.defaultPath();

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_DDL);
  }

  static defaultPath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return path.join(home, '.rc-engine', 'benchmarks.db');
  }

  /** Record a single metric. */
  record(result: BenchmarkResult): number {
    const stmt = this.db.prepare(
      `INSERT INTO benchmark_results (run_id, metric, value, unit, tags_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const r = stmt.run(
      result.runId,
      result.metric,
      result.value,
      result.unit,
      result.tags ? JSON.stringify(result.tags) : null,
    );
    return Number(r.lastInsertRowid);
  }

  /** Record multiple phase timings from a pipeline run. */
  recordPipelineRun(runId: string, timings: PhaseTimingInput[]): void {
    let totalMs = 0;
    let totalTokens = 0;
    let totalCost = 0;

    const insert = this.db.prepare(
      `INSERT INTO benchmark_results (run_id, metric, value, unit, tags_json)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const batch = this.db.transaction((timings: PhaseTimingInput[]) => {
      for (const t of timings) {
        const tags = { domain: t.domain, phase: t.phase };

        insert.run(runId, `phase.duration.${t.domain}.${t.phase}`, t.durationMs, 'ms', JSON.stringify(tags));
        totalMs += t.durationMs;

        if (t.tokenCount !== undefined) {
          insert.run(runId, `phase.tokens.${t.domain}.${t.phase}`, t.tokenCount, 'count', JSON.stringify(tags));
          totalTokens += t.tokenCount;
        }

        if (t.estimatedCostUsd !== undefined) {
          insert.run(runId, `phase.cost.${t.domain}.${t.phase}`, t.estimatedCostUsd, 'usd', JSON.stringify(tags));
          totalCost += t.estimatedCostUsd;
        }
      }

      // Totals
      insert.run(runId, 'pipeline.duration.total', totalMs, 'ms', null);
      insert.run(runId, 'pipeline.tokens.total', totalTokens, 'count', null);
      insert.run(runId, 'pipeline.cost.total', totalCost, 'usd', null);
    });

    batch(timings);
  }

  /** Record quality metrics from a completed pipeline. */
  recordQualityMetrics(
    runId: string,
    metrics: {
      gateApprovalRate?: number;
      scanPassRate?: number;
      requirementCoverage?: number;
      totalGates?: number;
      totalFindings?: number;
    },
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO benchmark_results (run_id, metric, value, unit, tags_json) VALUES (?, ?, ?, ?, ?)`,
    );

    const batch = this.db.transaction(() => {
      if (metrics.gateApprovalRate !== undefined) {
        insert.run(runId, 'quality.gate_approval_rate', metrics.gateApprovalRate, 'percent', null);
      }
      if (metrics.scanPassRate !== undefined) {
        insert.run(runId, 'quality.scan_pass_rate', metrics.scanPassRate, 'percent', null);
      }
      if (metrics.requirementCoverage !== undefined) {
        insert.run(runId, 'quality.requirement_coverage', metrics.requirementCoverage, 'percent', null);
      }
      if (metrics.totalGates !== undefined) {
        insert.run(runId, 'quality.total_gates', metrics.totalGates, 'count', null);
      }
      if (metrics.totalFindings !== undefined) {
        insert.run(runId, 'quality.total_findings', metrics.totalFindings, 'count', null);
      }
    });

    batch();
  }

  /** Get all results for a run. */
  getRunResults(runId: string): BenchmarkResult[] {
    const rows = this.db.prepare('SELECT * FROM benchmark_results WHERE run_id = ? ORDER BY id').all(runId) as Array<{
      id: number;
      run_id: string;
      metric: string;
      value: number;
      unit: string;
      tags_json: string | null;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      tags: r.tags_json ? JSON.parse(r.tags_json) : undefined,
      timestamp: r.created_at,
    }));
  }

  /** Get the most recent value for a specific metric. */
  getLatestMetric(metric: string): BenchmarkResult | null {
    const row = this.db
      .prepare('SELECT * FROM benchmark_results WHERE metric = ? ORDER BY id DESC LIMIT 1')
      .get(metric) as
      | {
          id: number;
          run_id: string;
          metric: string;
          value: number;
          unit: string;
          tags_json: string | null;
          created_at: string;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      runId: row.run_id,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
      timestamp: row.created_at,
    };
  }

  /** Get historical values for a metric (for trend analysis). */
  getMetricHistory(metric: string, limit = 20): BenchmarkResult[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM benchmark_results
         WHERE metric = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(metric, limit) as Array<{
      id: number;
      run_id: string;
      metric: string;
      value: number;
      unit: string;
      tags_json: string | null;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      tags: r.tags_json ? JSON.parse(r.tags_json) : undefined,
      timestamp: r.created_at,
    }));
  }

  /** Compare two runs and detect regressions. */
  compareRuns(currentRunId: string, previousRunId: string): Regression[] {
    const current = this.getRunResults(currentRunId);
    const previous = this.getRunResults(previousRunId);

    const prevMap = new Map<string, BenchmarkResult>();
    for (const r of previous) {
      prevMap.set(r.metric, r);
    }

    const regressions: Regression[] = [];

    // Metrics where higher is worse (time, cost, findings)
    const higherIsWorse = new Set(['ms', 'usd', 'count']);

    for (const cur of current) {
      const prev = prevMap.get(cur.metric);
      if (!prev) continue;

      if (prev.value === 0) continue;
      const changePercent = ((cur.value - prev.value) / prev.value) * 100;

      // Only flag significant changes (> 10%)
      if (Math.abs(changePercent) < 10) continue;

      const isHigherWorse = higherIsWorse.has(cur.unit) && !cur.metric.includes('coverage');
      const isDegradation = isHigherWorse ? changePercent > 0 : changePercent < 0;

      if (isDegradation) {
        regressions.push({
          metric: cur.metric,
          current: cur.value,
          previous: prev.value,
          changePercent: Math.round(changePercent * 10) / 10,
          unit: cur.unit,
          isDegradation: true,
        });
      }
    }

    return regressions;
  }

  /** Get the most recent run ID. */
  getLastRunId(): string | null {
    const row = this.db.prepare('SELECT run_id FROM benchmark_results ORDER BY id DESC LIMIT 1').get() as
      | { run_id: string }
      | undefined;

    return row?.run_id ?? null;
  }

  /** List all run IDs with their timestamps. */
  listRuns(limit = 20): Array<{ runId: string; timestamp: string; metricCount: number }> {
    const rows = this.db
      .prepare(
        `SELECT run_id, MIN(created_at) as first_ts, COUNT(*) as cnt, MAX(id) as max_id
         FROM benchmark_results
         GROUP BY run_id
         ORDER BY max_id DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{ run_id: string; first_ts: string; cnt: number }>;

    return rows.map((r) => ({
      runId: r.run_id,
      timestamp: r.first_ts,
      metricCount: r.cnt,
    }));
  }

  /** Generate a summary for a run including regression detection. */
  summarize(runId: string): BenchmarkSummary {
    const metrics = this.getRunResults(runId);
    const lastRun = this.getLastRunId();
    const previousRunId = lastRun && lastRun !== runId ? lastRun : null;

    const regressions = previousRunId ? this.compareRuns(runId, previousRunId) : [];

    return {
      runId,
      timestamp: metrics[0]?.timestamp ?? new Date().toISOString(),
      metrics,
      regressions,
    };
  }

  /** Format a summary as a markdown report. */
  formatReport(summary: BenchmarkSummary): string {
    const lines: string[] = [
      '# Benchmark Report',
      '',
      `**Run:** ${summary.runId}`,
      `**Date:** ${summary.timestamp}`,
      '',
    ];

    // Group metrics by category
    const categories = new Map<string, BenchmarkResult[]>();
    for (const m of summary.metrics) {
      const cat = m.metric.split('.')[0];
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(m);
    }

    for (const [cat, metrics] of categories) {
      lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)} Metrics`, '');
      lines.push('| Metric | Value | Unit |');
      lines.push('|--------|-------|------|');
      for (const m of metrics) {
        const shortName = m.metric.replace(`${cat}.`, '');
        const formatted =
          m.unit === 'usd'
            ? `$${m.value.toFixed(4)}`
            : m.unit === 'percent'
              ? `${m.value.toFixed(1)}%`
              : m.unit === 'ms'
                ? `${(m.value / 1000).toFixed(1)}s`
                : `${m.value}`;
        lines.push(`| ${shortName} | ${formatted} | ${m.unit} |`);
      }
      lines.push('');
    }

    if (summary.regressions.length > 0) {
      lines.push('## Regressions Detected', '');
      lines.push('| Metric | Previous | Current | Change |');
      lines.push('|--------|----------|---------|--------|');
      for (const r of summary.regressions) {
        lines.push(
          `| ${r.metric} | ${r.previous} | ${r.current} | ${r.changePercent > 0 ? '+' : ''}${r.changePercent}% |`,
        );
      }
      lines.push('');
    } else {
      lines.push('No regressions detected.', '');
    }

    return lines.join('\n');
  }

  /** Close the database. */
  close(): void {
    this.db.close();
  }
}

/** Lazy singleton. */
let _instance: BenchmarkStore | null = null;

export function getBenchmarkStore(): BenchmarkStore {
  if (!_instance) {
    _instance = new BenchmarkStore();
  }
  return _instance;
}
