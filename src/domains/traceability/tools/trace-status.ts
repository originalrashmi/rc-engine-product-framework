import type { z } from 'zod';
import type { TraceStatusInputSchema } from '../types.js';
import { loadTraceability } from '../state/state-manager.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { formatRecentActivity } from '../../../shared/audit.js';
import { formatCostSummary } from '../../../shared/cost-tracker.js';
import { formatTokenReport } from '../../../shared/token-report.js';
import { getLearningSummary } from '../../../shared/learning.js';

type StatusInput = z.infer<typeof TraceStatusInputSchema>;

export async function traceStatus(args: StatusInput): Promise<string> {
  const { project_path } = args;

  const matrix = await loadTraceability(project_path);
  if (!matrix) {
    return 'No traceability data. Run trace_enhance_prd first.';
  }

  const { requirements, summary } = matrix;

  // Build ASCII table
  let output = `
===============================================
  RC TRACEABILITY: STATUS
===============================================

  Project: ${matrix.projectName}
  Requirements: ${summary.totalRequirements}
  Coverage: ${summary.coveragePercent}%

`;

  // Header
  output +=
    padRight('ID', 16) +
    padRight('Cat', 6) +
    padRight('Title', 36) +
    padRight('Status', 14) +
    padRight('Tasks', 6) +
    padRight('Finds', 6) +
    'Verify\n';
  output += '-'.repeat(118) + '\n';

  // Rows
  for (const req of requirements) {
    output += padRight(req.id, 16);
    output += padRight(req.category, 6);
    output += padRight(truncate(req.title, 34), 36);
    output += padRight(req.status, 14);
    output += padRight(String(req.mappedTasks.length), 6);
    output += padRight(String(req.mappedFindings.length), 6);
    output += req.verificationResult + '\n';
  }

  output += '-'.repeat(118) + '\n';

  // Coverage by category
  output += '\n  COVERAGE BY CATEGORY:\n';
  const categories = [...new Set(requirements.map((r) => r.category))];
  for (const cat of categories) {
    const catReqs = requirements.filter((r) => r.category === cat);
    const catVerified = catReqs.filter((r) => r.verificationResult === 'pass').length;
    const catFailed = catReqs.filter((r) => r.verificationResult === 'fail').length;
    const catCov = catReqs.length > 0 ? Math.round(((catVerified + catFailed) / catReqs.length) * 100) : 0;
    output += `    ${padRight(cat, 6)} ${catCov}% (${catVerified} pass, ${catFailed} fail, ${catReqs.length - catVerified - catFailed} untested)\n`;
  }

  // Orphans
  if (summary.orphanRequirements.length > 0) {
    output += `\n  ORPHAN REQUIREMENTS (${summary.orphanRequirements.length}):\n`;
    for (const id of summary.orphanRequirements) {
      const req = requirements.find((r) => r.id === id);
      output += `    ${id}: ${truncate(req?.title || 'Unknown', 60)}\n`;
    }
  }

  if (summary.orphanTasks.length > 0) {
    output += `\n  ORPHAN TASKS (${summary.orphanTasks.length}):\n`;
    for (const id of summary.orphanTasks) {
      output += `    ${id}\n`;
    }
  }

  output += tokenTracker.getDomainSummary('traceability');
  output += formatTokenReport();
  output += formatCostSummary();
  output += getLearningSummary();
  output += formatRecentActivity(project_path);

  output += `
===============================================`;

  return output;
}

function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
