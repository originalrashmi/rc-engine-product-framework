import type { z } from 'zod';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { TraceMapFindingsInputSchema } from '../types.js';
import type { TraceabilityMatrix } from '../types.js';
import { loadTraceability, saveTraceability, getReportsDir, ensureDirectories } from '../state/state-manager.js';
import { parsePostRcState } from '../parsers/postrc-state-parser.js';
import { parseRcTasks } from '../parsers/rc-tasks-parser.js';
import { mapFindingsToRequirements, mapTasksToRequirements, calculateCoverage } from '../mapper/finding-mapper.js';
import { hasApiKey } from '../../../shared/config.js';
import { generateHtmlReport } from '../generators/html-report-generator.js';
import { audit } from '../../../shared/audit.js';

type MapFindingsInput = z.infer<typeof TraceMapFindingsInputSchema>;

export async function traceMapFindings(args: MapFindingsInput): Promise<string> {
  const { project_path } = args;

  await ensureDirectories(project_path);

  // Step 1: Load traceability matrix
  const matrix = await loadTraceability(project_path);
  if (!matrix) {
    return `ERROR: No traceability data found at ${project_path}.\n\nRun "trace_enhance_prd" first to create the traceability matrix.`;
  }

  // Step 2: Load Post-RC scan findings
  const findings = await parsePostRcState(project_path);
  const hasScanData = findings.length > 0;

  // Step 3: Load RC Method tasks
  const tasks = await parseRcTasks(project_path);

  // Step 4: Map findings to requirements
  if (hasScanData) {
    mapFindingsToRequirements(findings, matrix.requirements);
  }

  // Step 5: Map tasks to requirements
  if (tasks.length > 0) {
    mapTasksToRequirements(tasks, matrix.requirements);
  }

  // Step 6: Calculate coverage
  matrix.summary = calculateCoverage(matrix.requirements, tasks);

  // Step 7: Save updated matrix
  await saveTraceability(project_path, matrix);
  audit('artifact.create', 'traceability', project_path, {
    type: 'coverage-report',
    coverage: matrix.summary.coveragePercent,
  });

  // Step 8: Generate coverage report (markdown)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFilename = `COVERAGE-REPORT-${timestamp}.md`;
  const reportPath = join(getReportsDir(project_path), reportFilename);
  const reportContent = generateCoverageReport(matrix, findings.length, tasks.length);
  await writeFile(reportPath, reportContent, 'utf-8');

  // Step 8b: Generate HTML traceability report (consulting-grade, Word/PDF exportable)
  const htmlFilename = `TRACEABILITY-REPORT-${timestamp}.html`;
  const htmlPath = join(getReportsDir(project_path), htmlFilename);
  const htmlContent = generateHtmlReport(matrix);
  await writeFile(htmlPath, htmlContent, 'utf-8');

  // Step 9: Build output
  let output = `
===============================================
  RC TRACEABILITY ADDON: FINDINGS MAPPING
===============================================

  Project: ${matrix.projectName}
  Mode: ${hasApiKey ? 'AUTONOMOUS' : 'PASSTHROUGH'}

  DATA SOURCES:
    Post-RC Findings: ${hasScanData ? findings.length + ' findings loaded' : 'NO SCAN DATA'}
    RC Method Tasks:  ${tasks.length > 0 ? tasks.length + ' tasks loaded' : 'No tasks found'}

  COVERAGE SUMMARY:
    Total Requirements:  ${matrix.summary.totalRequirements}
    Implemented:         ${matrix.summary.implemented}
    Verified (pass):     ${matrix.summary.verified}
    Failed:              ${matrix.summary.failed}
    Coverage:            ${matrix.summary.coveragePercent}%

  ORPHANS:
    Orphan Requirements: ${matrix.summary.orphanRequirements.length} (no implementation)
    Orphan Tasks:        ${matrix.summary.orphanTasks.length} (no requirement)
`;

  if (matrix.summary.orphanRequirements.length > 0) {
    output += `\n  ORPHAN REQUIREMENTS (no mapped tasks):\n`;
    for (const id of matrix.summary.orphanRequirements) {
      const req = matrix.requirements.find((r) => r.id === id);
      output += `    ${id}: ${req?.title || 'Unknown'}\n`;
    }
  }

  if (matrix.summary.orphanTasks.length > 0) {
    output += `\n  ORPHAN TASKS (no mapped requirement):\n`;
    for (const id of matrix.summary.orphanTasks) {
      output += `    ${id}\n`;
    }
  }

  output += `
  FILES UPDATED:
    rc-traceability/TRACEABILITY.json
    rc-traceability/reports/${reportFilename}
    rc-traceability/reports/${htmlFilename}

  HTML REPORT:
    Open ${htmlFilename} in a browser to view the
    consulting-grade traceability report. Export to Word/PDF
    via File > Print > Save as PDF.

  NEXT STEPS:
    -> "trace_status" to see the full traceability matrix
    -> Address orphan requirements (missing implementation)
    -> Address failed requirements (fix or override findings)
===============================================`;

  return output;
}

