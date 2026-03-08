/**
 * Tool Feature Requirements -- Single source of truth for tool→tier feature mapping.
 *
 * Imported by BOTH the web server (web/server/index.ts) and MCP server (src/shared/tier-guard.ts)
 * to ensure tier enforcement stays in sync across all access paths.
 *
 * Any new gated tool MUST be added here -- NOT in individual server files.
 */

import type { TierFeatures } from './tiers.js';

/**
 * Maps tool names to the tier feature they require.
 * Tools not listed here are available on all tiers (including free).
 */
export const TOOL_FEATURE_REQUIREMENTS: Record<string, keyof TierFeatures> = {
  // Build tools require fullPipeline (not available on free tier)
  rc_start: 'fullPipeline',
  rc_import_prerc: 'fullPipeline',
  rc_illuminate: 'fullPipeline',
  rc_define: 'fullPipeline',
  rc_architect: 'fullPipeline',
  rc_sequence: 'fullPipeline',
  rc_validate: 'fullPipeline',
  rc_forge_task: 'fullPipeline',
  rc_gate: 'fullPipeline',
  // Design tools
  ux_design: 'designOptions',
  // Security scanning
  postrc_scan: 'securityScan',
  postrc_report: 'securityScan',
  postrc_override: 'securityScan',
  postrc_gate: 'securityScan',
  postrc_configure: 'securityScan',
  // Export tools
  playbook_generate: 'playbook',
  pdf_export: 'pdfExport',
  // Stress test (Pro/Enterprise only)
  prc_stress_test: 'stressTest',
  // Traceability
  trace_enhance_prd: 'traceability',
  trace_map_findings: 'traceability',
  trace_status: 'traceability',
};
