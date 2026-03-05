/**
 * Learning Store -- SQLite-backed cross-project intelligence.
 *
 * Tracks:
 * - Gate outcomes (approved/rejected, with feedback and context)
 * - Persona quality scores (derived from gate outcomes)
 * - Model performance per task type (quality + latency + cost)
 * - Project outcomes (shipped/abandoned/revised)
 * - Cross-project insights surfaced at project start
 *
 * The learning store is global (not per-project) so intelligence
 * accumulates across all projects the user builds.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GateOutcome {
  projectId: string;
  projectName: string;
  domain: 'pre-rc' | 'rc' | 'post-rc';
  phase: string;
  gateNumber: number;
  decision: 'approved' | 'rejected' | 'question';
  feedback?: string;
  /** Personas or tools that contributed to this phase's output. */
  contributors?: string[];
  timestamp?: string;
}

export interface ModelPerformance {
  provider: string;
  model: string;
  taskType: string;
  /** Quality score 0-100 (from gate outcomes and user feedback). */
  qualityScore: number;
  /** Average latency in milliseconds. */
  avgLatencyMs: number;
  /** Average cost per call in USD. */
  avgCostUsd: number;
  /** Number of data points. */
  sampleCount: number;
}

export interface ProjectOutcome {
  projectId: string;
  projectName: string;
  outcome: 'shipped' | 'abandoned' | 'paused' | 'in_progress';
  completedPhases: number;
  totalGatesApproved: number;
  totalGatesRejected: number;
  tags?: string[];
  notes?: string;
  startedAt: string;
  updatedAt: string;
}

export interface ProjectInsight {
  type: 'tip' | 'warning' | 'pattern';
  message: string;
  source: string;
  confidence: number;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS gate_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    domain TEXT NOT NULL,
    phase TEXT NOT NULL,
    gate_number INTEGER NOT NULL,
    decision TEXT NOT NULL,
    feedback TEXT,
    contributors_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_gate_outcomes_project
    ON gate_outcomes(project_id);
  CREATE INDEX IF NOT EXISTS idx_gate_outcomes_decision
    ON gate_outcomes(decision);

  CREATE TABLE IF NOT EXISTS model_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    task_type TEXT NOT NULL,
    quality_score REAL,
    latency_ms INTEGER,
    cost_usd REAL,
    tokens_used INTEGER,
    success INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_model_perf_task
    ON model_performance(task_type, provider);

  CREATE TABLE IF NOT EXISTS project_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'in_progress',
    completed_phases INTEGER NOT NULL DEFAULT 0,
    gates_approved INTEGER NOT NULL DEFAULT 0,
    gates_rejected INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT,
    notes TEXT,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE TABLE IF NOT EXISTS build_retrospectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    total_tasks INTEGER NOT NULL DEFAULT 0,
    completed_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    review_pass_rate REAL DEFAULT 0,
    rework_count INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    total_cost_usd REAL NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    successes_json TEXT,
    failures_json TEXT,
    patterns_json TEXT,
    recommendations_json TEXT,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_retro_project
    ON build_retrospectives(project_id);

  CREATE TABLE IF NOT EXISTS learning_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const SCHEMA_VERSION = 2;

// ── Store ───────────────────────────────────────────────────────────────────

export class LearningStore {
  private db: Database.Database;