function generateCoverageReport(matrix: TraceabilityMatrix, findingCount: number, taskCount: number): string {
  let md = `# Traceability Coverage Report\n\n`;
  md += `> Generated: ${new Date().toISOString()}\n`;
  md += `> Project: ${matrix.projectName}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Requirements | ${matrix.summary.totalRequirements} |\n`;
  md += `| Implemented | ${matrix.summary.implemented} |\n`;
  md += `| Verified (pass) | ${matrix.summary.verified} |\n`;
  md += `| Failed | ${matrix.summary.failed} |\n`;
  md += `| Coverage | ${matrix.summary.coveragePercent}% |\n`;
  md += `| Post-RC Findings | ${findingCount} |\n`;
  md += `| RC Tasks | ${taskCount} |\n`;
  md += `| Orphan Requirements | ${matrix.summary.orphanRequirements.length} |\n`;
  md += `| Orphan Tasks | ${matrix.summary.orphanTasks.length} |\n\n`;

  // Coverage by category
  md += `## Coverage by Category\n\n`;
  md += `| Category | Total | Implemented | Verified | Failed | Coverage |\n`;
  md += `|----------|-------|-------------|----------|--------|----------|\n`;

  const categories = [...new Set(matrix.requirements.map((r) => r.category))];
  for (const cat of categories) {
    const catReqs = matrix.requirements.filter((r) => r.category === cat);
    const catImpl = catReqs.filter((r) => r.status !== 'unimplemented').length;
    const catVerified = catReqs.filter((r) => r.verificationResult === 'pass').length;
    const catFailed = catReqs.filter((r) => r.verificationResult === 'fail').length;
    const catCov = catReqs.length > 0 ? Math.round(((catVerified + catFailed) / catReqs.length) * 100) : 0;
    md += `| ${cat} | ${catReqs.length} | ${catImpl} | ${catVerified} | ${catFailed} | ${catCov}% |\n`;
  }

  // Requirement details
  md += `\n## Requirement Details\n\n`;
  md += `| ID | Category | Title | Status | Tasks | Findings | Verification |\n`;
  md += `|----|----------|-------|--------|-------|----------|-------------|\n`;

  for (const req of matrix.requirements) {
    md += `| ${req.id} | ${req.category} | ${req.title.slice(0, 40)} | ${req.status} | ${req.mappedTasks.length} | ${req.mappedFindings.length} | ${req.verificationResult} |\n`;
  }

  // Orphans
  if (matrix.summary.orphanRequirements.length > 0) {
    md += `\n## Orphan Requirements\n\n`;
    md += `These requirements have no mapped tasks (not implemented):\n\n`;
    for (const id of matrix.summary.orphanRequirements) {
      const req = matrix.requirements.find((r) => r.id === id);
      md += `- **${id}**: ${req?.title || 'Unknown'}\n`;
    }
  }

  if (matrix.summary.orphanTasks.length > 0) {
    md += `\n## Orphan Tasks\n\n`;
    md += `These tasks don't map to any requirement:\n\n`;
    for (const id of matrix.summary.orphanTasks) {
      md += `- ${id}\n`;
    }
  }

  return md;
}
