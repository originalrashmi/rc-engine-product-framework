/**
 * Telemetry -- Opt-in anonymous usage data collection.
 *
 * OFF by default. Users must create .rc-engine/preferences.json with {"telemetry": true}.
 *
 * What is sent:
 *   - tool name, tier (free/starter/pro/enterprise)
 *   - OS (process.platform), Node version, rc-engine version
 *   - session ID (random UUID, not persistent across sessions)
 *
 * What is NEVER sent:
 *   - project paths, brief content, API keys, any user-generated data
 *
 * Events are buffered in memory and flushed once at process exit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { version, resolveFromRoot } from './config.js';

interface TelemetryEvent {
  tool: string;
  tier: string;
  ts: string;
}

interface TelemetryPayload {
  session_id: string;
  rc_engine_version: string;
  os: string;
  node_version: string;
  events: TelemetryEvent[];
}

const PREFS_FILE = path.join(resolveFromRoot('.rc-engine'), 'preferences.json');
const SESSION_ID = randomUUID();
const TELEMETRY_URL = process.env.RC_TELEMETRY_URL || 'https://telemetry.rcengine.dev/v1/events';
const TIMEOUT_MS = 5000;

const eventBuffer: TelemetryEvent[] = [];
let _enabled: boolean | null = null;
let _firstRunNoticeShown = false;

function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  try {
    if (!fs.existsSync(PREFS_FILE)) {
      _enabled = false;
      return false;
    }
    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8')) as { telemetry?: boolean };
    _enabled = prefs.telemetry === true;
    return _enabled;
  } catch {
    _enabled = false;
    return false;
  }
}

/**
 * Show first-run notice if preferences.json does not exist.
 * Logs to stderr only.
 */
function showTelemetryNotice(): void {
  if (_firstRunNoticeShown) return;
  _firstRunNoticeShown = true;
  try {
    if (fs.existsSync(PREFS_FILE)) return;
    console.error(
      '[rc-engine] Help improve RC Engine by sharing anonymous usage data. ' +
        'Set {"telemetry": true} in .rc-engine/preferences.json to opt in.',
    );
  } catch {
    // Silent
  }
}

/**
 * Record a tool call for telemetry. Buffers in memory, never blocks.
 */
export function recordTelemetryEvent(toolName: string, tier: string): void {
  if (!isEnabled()) return;
  eventBuffer.push({ tool: toolName, tier, ts: new Date().toISOString() });
}

/**
 * Flush buffered events to the telemetry endpoint. Fire-and-forget.
 */
function flushTelemetry(): void {
  if (!isEnabled() || eventBuffer.length === 0) return;

  const payload: TelemetryPayload = {
    session_id: SESSION_ID,
    rc_engine_version: version,
    os: process.platform,
    node_version: process.versions.node,
    events: [...eventBuffer],
  };

  eventBuffer.length = 0;

  _sendPayload(payload).catch(() => {
    // Silent -- telemetry failures must never affect anything
  });
}

async function _sendPayload(payload: TelemetryPayload): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Initialize telemetry: show first-run notice and register exit flush handlers.
 * Call once during startup.
 */
export function initTelemetry(): void {
  showTelemetryNotice();

  const flush = () => flushTelemetry();
  process.on('beforeExit', flush);
  process.on('SIGINT', () => {
    flush();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    flush();
    process.exit(0);
  });
}
