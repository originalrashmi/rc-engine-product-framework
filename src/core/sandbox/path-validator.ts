/**
 * Path Validator - Prevents directory traversal and enforces write boundaries.
 *
 * Every tool that accepts a path must validate it through this module before
 * performing any filesystem operation. This is the single choke-point for
 * path security - no tool should do its own path validation.
 *
 * Protections:
 * - Canonicalization via path.resolve (eliminates .., symlink tricks)
 * - Project root containment (all paths must be inside the project)
 * - Domain write restrictions (each domain can only write to its directory)
 * - System path blocklist (prevents reading/writing /etc, ~/.ssh, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

/** The four domains that can write to disk. */
export type Domain = 'pre-rc' | 'rc' | 'post-rc' | 'traceability' | 'runtime';

/** Result of a path validation check. */
export interface ValidationResult {
  valid: boolean;
  /** The resolved, canonical path (only set when valid). */
  resolvedPath?: string;
  /** Human-readable error message (only set when invalid). */
  error?: string;
}

// ── Configuration ───────────────────────────────────────────────────────────

/** Maps each domain to the directories it's allowed to write to. */
const DOMAIN_WRITE_DIRS: Record<Domain, string[]> = {
  'pre-rc': ['pre-rc-research'],
  rc: ['rc-method'],
  'post-rc': ['post-rc'],
  traceability: ['rc-traceability'],
  runtime: ['.rc-engine'],
};

/**
 * Paths that must never be read or written, regardless of project root.
 * Matched as prefixes against the resolved absolute path.
 */
const BLOCKED_PATHS = [
  '/etc',
  '/var/run',
  '/var/log',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root/.ssh',
  '/root/.gnupg',
  '/root/.aws',
  '/root/.config/gcloud',
];

/**
 * Home directory patterns to block (resolved at runtime).
 * These are checked in addition to BLOCKED_PATHS.
 */
function getHomeBlockedPaths(): string[] {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (!home) return [];
  return [
    path.join(home, '.ssh'),
    path.join(home, '.gnupg'),
    path.join(home, '.aws'),
    path.join(home, '.config', 'gcloud'),
    path.join(home, '.env'),
  ];
}

// ── Validator ───────────────────────────────────────────────────────────────

export class PathValidator {
  private projectRoot: string;
  private blockedPaths: string[];

  /**
   * Create a path validator for a specific project.
   *
   * @param projectRoot - The absolute path to the project root directory.
   *   All operations are confined to this directory.
   */
  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.blockedPaths = [...BLOCKED_PATHS, ...getHomeBlockedPaths()];
  }

  /**
   * Validate a path for reading. The path must be:
   * 1. Inside the project root (after canonicalization)
   * 2. Not in the blocked paths list
   *
   * @param inputPath - The path to validate (absolute or relative to project root).
   */
  validateRead(inputPath: string): ValidationResult {
    const resolved = this.resolve(inputPath);

    // Check blocked paths
    const blockedMatch = this.isBlocked(resolved);
    if (blockedMatch) {
      return {
        valid: false,
        error: `Access denied: path "${inputPath}" resolves to blocked location "${blockedMatch}"`,
      };
    }

    // Check containment
    if (!this.isInsideProject(resolved)) {
      return {
        valid: false,
        error: `Access denied: path "${inputPath}" resolves outside project root "${this.projectRoot}"`,
      };
    }

    return { valid: true, resolvedPath: resolved };
  }

  /**
   * Validate a path for writing. Applies all read validations plus:
   * 3. The path must be within the domain's allowed write directories
   *
   * @param inputPath - The path to validate.
   * @param domain - The domain requesting the write.
   */
  validateWrite(inputPath: string, domain: Domain): ValidationResult {
    // First, apply read validations
    const readResult = this.validateRead(inputPath);
    if (!readResult.valid) return readResult;

    const resolved = readResult.resolvedPath!;

    // Check domain write restrictions
    const allowedDirs = DOMAIN_WRITE_DIRS[domain];
    const relativePath = path.relative(this.projectRoot, resolved);
    const topDir = relativePath.split(path.sep)[0];

    if (!allowedDirs.includes(topDir)) {
      return {
        valid: false,
        error: `Domain "${domain}" cannot write to "${topDir}/". Allowed directories: ${allowedDirs.join(', ')}`,
      };
    }

    return { valid: true, resolvedPath: resolved };
  }

  /**
   * Resolve a path relative to the project root, canonicalizing it.
   * Uses fs.realpathSync to resolve symlinks to their actual targets,
   * preventing symlink-based directory traversal attacks.
   */
  resolve(inputPath: string): string {
    const resolved = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(this.projectRoot, inputPath);
    try {
      return fs.realpathSync(resolved);
    } catch {
      // Path doesn't exist yet (e.g. creating a new file) - fall back to path.resolve
      return resolved;
    }
  }

  /**
   * Check if a resolved path is inside the project root.
   */
  isInsideProject(resolvedPath: string): boolean {
    // The path must start with projectRoot + separator, or be exactly projectRoot
    return resolvedPath === this.projectRoot || resolvedPath.startsWith(this.projectRoot + path.sep);
  }

  /**
   * Check if a resolved path matches any blocked path.
   * Returns the matching blocked prefix, or null if not blocked.
   */
  isBlocked(resolvedPath: string): string | null {
    for (const blocked of this.blockedPaths) {
      if (resolvedPath === blocked || resolvedPath.startsWith(blocked + path.sep)) {
        return blocked;
      }
    }
    return null;
  }

  /**
   * Get the project root this validator is bound to.
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }
}
