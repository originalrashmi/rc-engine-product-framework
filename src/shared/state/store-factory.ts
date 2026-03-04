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
import { derivePipelineId } from './pipeline-id.js';

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
  const existing = storeCache.get(projectPath);
  if (existing) {
    return { store: existing, pipelineId: derivePipelineId(projectPath) };
  }

  const dbPath = path.join(projectPath, '.rc-engine', STATE_DB_NAME);
  const store = new CheckpointStore(dbPath);
  storeCache.set(projectPath, store);

  return { store, pipelineId: derivePipelineId(projectPath) };
}

/**
 * Remove a store from the cache and close its connection.
 * Used in tests and for project cleanup.
 */
export function closeProjectStore(projectPath: string): void {
  const store = storeCache.get(projectPath);
  if (store) {
    store.close();
    storeCache.delete(projectPath);
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
