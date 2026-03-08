/**
 * Checkpoint Store - SQLite-backed persistent state.
 *
 * Replaces the 3 different state managers (regex markdown, JSON-in-HTML, plain JSON)
 * with a single, atomic, validated store.
 *
 * Features:
 * - Atomic writes via WAL mode (no half-written state)
 * - Zod validation on read (corruption throws, never silently resets)
 * - Time-travel: every state change creates a versioned checkpoint
 * - Schema versioning for forward-compatible migrations
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { z } from 'zod';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Checkpoint<T = unknown> {
  id: number;
  pipelineId: string;
  nodeId: string;
  version: number;
  state: T;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface CheckpointQuery {
  pipelineId: string;
  nodeId?: string;
  /** Return only checkpoints at or before this version. */
  beforeVersion?: number;
  /** Maximum number of results (default: 1). */
  limit?: number;
}

// ── Schema Version ──────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    UNIQUE(pipeline_id, node_id, version)
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_pipeline
    ON checkpoints(pipeline_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_checkpoints_pipeline_node
    ON checkpoints(pipeline_id, node_id, version DESC);

  CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// ── Store ───────────────────────────────────────────────────────────────────

export class CheckpointStore {
  private db: Database.Database;

  /**
   * Open or create a checkpoint store.
   *
   * @param dbPath - Path to the SQLite database file. Use ':memory:' for testing.
   */
  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA_DDL);
    this.ensureSchemaVersion();
  }

  /**
   * Save a checkpoint. Automatically assigns the next version number.
   *
   * @param pipelineId - The pipeline run identifier.
   * @param nodeId - The node that produced this state.
   * @param state - The state to persist (must be JSON-serializable).
   * @param metadata - Optional metadata (e.g. duration, token usage).
   * @returns The checkpoint ID and version.
   */
  save<T>(
    pipelineId: string,
    nodeId: string,
    state: T,
    metadata?: Record<string, unknown>,
  ): { id: number; version: number } {
    const version = this.getNextVersion(pipelineId, nodeId);
    const stateJson = JSON.stringify(state);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (pipeline_id, node_id, version, state_json, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(pipelineId, nodeId, version, stateJson, metadataJson);
    return { id: Number(result.lastInsertRowid), version };
  }

  /**
   * Load the latest checkpoint for a pipeline+node, validated with a Zod schema.
   *
   * @throws Error if no checkpoint exists or validation fails.
   */
  load<T>(pipelineId: string, nodeId: string, schema: z.ZodType<T>): Checkpoint<T> {
    const row = this.db
      .prepare(
        `
      SELECT id, pipeline_id, node_id, version, state_json, metadata_json, created_at
      FROM checkpoints
      WHERE pipeline_id = ? AND node_id = ?
      ORDER BY version DESC
      LIMIT 1
    `,
      )
      .get(pipelineId, nodeId) as CheckpointRow | undefined;

    if (!row) {
      throw new Error(`No checkpoint found for pipeline="${pipelineId}" node="${nodeId}"`);
    }

    return this.parseRow(row, schema);
  }

  /**
   * Load a specific version of a checkpoint.
   *
   * @throws Error if the version doesn't exist or validation fails.
   */
  loadVersion<T>(pipelineId: string, nodeId: string, version: number, schema: z.ZodType<T>): Checkpoint<T> {
    const row = this.db
      .prepare(
        `
      SELECT id, pipeline_id, node_id, version, state_json, metadata_json, created_at
      FROM checkpoints
      WHERE pipeline_id = ? AND node_id = ? AND version = ?
    `,
      )
      .get(pipelineId, nodeId, version) as CheckpointRow | undefined;

    if (!row) {
      throw new Error(`No checkpoint found for pipeline="${pipelineId}" node="${nodeId}" version=${version}`);
    }

    return this.parseRow(row, schema);
  }

  /**
   * Load the latest checkpoint for a pipeline (across all nodes).
   *
   * @throws Error if no checkpoint exists or validation fails.
   */
  loadLatest<T>(pipelineId: string, schema: z.ZodType<T>): Checkpoint<T> {
    const row = this.db
      .prepare(
        `
      SELECT id, pipeline_id, node_id, version, state_json, metadata_json, created_at
      FROM checkpoints
      WHERE pipeline_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get(pipelineId) as CheckpointRow | undefined;

    if (!row) {
      throw new Error(`No checkpoints found for pipeline="${pipelineId}"`);
    }

    return this.parseRow(row, schema);
  }

  /**
   * List checkpoints matching a query.
   */
  list(query: CheckpointQuery): Checkpoint[] {
    let sql = `
      SELECT id, pipeline_id, node_id, version, state_json, metadata_json, created_at
      FROM checkpoints
      WHERE pipeline_id = ?
    `;
    const params: (string | number)[] = [query.pipelineId];

    if (query.nodeId) {
      sql += ' AND node_id = ?';
      params.push(query.nodeId);
    }

    if (query.beforeVersion !== undefined) {
      sql += ' AND version <= ?';
      params.push(query.beforeVersion);
    }

    sql += ' ORDER BY id DESC';

    const limit = query.limit ?? 1;
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as CheckpointRow[];
    return rows.map((row) => this.parseRowUntyped(row));
  }

  /**
   * Get all versions for a pipeline+node (for time-travel UI).
   */
  getVersionHistory(pipelineId: string, nodeId: string): Array<{ version: number; createdAt: string }> {
    const rows = this.db
      .prepare(
        `
      SELECT version, created_at
      FROM checkpoints
      WHERE pipeline_id = ? AND node_id = ?
      ORDER BY version ASC
    `,
      )
      .all(pipelineId, nodeId) as Array<{ version: number; created_at: string }>;

    return rows.map((r) => ({ version: r.version, createdAt: r.created_at }));
  }

  /**
   * Delete all checkpoints for a pipeline. Use with caution.
   */
  deletePipeline(pipelineId: string): number {
    const result = this.db.prepare('DELETE FROM checkpoints WHERE pipeline_id = ?').run(pipelineId);
    return result.changes;
  }

  /**
   * Get the current schema version.
   */
  getSchemaVersion(): number {
    const row = this.db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value, 10) : 0;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getNextVersion(pipelineId: string, nodeId: string): number {
    const row = this.db
      .prepare(
        `
      SELECT MAX(version) as max_version
      FROM checkpoints
      WHERE pipeline_id = ? AND node_id = ?
    `,
      )
      .get(pipelineId, nodeId) as { max_version: number | null };

    return (row.max_version ?? 0) + 1;
  }

  private ensureSchemaVersion(): void {
    const current = this.getSchemaVersion();
    if (current === 0) {
      this.db
        .prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)")
        .run(String(SCHEMA_VERSION));
    } else if (current < SCHEMA_VERSION) {
      this.migrate(current);
    } else if (current > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${current} is newer than code version ${SCHEMA_VERSION}. Update RC Engine.`,
      );
    }
  }

  private migrate(_fromVersion: number): void {
    // Future migrations go here.
    // For now, v1 is the only version.
    this.db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
  }

  private parseRow<T>(row: CheckpointRow, schema: z.ZodType<T>): Checkpoint<T> {
    const rawState = JSON.parse(row.state_json);
    const result = schema.safeParse(rawState);

    if (!result.success) {
      throw new Error(
        `Checkpoint validation failed for pipeline="${row.pipeline_id}" node="${row.node_id}" v${row.version}: ${result.error.message}`,
      );
    }

    return {
      id: row.id,
      pipelineId: row.pipeline_id,
      nodeId: row.node_id,
      version: row.version,
      state: result.data,
      createdAt: row.created_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  private parseRowUntyped(row: CheckpointRow): Checkpoint {
    return {
      id: row.id,
      pipelineId: row.pipeline_id,
      nodeId: row.node_id,
      version: row.version,
      state: JSON.parse(row.state_json),
      createdAt: row.created_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }
}

// ── Internal Row Type ───────────────────────────────────────────────────────

interface CheckpointRow {
  id: number;
  pipeline_id: string;
  node_id: string;
  version: number;
  state_json: string;
  metadata_json: string | null;
  created_at: string;
}
