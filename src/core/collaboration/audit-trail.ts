/**
 * Audit Trail - Append-only log of all pipeline actions.
 *
 * Tracks every significant event in the pipeline with:
 * - Who performed the action (user identity)
 * - What was done (action type + details)
 * - When it happened (ISO timestamp)
 * - Where in the pipeline (domain, phase, gate)
 *
 * The audit trail is append-only and stored in SQLite for durability.
 * It serves as the foundation for:
 * - Compliance auditing
 * - Team activity feeds
 * - Decision history
 * - Undo/replay capabilities
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// ── Types ───────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'project.create'
  | 'project.outcome'
  | 'phase.start'
  | 'phase.complete'
  | 'gate.approve'
  | 'gate.reject'
  | 'gate.question'
  | 'scan.start'
  | 'scan.complete'
  | 'override.create'
  | 'artifact.create'
  | 'artifact.delete'
  | 'task.start'
  | 'task.complete'
  | 'task.fail'
  | 'comment.add'
  | 'plugin.load'
  | 'plugin.unload'
  | 'config.change';

export interface AuditEntry {
  id: number;
  /** User who performed the action. */
  userId: string;
  /** User display name. */
  userName: string;
  /** What was done. */
  action: AuditAction;
  /** Domain context. */
  domain?: string;
  /** Phase or stage context. */
  phase?: string;
  /** Project path. */
  projectPath?: string;
  /** Structured details (JSON-serializable). */
  details?: Record<string, unknown>;
  /** ISO timestamp. */
  timestamp: string;
}

export interface AuditQuery {
  projectPath?: string;
  userId?: string;
  action?: AuditAction;
  domain?: string;
  /** ISO timestamp - only entries after this time. */
  after?: string;
  /** Maximum results (default: 50). */
  limit?: number;
}

export interface Comment {
  id: number;
  /** User who posted the comment. */
  userId: string;
  userName: string;
  /** What the comment is attached to (artifact path, gate ID, finding ID). */
  targetType: 'artifact' | 'gate' | 'finding' | 'task' | 'general';
  targetId: string;
  projectPath: string;
  content: string;
  timestamp: string;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    user_name TEXT NOT NULL DEFAULT 'Anonymous',
    action TEXT NOT NULL,
    domain TEXT,
    phase TEXT,
    project_path TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_project
    ON audit_log(project_path, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_user
    ON audit_log(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_action
    ON audit_log(action, created_at DESC);

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    user_name TEXT NOT NULL DEFAULT 'Anonymous',
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_comments_target
    ON comments(project_path, target_type, target_id);

  CREATE TABLE IF NOT EXISTS audit_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// ── Audit Trail ─────────────────────────────────────────────────────────────

export class AuditTrail {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? AuditTrail.defaultPath();

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
    return path.join(home, '.rc-engine', 'audit.db');
  }

  // ── Audit Log ───────────────────────────────────────────────────────

  /** Record an action in the audit trail. */
  log(params: {
    userId?: string;
    userName?: string;
    action: AuditAction;
    domain?: string;
    phase?: string;
    projectPath?: string;
    details?: Record<string, unknown>;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO audit_log (user_id, user_name, action, domain, phase, project_path, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.userId ?? 'anonymous',
        params.userName ?? 'Anonymous',
        params.action,
        params.domain ?? null,
        params.phase ?? null,
        params.projectPath ?? null,
        params.details ? JSON.stringify(params.details) : null,
      );

    return Number(result.lastInsertRowid);
  }

  /** Query the audit trail. */
  query(query: AuditQuery): AuditEntry[] {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: (string | number)[] = [];

    if (query.projectPath) {
      sql += ' AND project_path = ?';
      params.push(query.projectPath);
    }
    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }
    if (query.action) {
      sql += ' AND action = ?';
      params.push(query.action);
    }
    if (query.domain) {
      sql += ' AND domain = ?';
      params.push(query.domain);
    }
    if (query.after) {
      sql += ' AND created_at > ?';
      params.push(query.after);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(query.limit ?? 50);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      user_id: string;
      user_name: string;
      action: string;
      domain: string | null;
      phase: string | null;
      project_path: string | null;
      details_json: string | null;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      action: r.action as AuditAction,
      domain: r.domain ?? undefined,
      phase: r.phase ?? undefined,
      projectPath: r.project_path ?? undefined,
      details: r.details_json ? JSON.parse(r.details_json) : undefined,
      timestamp: r.created_at,
    }));
  }