  /**
   * Open or create the learning database.
   *
   * @param dbPath - Path to SQLite file. Defaults to ~/.rc-engine/learning.db.
   *                 Use ':memory:' for testing.
   */
  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? LearningStore.defaultPath();

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_DDL);
    this.ensureSchemaVersion();
  }

  static defaultPath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return path.join(home, '.rc-engine', 'learning.db');
  }

  // ── Gate Outcomes ───────────────────────────────────────────────────────

  /** Record a gate decision for learning. */
  recordGateOutcome(outcome: GateOutcome): void {
    this.db
      .prepare(
        `INSERT INTO gate_outcomes (project_id, project_name, domain, phase, gate_number, decision, feedback, contributors_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        outcome.projectId,
        outcome.projectName,
        outcome.domain,
        outcome.phase,
        outcome.gateNumber,
        outcome.decision,
        outcome.feedback ?? null,
        outcome.contributors ? JSON.stringify(outcome.contributors) : null,
        outcome.timestamp ?? new Date().toISOString(),
      );

    // Update project outcome tracking
    this.upsertProjectOutcome(outcome.projectId, outcome.projectName, outcome.decision);
  }

  /** Get gate approval rate for a specific phase across all projects. */
  getPhaseApprovalRate(domain: string, phase: string): { approved: number; rejected: number; rate: number } {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected
         FROM gate_outcomes
         WHERE domain = ? AND phase = ?`,
      )
      .get(domain, phase) as { approved: number; rejected: number } | undefined;

    const approved = row?.approved ?? 0;
    const rejected = row?.rejected ?? 0;
    const total = approved + rejected;
    return { approved, rejected, rate: total > 0 ? approved / total : 1.0 };
  }

  /** Get common rejection reasons for a phase. */
  getRejectionReasons(domain: string, phase: string, limit = 5): string[] {
    const rows = this.db
      .prepare(
        `SELECT feedback, COUNT(*) as cnt
         FROM gate_outcomes
         WHERE domain = ? AND phase = ? AND decision = 'rejected' AND feedback IS NOT NULL
         GROUP BY feedback
         ORDER BY cnt DESC
         LIMIT ?`,
      )
      .all(domain, phase, limit) as Array<{ feedback: string; cnt: number }>;

    return rows.map((r) => r.feedback);
  }

  // ── Model Performance ─────────────────────────────────────────────────

  /** Record a model execution for performance tracking. */
  recordModelPerformance(params: {
    provider: string;
    model: string;
    taskType: string;
    qualityScore?: number;
    latencyMs?: number;
    costUsd?: number;
    tokensUsed?: number;
    success?: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO model_performance (provider, model, task_type, quality_score, latency_ms, cost_usd, tokens_used, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.provider,
        params.model,
        params.taskType,
        params.qualityScore ?? null,
        params.latencyMs ?? null,
        params.costUsd ?? null,
        params.tokensUsed ?? null,
        params.success !== false ? 1 : 0,
      );
  }

  /** Get aggregated model performance for a task type, ranked by quality. */
  getModelRanking(taskType: string): ModelPerformance[] {
    const rows = this.db
      .prepare(
        `SELECT
           provider,
           model,
           task_type,
           AVG(quality_score) as avg_quality,
           AVG(latency_ms) as avg_latency,
           AVG(cost_usd) as avg_cost,
           COUNT(*) as sample_count,
           SUM(success) as successes
         FROM model_performance
         WHERE task_type = ? AND quality_score IS NOT NULL
         GROUP BY provider, model
         HAVING sample_count >= 2
         ORDER BY avg_quality DESC`,
      )
      .all(taskType) as Array<{
      provider: string;
      model: string;
      task_type: string;
      avg_quality: number;
      avg_latency: number;
      avg_cost: number;
      sample_count: number;
      successes: number;
    }>;

    return rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      taskType: r.task_type,
      qualityScore: Math.round(r.avg_quality * 10) / 10,
      avgLatencyMs: Math.round(r.avg_latency),
      avgCostUsd: r.avg_cost,
      sampleCount: r.sample_count,
    }));
  }

  /** Get the best model for a task type based on historical quality. */
  getBestModel(taskType: string): { provider: string; model: string } | null {
    const ranking = this.getModelRanking(taskType);
    return ranking.length > 0 ? { provider: ranking[0].provider, model: ranking[0].model } : null;
  }

  /** Get success rate for a specific provider on a task type. */
  getProviderSuccessRate(provider: string, taskType: string): number {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(success) as successes
         FROM model_performance
         WHERE provider = ? AND task_type = ?`,
      )
      .get(provider, taskType) as { total: number; successes: number } | undefined;

    if (!row || row.total === 0) return 1.0; // No data = assume success
    return row.successes / row.total;
  }

  // ── Project Outcomes ──────────────────────────────────────────────────

  /** Update a project's outcome. */
  updateProjectOutcome(
    projectId: string,
    outcome: 'shipped' | 'abandoned' | 'paused' | 'in_progress',
    notes?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE project_outcomes
         SET outcome = ?, notes = COALESCE(?, notes), updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now')
         WHERE project_id = ?`,
      )
      .run(outcome, notes ?? null, projectId);
  }

  /** Get all project outcomes, most recent first. */
  getProjectHistory(limit = 20): ProjectOutcome[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_outcomes
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      project_id: string;
      project_name: string;
      outcome: string;
      completed_phases: number;
      gates_approved: number;
      gates_rejected: number;
      tags_json: string | null;
      notes: string | null;
      started_at: string;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      outcome: r.outcome as ProjectOutcome['outcome'],
      completedPhases: r.completed_phases,
      totalGatesApproved: r.gates_approved,
      totalGatesRejected: r.gates_rejected,
      tags: r.tags_json ? JSON.parse(r.tags_json) : undefined,
      notes: r.notes ?? undefined,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
    }));
  }

  // ── Cross-Project Insights ────────────────────────────────────────────

  /**
   * Generate insights for a new project based on historical data.
   * Called at project start to surface relevant patterns.
   */
  getInsights(projectDescription?: string): ProjectInsight[] {
    const insights: ProjectInsight[] = [];
    const history = this.getProjectHistory(50);

    if (history.length === 0) return insights;

    // Insight 1: Overall gate rejection patterns
    const totalRejections = history.reduce((sum, p) => sum + p.totalGatesRejected, 0);
    const totalApprovals = history.reduce((sum, p) => sum + p.totalGatesApproved, 0);
    if (totalRejections > 0 && totalApprovals > 0) {
      const rejectionRate = totalRejections / (totalRejections + totalApprovals);
      if (rejectionRate > 0.3) {
        insights.push({
          type: 'warning',
          message: `Across ${history.length} previous projects, ${Math.round(rejectionRate * 100)}% of checkpoints were rejected. Common revision areas may need extra attention.`,
          source: 'gate-analysis',
          confidence: Math.min(0.9, history.length / 10),
        });
      }
    }

    // Insight 2: Phase-specific rejection hotspots
    const phaseRejections = this.db
      .prepare(
        `SELECT domain, phase, COUNT(*) as cnt
         FROM gate_outcomes
         WHERE decision = 'rejected'
         GROUP BY domain, phase
         ORDER BY cnt DESC
         LIMIT 3`,
      )
      .all() as Array<{ domain: string; phase: string; cnt: number }>;

    for (const pr of phaseRejections) {
      if (pr.cnt >= 2) {
        const approvalRate = this.getPhaseApprovalRate(pr.domain, pr.phase);
        if (approvalRate.rate < 0.7) {
          const reasons = this.getRejectionReasons(pr.domain, pr.phase, 2);
          const reasonNote = reasons.length > 0 ? ` Common feedback: "${reasons[0]}"` : '';
          insights.push({
            type: 'tip',
            message: `${pr.domain} ${pr.phase} has a ${Math.round(approvalRate.rate * 100)}% approval rate.${reasonNote}`,
            source: 'phase-hotspot',
            confidence: Math.min(0.85, pr.cnt / 5),
          });
        }
      }
    }

    // Insight 3: Abandoned project patterns
    const abandoned = history.filter((p) => p.outcome === 'abandoned');
    if (abandoned.length >= 2) {
      const avgPhasesCompleted = abandoned.reduce((sum, p) => sum + p.completedPhases, 0) / abandoned.length;
      insights.push({
        type: 'pattern',
        message: `${abandoned.length} of ${history.length} projects were abandoned, typically after phase ${Math.round(avgPhasesCompleted)}. Consider breaking the project into smaller milestones.`,
        source: 'abandonment-analysis',
        confidence: Math.min(0.8, abandoned.length / 5),
      });
    }

    // Insight 4: Success patterns from shipped projects
    const shipped = history.filter((p) => p.outcome === 'shipped');
    if (shipped.length >= 2) {
      insights.push({
        type: 'pattern',
        message: `${shipped.length} projects shipped successfully. Average of ${Math.round(shipped.reduce((s, p) => s + p.totalGatesApproved, 0) / shipped.length)} checkpoints approved per project.`,
        source: 'success-analysis',
        confidence: Math.min(0.9, shipped.length / 5),
      });
    }

    // Insight 5: Keyword-based relevance (if description provided)
    if (projectDescription) {
      const keywords = projectDescription
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const similar = history.filter((p) => keywords.some((k) => p.projectName.toLowerCase().includes(k)));
      if (similar.length > 0) {
        const example = similar[0];
        insights.push({
          type: 'tip',
          message: `You previously built "${example.projectName}" (${example.outcome}). Consider reviewing its deliverables for reusable patterns.`,
          source: 'cross-project',
          confidence: 0.6,
        });
      }
    }

    return insights;
  }

  /** Get a summary of the learning database for status displays. */
  getSummary(): {
    totalProjects: number;
    totalGateDecisions: number;
    totalModelRecords: number;
    shippedProjects: number;
    topModels: Array<{ provider: string; model: string; avgQuality: number }>;
  } {
    const projects = (this.db.prepare('SELECT COUNT(*) as cnt FROM project_outcomes').get() as { cnt: number }).cnt;
    const gates = (this.db.prepare('SELECT COUNT(*) as cnt FROM gate_outcomes').get() as { cnt: number }).cnt;
    const models = (this.db.prepare('SELECT COUNT(*) as cnt FROM model_performance').get() as { cnt: number }).cnt;
    const shipped = (
      this.db.prepare("SELECT COUNT(*) as cnt FROM project_outcomes WHERE outcome = 'shipped'").get() as {
        cnt: number;
      }
    ).cnt;

    const topModels = this.db
      .prepare(
        `SELECT provider, model, AVG(quality_score) as avg_quality
         FROM model_performance
         WHERE quality_score IS NOT NULL
         GROUP BY provider, model
         HAVING COUNT(*) >= 3
         ORDER BY avg_quality DESC
         LIMIT 3`,
      )
      .all() as Array<{ provider: string; model: string; avg_quality: number }>;

    return {
      totalProjects: projects,
      totalGateDecisions: gates,
      totalModelRecords: models,
      shippedProjects: shipped,
      topModels: topModels.map((m) => ({
        provider: m.provider,
        model: m.model,
        avgQuality: Math.round(m.avg_quality * 10) / 10,
      })),
    };
  }

  /**
   * Record a build retrospective.
   */
  recordRetrospective(params: {
    projectId: string;
    projectName: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    reviewPassRate: number;
    reworkCount: number;
    totalDurationMs: number;
    totalCostUsd: number;
    totalTokens: number;
    successes: string[];
    failures: string[];
    patterns: string[];
    recommendations: string[];
    summary: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO build_retrospectives
         (project_id, project_name, total_tasks, completed_tasks, failed_tasks,
          review_pass_rate, rework_count, total_duration_ms, total_cost_usd, total_tokens,
          successes_json, failures_json, patterns_json, recommendations_json, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.projectId,
        params.projectName,
        params.totalTasks,
        params.completedTasks,
        params.failedTasks,
        params.reviewPassRate,
        params.reworkCount,
        params.totalDurationMs,
        params.totalCostUsd,
        params.totalTokens,
        JSON.stringify(params.successes),
        JSON.stringify(params.failures),
        JSON.stringify(params.patterns),
        JSON.stringify(params.recommendations),
        params.summary,
      );
  }

  /**
   * Get recent retrospectives for loading into agent prompts.
   */
  getRecentRetros(limit: number = 5): Array<{
    projectName: string;
    summary: string;
    recommendations: string[];
    reviewPassRate: number;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT project_name, summary, recommendations_json, review_pass_rate, created_at
         FROM build_retrospectives
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      project_name: string;
      summary: string;
      recommendations_json: string;
      review_pass_rate: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      projectName: r.project_name,
      summary: r.summary,
      recommendations: JSON.parse(r.recommendations_json ?? '[]') as string[],
      reviewPassRate: r.review_pass_rate,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get common findings across all retrospectives.
   */
  getCommonFindings(): string[] {
    const rows = this.db
      .prepare(`SELECT patterns_json FROM build_retrospectives ORDER BY created_at DESC LIMIT 20`)
      .all() as Array<{ patterns_json: string }>;

    const patternCount: Record<string, number> = {};
    for (const row of rows) {
      const patterns = JSON.parse(row.patterns_json ?? '[]') as string[];
      for (const pattern of patterns) {
        patternCount[pattern] = (patternCount[pattern] ?? 0) + 1;
      }
    }

    return Object.entries(patternCount)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => `${pattern} (${count} occurrences)`);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private upsertProjectOutcome(projectId: string, projectName: string, decision: string): void {
    const existing = this.db.prepare('SELECT * FROM project_outcomes WHERE project_id = ?').get(projectId) as
      | { gates_approved: number; gates_rejected: number }
      | undefined;

    if (existing) {
      const field = decision === 'approved' ? 'gates_approved' : 'gates_rejected';
      this.db
        .prepare(
          `UPDATE project_outcomes
           SET ${field} = ${field} + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now')
           WHERE project_id = ?`,
        )
        .run(projectId);
    } else {
      this.db
        .prepare(
          `INSERT INTO project_outcomes (project_id, project_name, gates_approved, gates_rejected)
           VALUES (?, ?, ?, ?)`,
        )
        .run(projectId, projectName, decision === 'approved' ? 1 : 0, decision === 'rejected' ? 1 : 0);
    }
  }

  private ensureSchemaVersion(): void {
    const row = this.db.prepare("SELECT value FROM learning_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    const current = row ? parseInt(row.value, 10) : 0;

    if (current === 0) {
      this.db
        .prepare("INSERT OR REPLACE INTO learning_meta (key, value) VALUES ('schema_version', ?)")
        .run(String(SCHEMA_VERSION));
    }
    // Future migrations go here
  }
}

/** Lazy singleton -- created on first access. */
let _instance: LearningStore | null = null;

export function getLearningStore(): LearningStore {
  if (!_instance) {
    _instance = new LearningStore();
  }
  return _instance;
}
