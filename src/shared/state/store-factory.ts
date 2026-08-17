/**
 * Project-scoped CheckpointStore factory.
 *
 * Each project gets a single shared SQLite database at
 * {projectPath}/.rc-engine/state.db. All 4 domains write to the same
 * database, isolated by node ID namespace (pre-rc:state, rc:state, etc.).
 *
 * The factory maintains a singleton cache so repeated calls with the
 * same project path return the same CheckpointStore instance.
 */

import path from 'node:path';
import { CheckpointStore } from '../../core/checkpoint/store.js';
import { derivePipelineId, normalizeProjectPath } from './pipeline-id.js';

const STATE_DB_NAME = 'state.db';

/** Cache stores by project path to avoid opening multiple connections. */
const storeCache = new Map<string, CheckpointStore>();

/**
 * Get or create a CheckpointStore for a project.
 *
 * Returns both the store instance and the pipelineId so callers
 * don't need to recompute it.
 */
export function getProjectStore(projectPath: string): {
  store: CheckpointStore;
  pipelineId: string;
} {
  // Cache key and pipeline id both use the normalized path (ADR-8) so
  // differently-cased Windows paths share one connection and one identity.
  const cacheKey = normalizeProjectPath(projectPath);
  const pipelineId = derivePipelineId(projectPath);

  const existing = storeCache.get(cacheKey);
  if (existing) {
    return { store: existing, pipelineId };
  }

  const dbPath = path.join(projectPath, '.rc-engine', STATE_DB_NAME);
  const store = new CheckpointStore(dbPath);
  // One-time forward migration: rows written under a legacy (raw-path-hash)
  // pipeline id are adopted under the normalized id, so existing projects
  // don't orphan their state.
  store.adoptLegacyPipelineIds(pipelineId);
  storeCache.set(cacheKey, store);

  return { store, pipelineId };
}

/**
 * Remove a store from the cache and close its connection.
 * Used in tests and for project cleanup.
 */
export function closeProjectStore(projectPath: string): void {
  const cacheKey = normalizeProjectPath(projectPath);
  const store = storeCache.get(cacheKey);
  if (store) {
    store.close();
    storeCache.delete(cacheKey);
  }
}

/**
 * Close all open stores. Called during process shutdown.
 */
export function closeAllStores(): void {
  for (const [, store] of storeCache) {
    store.close();
  }
  storeCache.clear();
}
