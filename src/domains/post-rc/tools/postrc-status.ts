import type { z } from 'zod';
import type { PostRCStatusInputSchema } from '../types.js';
import { loadState } from '../state/state-manager.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { formatRecentActivity } from '../../../shared/audit.js';
import { formatCostSummary } from '../../../shared/cost-tracker.js';
import { getLearningSummary } from '../../../shared/learning.js';

type StatusInput = z.infer<typeof PostRCStatusInputSchema>;

export async function postrcStatus(args: StatusInput): Promise<string> {
  const { project_path } = args;
  const state = await loadState(project_path);

  if (!state.projectPath) {
    return `No Post-RC configuration found at ${project_path}. Run postrc_configure first.`;
  }

  const lastScan = state.lastScan;
  const activeOverrides = state.overrides.filter((o) => o.status === 'active').length;

  return `
===============================================
  POST-RC METHOD STATUS
===============================================

  Project: ${state.projectName}
  Path: ${state.projectPath}
  Created: ${state.createdAt}
  Updated: ${state.updatedAt}

  ACTIVE MODULES:
    ${state.config.activeModules.map((m) => `Y  ${m}`).join('\n    ')}

  SCAN HISTORY:
    Total Scans: ${state.scans.length}
    Active Overrides: ${activeOverrides}

  ${
    lastScan
      ? `LATEST SCAN:
    ID: ${lastScan.id}
    Date: ${lastScan.timestamp}
    Duration: ${lastScan.duration_ms}ms
    Gate: ${lastScan.gateDecision.toUpperCase()}
    Critical: ${lastScan.summary.critical}
    High: ${lastScan.summary.high}
    Medium: ${lastScan.summary.medium}
    Total Findings: ${lastScan.summary.totalFindings}`
      : 'No scans yet. Run postrc_scan to validate.'
  }

  ${tokenTracker.getDomainSummary('post-rc')}${formatCostSummary()}${getLearningSummary()}${formatRecentActivity(project_path)}

  NEXT STEPS:
    -> "postrc_scan" to run validation
    -> "postrc_configure" to update policy
    -> "postrc_report" to generate report
===============================================`;
}
