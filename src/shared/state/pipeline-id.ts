/**
 * Pipeline ID derivation and node ID constants for CheckpointStore.
 *
 * Every project gets a stable, deterministic pipeline ID derived from its
 * absolute path. Node IDs use a {domain}:{concept} namespace convention.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * Canonical form of a project path for identity purposes: resolved, and
 * case-folded with forward slashes on win32 (NTFS is case-insensitive, so
 * "C:\\Users\\X" and "c:\\users\\x" are the SAME project and must not get
 * two disjoint pipeline ids - the split-brain defect, ADR-8).
 */
export function normalizeProjectPath(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  return process.platform === 'win32' ? resolved.toLowerCase().replace(/\\/g, '/') : resolved;
}

/**
 * Derive a stable, short pipeline ID from a project path.
 * Same path (in any casing on win32) always produces the same ID.
 *
 * Uses SHA-256 first 16 bytes -> base64url (22 chars). Short enough
 * for readable SQLite rows, unique enough for practical purposes.
 */
export function derivePipelineId(projectPath: string): string {
  return createHash('sha256').update(normalizeProjectPath(projectPath)).digest('base64url').slice(0, 22);
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
