#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { logStartupDiagnostics, hasAnyApiKey, version } from './shared/config.js';
import { logKnowledgeStatus, getKnowledgeManifest } from './shared/knowledge-loader.js';
import { tokenTracker } from './shared/token-tracker.js';
import { guardedTool } from './shared/tool-guard.js';
import { registerInitTool } from './tools/rc-init.js';
import { registerPreRcTools } from './domains/pre-rc/tools.js';
import { registerRcPhaseTools } from './domains/rc/tools/phase-tools.js';
import { registerRcGateTools } from './domains/rc/tools/gate-tools.js';
import { registerRcUxTools } from './domains/rc/tools/ux-tools.js';
import { registerPostRcTools } from './domains/post-rc/tools.js';
import { registerTraceabilityTools } from './domains/traceability/tools.js';
import { formatCostSummary } from './shared/cost-tracker.js';
import { getCircuitStatuses } from './shared/circuit-breaker.js';
import { getLearningSummary } from './shared/learning.js';
import { getPluginSummary, loadPlugins } from './shared/plugins.js';
import { getBenchmarkSummary } from './shared/benchmark.js';
import { formatRecentActivity } from './shared/audit.js';
import { getTracer } from './shared/tracer.js';
import { checkReadiness, formatReadiness } from './shared/deployment.js';
import { getChangelog, getProjectDocs } from './shared/docs.js';
import { recordToolCall } from './shared/usage-meter.js';
import { calculateValue, formatValueSummary } from './shared/value.js';
import { getTraceProgress } from './shared/tracer.js';
import { checkForUpdate } from './shared/version-check.js';
import { initTelemetry } from './shared/telemetry.js';
import { closeAllStores } from './shared/state/store-factory.js';

// Create the RC Engine MCP server
const server = new McpServer({
  name: 'rc-engine',
  version,
});

// Patch both server.tool() and server.registerTool() to wrap every handler with
// path validation, tier enforcement, and input size checks. This protects all tools
// regardless of which registration method is used. server.tool() is deprecated;
// server.registerTool() is the current API -- both must be guarded.
function wrapLastArgWithGuard(toolArgs: unknown[]): void {
  const handler = toolArgs[toolArgs.length - 1];
  // Extract tool name (first arg for server.tool()) for tier enforcement
  const toolName = typeof toolArgs[0] === 'string' ? toolArgs[0] : undefined;
  if (typeof handler === 'function') {
    toolArgs[toolArgs.length - 1] = guardedTool(handler as Parameters<typeof guardedTool>[0], toolName);
  }
}

const originalTool = server.tool.bind(server);
server.tool = ((...toolArgs: unknown[]) => {
  wrapLastArgWithGuard(toolArgs);
  return (originalTool as (...a: unknown[]) => unknown)(...toolArgs);
}) as typeof server.tool;

const originalRegisterTool = server.registerTool.bind(server);
server.registerTool = ((...toolArgs: unknown[]) => {
  wrapLastArgWithGuard(toolArgs);
  return (originalRegisterTool as (...a: unknown[]) => unknown)(...toolArgs);
}) as typeof server.registerTool;

// Register all tools across domains (lazy-load orchestrators on first call)
registerInitTool(server); // 1 tool: rc_init (unified entry point — start here)
registerPreRcTools(server); // 7 tools: prc_*
registerRcPhaseTools(server); // 8 tools: rc_start, rc_illuminate, rc_define, rc_import_prerc, rc_architect, rc_sequence, rc_validate, rc_forge_task
registerRcGateTools(server); // 4 tools: rc_gate, rc_save, rc_status, rc_reset
registerRcUxTools(server); // 3 tools: ux_score, ux_audit, ux_generate
registerPostRcTools(server); // 7 tools: postrc_*
registerTraceabilityTools(server); // 3 tools: trace_*