  /** Get recent activity for a project. */
  getRecentActivity(projectPath: string, limit = 20): AuditEntry[] {
    return this.query({ projectPath, limit });
  }

  /** Get all actions by a specific user. */
  getUserActivity(userId: string, limit = 50): AuditEntry[] {
    return this.query({ userId, limit });
  }

  // ── Comments ──────────────────────────────────────────────────────────

  /** Add a comment to an artifact, gate, finding, or task. */
  addComment(params: {
    userId?: string;
    userName?: string;
    targetType: Comment['targetType'];
    targetId: string;
    projectPath: string;
    content: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO comments (user_id, user_name, target_type, target_id, project_path, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.userId ?? 'anonymous',
        params.userName ?? 'Anonymous',
        params.targetType,
        params.targetId,
        params.projectPath,
        params.content,
      );

    // Also log to audit trail
    this.log({
      userId: params.userId,
      userName: params.userName,
      action: 'comment.add',
      projectPath: params.projectPath,
      details: {
        targetType: params.targetType,
        targetId: params.targetId,
        contentPreview: params.content.slice(0, 100),
      },
    });

    return Number(result.lastInsertRowid);
  }

  /** Get comments for a specific target. */
  getComments(projectPath: string, targetType: Comment['targetType'], targetId: string): Comment[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM comments
         WHERE project_path = ? AND target_type = ? AND target_id = ?
         ORDER BY created_at ASC`,
      )
      .all(projectPath, targetType, targetId) as Array<{
      id: number;
      user_id: string;
      user_name: string;
      target_type: string;
      target_id: string;
      project_path: string;
      content: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      targetType: r.target_type as Comment['targetType'],
      targetId: r.target_id,
      projectPath: r.project_path,
      content: r.content,
      timestamp: r.created_at,
    }));
  }

  /** Get all comments for a project. */
  getProjectComments(projectPath: string, limit = 50): Comment[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM comments
         WHERE project_path = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectPath, limit) as Array<{
      id: number;
      user_id: string;
      user_name: string;
      target_type: string;
      target_id: string;
      project_path: string;
      content: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      targetType: r.target_type as Comment['targetType'],
      targetId: r.target_id,
      projectPath: r.project_path,
      content: r.content,
      timestamp: r.created_at,
    }));
  }

  // ── Summary ───────────────────────────────────────────────────────────

  /** Get audit trail summary for status displays. */
  getSummary(projectPath?: string): {
    totalEntries: number;
    totalComments: number;
    uniqueUsers: number;
    recentActions: AuditEntry[];
  } {
    const entriesQuery = projectPath
      ? this.db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE project_path = ?').get(projectPath)
      : this.db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get();
    const totalEntries = (entriesQuery as { cnt: number }).cnt;

    const commentsQuery = projectPath
      ? this.db.prepare('SELECT COUNT(*) as cnt FROM comments WHERE project_path = ?').get(projectPath)
      : this.db.prepare('SELECT COUNT(*) as cnt FROM comments').get();
    const totalComments = (commentsQuery as { cnt: number }).cnt;

    const usersQuery = projectPath
      ? this.db.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM audit_log WHERE project_path = ?').get(projectPath)
      : this.db.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM audit_log').get();
    const uniqueUsers = (usersQuery as { cnt: number }).cnt;

    const recentActions = this.query({ projectPath, limit: 5 });

    return { totalEntries, totalComments, uniqueUsers, recentActions };
  }

  /** Close the database. */
  close(): void {
    this.db.close();
  }
}

/** Lazy singleton. */
let _instance: AuditTrail | null = null;

export function getAuditTrail(): AuditTrail {
  if (!_instance) {
    _instance = new AuditTrail();
  }
  return _instance;
}
