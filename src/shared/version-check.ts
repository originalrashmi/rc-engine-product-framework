/**
 * Version Check -- Non-blocking check for newer rc-engine versions on npm.
 *
 * - Fetches the npm registry with a 3-second timeout
 * - Caches results in .rc-engine/cache/version-check.json (24h TTL)
 * - Logs to stderr if a newer version is available
 * - All errors silently swallowed -- must never delay startup or crash
 */

import fs from 'node:fs';
import path from 'node:path';
import { version, resolveFromRoot } from './config.js';

interface VersionCheckCache {
  latestVersion: string;
  checkedAt: string;
}

const CACHE_DIR = resolveFromRoot('.rc-engine', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'version-check.json');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TIMEOUT_MS = 3000;

/**
 * Check for a newer version. Fire-and-forget -- never blocks, never throws.
 */
export function checkForUpdate(): void {
  _checkForUpdate().catch(() => {
    // Silent -- version check must never affect anything
  });
}

async function _checkForUpdate(): Promise<void> {
  const cached = readCache();
  if (cached) {
    announceIfNewer(cached.latestVersion);
    return;
  }

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) return;

  writeCache({ latestVersion, checkedAt: new Date().toISOString() });
  announceIfNewer(latestVersion);
}

function readCache(): VersionCheckCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data: VersionCheckCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const age = Date.now() - new Date(data.checkedAt).getTime();
    if (age > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: VersionCheckCache): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // Silent
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch('https://registry.npmjs.org/rc-engine/latest', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

function announceIfNewer(latestVersion: string): void {
  if (compareVersions(latestVersion, version) > 0) {
    console.error(`[rc-engine] Update available: ${version} → ${latestVersion} — run: npm update -g rc-engine`);
  }
}

/** Simple semver comparison. Returns >0 if a > b, 0 if equal, <0 if a < b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
