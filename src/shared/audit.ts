/**
 * Thin audit helper for domain tools.
 *
 * Wraps the core AuditTrail singleton so each tool only needs
 * one import and one call to log pipeline actions.
 */

import { getAuditTrail } from '../core/collaboration/audit-trail.js';
import type { AuditAction } from '../core/collaboration/audit-trail.js';

/** Log an action to the append-only audit trail. */
export function audit(
  action: AuditAction,
  domain: string,
  projectPath: string,
  details?: Record<string, unknown>,
  phase?: string,
): void {
  try {
    getAuditTrail().log({
      userId: 'operator',
      userName: 'Operator',
      action,
      domain,
      phase,
      projectPath,
      details,
    });
  } catch {
    // Audit logging must never break the pipeline.
    // Silently swallow - the primary operation already succeeded.
  }
}

/** Format recent audit activity for status tool output. */
export function formatRecentActivity(projectPath: string, limit = 5): string {
  try {
    const trail = getAuditTrail();
    const recent = trail.getRecentActivity(projectPath, limit);
    if (recent.length === 0) return '';

    const lines = recent.map((entry) => {
      const time = entry.timestamp.slice(0, 19).replace('T', ' ');
      const phase = entry.phase ? ` [${entry.phase}]` : '';
      return `    ${time} ${entry.action}${phase}`;
    });

    return `\n  RECENT ACTIVITY:\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
