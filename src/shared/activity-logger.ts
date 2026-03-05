/**
 * Activity Logger -- JSONL audit trail for all pipeline activity.
 *
 * Writes events to `.rc-engine/audit/activity.jsonl` in the project directory.
 * Each line is a self-contained JSON object with:
 *   - timestamp (ISO 8601)
 *   - event type (tool_call, tier_block, validation_error, phase_transition)
 *   - tool name, project path, and relevant metadata
 *
 * This file is append-only and never truncated by the engine.
 * Users can tail it for real-time monitoring or parse it for analytics.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ActivityEvent {
  timestamp: string;
  event: 'tool_call' | 'tier_block' | 'validation_error' | 'phase_transition';
  tool?: string;
  projectPath?: string;
  tier?: string;
  detail?: string;
}

/**
 * Log an activity event to the project's JSONL audit file.
 * Never throws -- logging failures are silently ignored.
 */
export function logActivity(projectPath: string, event: Omit<ActivityEvent, 'timestamp' | 'projectPath'>): void {
  try {
    if (!projectPath) return;

    const auditDir = path.join(projectPath, '.rc-engine', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    const entry: ActivityEvent = {
      timestamp: new Date().toISOString(),
      projectPath,
      ...event,
    };

    fs.appendFileSync(path.join(auditDir, 'activity.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Silent -- audit logging must never break tool execution
  }
}
