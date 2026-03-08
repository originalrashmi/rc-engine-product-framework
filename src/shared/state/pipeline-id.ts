/**
 * Pipeline ID derivation and node ID constants for CheckpointStore.
 *
 * Every project gets a stable, deterministic pipeline ID derived from its
 * absolute path. Node IDs use a {domain}:{concept} namespace convention.
 */

import { createHash } from 'node:crypto';

/**
 * Derive a stable, short pipeline ID from a project path.
 * Same path always produces the same ID across sessions.
 *
 * Uses SHA-256 first 16 bytes -> base64url (22 chars). Short enough
 * for readable SQLite rows, unique enough for practical purposes.
 */
export function derivePipelineId(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('base64url').slice(0, 22);
}

/**
 * Node IDs - one per domain concept stored in the CheckpointStore.
 * These are the canonical keys used by all domain state adapters.
 */
export const NODE_IDS = {
  PRE_RC_STATE: 'pre-rc:state',
  PRE_RC_INTERRUPT: 'pre-rc:interrupt',
  RC_STATE: 'rc:state',
  RC_INTERRUPT: 'rc:interrupt',
  POST_RC_STATE: 'post-rc:state',
  POST_RC_INTERRUPT: 'post-rc:interrupt',
  TRACEABILITY: 'traceability:matrix',
} as const;

export type NodeId = (typeof NODE_IDS)[keyof typeof NODE_IDS];