// Pipeline status tool - cross-domain overview + token totals
server.tool(
  'rc_pipeline_status',
  'High-level overview of the entire pipeline. Read-only, safe to call anytime. Shows token usage totals and registered domain summary. Call this FIRST when starting a new session to orient yourself, or when the user asks for a big-picture status. For detailed per-domain progress, follow up with the domain-specific status tools: prc_status, rc_status, postrc_status, trace_status.',
  { project_path: z.string().describe('Absolute path to the project directory') },
  { title: 'Pipeline Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async (args) => {
    try {
      const projectPath = (args as { project_path: string }).project_path;
      tokenTracker.setProjectPath(projectPath);

      const summary = tokenTracker.getSummary();

      // Load plugins for this project (safe, no-op if already loaded)
      await loadPlugins(projectPath);

      // Initialize tracer so EventBus events are observed
      getTracer();

      // Record this tool call for usage metering
      recordToolCall('operator', projectPath);

      // Subsystem summaries (only shown when data exists)
      const costSection = formatCostSummary();
      const circuits = getCircuitStatuses();
      const openCircuits = Object.entries(circuits).filter(([, s]) => s.state !== 'closed');
      const circuitSection =
        openCircuits.length > 0
          ? `\n  PROVIDER HEALTH:\n${openCircuits.map(([p, s]) => `    ${p}: ${s.state} (${s.totalFailures} failures)`).join('\n')}`
          : '';
      const learnSection = getLearningSummary();
      const pluginSection = getPluginSummary();
      const benchSection = getBenchmarkSummary();
      const activitySection = formatRecentActivity(projectPath);

      // Deployment readiness (only if project has deployable artifacts)
      const readiness = checkReadiness(projectPath);
      const deploySection = readiness
        ? `\n  DEPLOY READINESS:\n${formatReadiness(readiness)
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n')}`
        : '';

      // Recent changelog (only if git history exists)
      const changelog = getChangelog(projectPath);
      const docsSection = changelog
        ? `\n  RECENT CHANGES:\n${changelog
            .split('\n')
            .slice(0, 8)
            .map((l) => `    ${l}`)
            .join('\n')}`
        : '';

      // Project docs summary (only if pipeline artifacts exist)
      const projectDocs = getProjectDocs(projectPath);
      const projectDocsSection =
        projectDocs.length > 0 ? `\n  PROJECT DOCS:\n    ${projectDocs.length} document(s) generated` : '';

      // Trace progress (only if a pipeline has been traced)
      const traceProgress = getTraceProgress(`pre-rc`) || getTraceProgress(`rc-${projectPath}`);
      const traceSection = traceProgress
        ? `\n  TRACE PROGRESS:\n    Nodes: ${traceProgress.completedNodes}/${traceProgress.totalNodes} complete (${traceProgress.percentComplete}%)\n    Elapsed: ${Math.round(traceProgress.elapsedMs / 1000)}s`
        : '';

      // Value summary (only if cost data exists for a meaningful report)
      const valueReport = calculateValue({ projectName: 'pipeline' });
      const valueSection = valueReport
        ? `\n  VALUE REPORT:\n${formatValueSummary(valueReport)
            .split('\n')
            .slice(0, 6)
            .map((l) => `    ${l}`)
            .join('\n')}`
        : '';

      const output = `
===============================================
  RC ENGINE - PIPELINE STATUS
===============================================

${summary}

  REGISTERED DOMAINS:
    Gateway ........ 1 tool  (rc_init — start here)
    Pre-RC ......... 7 tools (prc_*)
    RC ............. 15 tools (rc_*, ux_*)
    Post-RC ........ 7 tools (postrc_*)
    Traceability ... 3 tools (trace_*)
    Pipeline ....... 1 tool  (rc_pipeline_status)
    Total: 33 tools

  PIPELINE FLOW:
    prc_start → prc_classify → prc_run_stage (x6)
    → prc_synthesize → prc_stress_test (Pro)
    → rc_import_prerc
    → rc_architect → rc_sequence → rc_validate
    → rc_forge_task → postrc_scan
    → trace_enhance_prd → trace_map_findings
${costSection}${circuitSection}${learnSection}${pluginSection}${benchSection}${deploySection}${docsSection}${projectDocsSection}${traceSection}${valueSection}${activitySection}
  Call domain-specific status tools for details:
    prc_status    - Pre-RC research progress
    rc_status     - RC phase progress
    postrc_status - Post-RC validation status
    trace_status  - Traceability coverage matrix
===============================================`;

      return { content: [{ type: 'text' as const, text: output }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// Graceful shutdown: close SQLite connections before exit
function shutdown() {
  closeAllStores();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Connect via stdio transport
async function main() {
  logStartupDiagnostics();
  logKnowledgeStatus();
  initTelemetry();
  checkForUpdate();

  const manifest = getKnowledgeManifest();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const knowledgeMode = manifest.mode === 'pro' ? 'pro' : 'community';
  const execMode = hasAnyApiKey ? 'autonomous' : 'passthrough';
import { checkForUpdate } from './shared/version-check.js';
import { initTelemetry } from './shared/telemetry.js';
import { closeAllStores } from './shared/state/store-factory.js';
}

main().catch((err) => {
  console.error('[rc-engine] Fatal error:', err);
  closeAllStores();
  process.exit(1);
});
