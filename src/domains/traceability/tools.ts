import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TraceEnhancePrdInputSchema, TraceMapFindingsInputSchema, TraceStatusInputSchema } from './types.js';
import { traceEnhancePrd } from './tools/trace-enhance-prd.js';
import { traceMapFindings } from './tools/trace-map-findings.js';
import { traceStatus } from './tools/trace-status.js';

/**
 * Register all Traceability domain tools on the shared MCP server.
 */
export function registerTraceabilityTools(server: McpServer): void {
  // Tool 1: Parse PRD, assign requirement IDs, generate acceptance criteria
  server.tool(
    'trace_enhance_prd',
    'Assign tracking IDs to every requirement in the PRD. Call after PRD is created (rc_define or prc_synthesize) and BEFORE building. Auto-discovers PRDs in both pre-rc-research/ and rc-method/prds/. Assigns deterministic IDs by category: PRD-FUNC-001, PRD-SEC-001, PRD-PERF-001, etc. (8 categories). In autonomous mode, also generates testable acceptance criteria. Creates the traceability matrix in rc-traceability/. After success: tell user how many requirements were tagged by category. Does NOT modify the original PRD - creates an enhanced copy.',
    TraceEnhancePrdInputSchema.shape,
    async (args) => {
      try {
        const result = await traceEnhancePrd(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 2: Map Post-RC findings and RC tasks back to requirement IDs
  server.tool(
    'trace_map_findings',
    'Run AFTER both building (Forge) and scanning (postrc_scan). Maps Post-RC findings and RC task completions back to the requirement IDs from trace_enhance_prd. Calculates: implementation coverage %, verification coverage %, orphan requirements (specified but never built), and orphan tasks (built but not in PRD). Generates a consulting-grade HTML traceability report. Prerequisites: trace_enhance_prd must have been run, and ideally postrc_scan completed. Present coverage gaps to user - orphan requirements are the most critical signal.',
    TraceMapFindingsInputSchema.shape,
    async (args) => {
      try {
        const result = await traceMapFindings(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 3: Display current traceability status
  server.tool(
    'trace_status',
    'Check traceability coverage. Read-only, safe to call anytime after trace_enhance_prd. Returns: total requirements, implemented count, verified count, coverage percentages, orphan lists. Use when user asks "what percentage is done?" or "what did we miss?" Also useful mid-build to track progress against requirements.',
    TraceStatusInputSchema.shape,
    async (args) => {
      try {
        const result = await traceStatus(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
