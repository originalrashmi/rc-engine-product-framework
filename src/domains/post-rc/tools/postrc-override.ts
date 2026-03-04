import type { z } from 'zod';
import { OverrideStatus } from '../types.js';
import type { Override, PostRCOverrideInputSchema } from '../types.js';
import { loadState, saveState } from '../state/state-manager.js';
import { audit } from '../../../shared/audit.js';

type OverrideInput = z.infer<typeof PostRCOverrideInputSchema>;

export async function postrcOverride(args: OverrideInput): Promise<string> {
  const { project_path, finding_id, reason, expires_days } = args;
  const state = await loadState(project_path);

  if (!state.projectPath) {
    return `No Post-RC configuration found. Run postrc_configure first.`;
  }

  // Verify finding exists in latest scan
  const lastScan = state.lastScan;
  if (!lastScan) {
    return `No scan results found. Run postrc_scan first.`;
  }

  const finding = lastScan.findings.find((f) => f.id === finding_id);
  if (!finding) {
    return `Finding "${finding_id}" not found in latest scan. Available findings:\n${lastScan.findings.map((f) => `  - ${f.id}: ${f.title}`).join('\n')}`;
  }

  const expirationDays = expires_days || 90;
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();

  const override: Override = {
    id: `override-${Date.now()}`,
    findingId: finding_id,
    reason,
    overriddenBy: 'operator',
    timestamp: new Date().toISOString(),
    expiresAt,
    status: OverrideStatus.Active,
  };

  state.overrides.push(override);
  state.updatedAt = new Date().toISOString();
  await saveState(project_path, state);
  audit('override.create', 'post-rc', project_path, {
    findingId: finding_id,
    severity: finding.severity,
    reason,
    overrideId: override.id,
  });

  return `
===============================================
  POST-RC METHOD: OVERRIDE RECORDED
===============================================

  Override ID: ${override.id}
  Finding: ${finding_id} - ${finding.title}
  Severity: ${finding.severity.toUpperCase()}
  Reason: ${reason}
  Expires: ${expiresAt} (${expirationDays} days)

  This finding will be excluded from gate decisions
  until the override expires or is revoked.

  AUDIT TRAIL:
    Override logged to post-rc/state/POSTRC-STATE.md
    All overrides are immutable and timestamped.

  Active overrides: ${state.overrides.filter((o) => o.status === 'active').length}
===============================================`;
}
