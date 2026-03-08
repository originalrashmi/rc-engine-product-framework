import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  PostRCScanInputSchema,
  PostRCOverrideInputSchema,
  PostRCReportInputSchema,
  PostRCConfigureInputSchema,
  PostRCGateInputSchema,
  PostRCStatusInputSchema,
  PostRCObservabilitySpecInputSchema,
} from './types.js';
import { postrcScan } from './tools/postrc-scan.js';
import { postrcOverride } from './tools/postrc-override.js';
import { postrcReport } from './tools/postrc-report.js';
import { postrcConfigure } from './tools/postrc-configure.js';
import { postrcGate } from './tools/postrc-gate.js';
import { postrcStatus } from './tools/postrc-status.js';
import { postrcObservabilitySpec } from './tools/postrc-observability-spec.js';

/**
 * Register all Post-RC domain tools on the shared MCP server.
 */
export function registerPostRcTools(server: McpServer): void {
  // Tool 1: Run validation scan across active modules
  server.tool(
    'postrc_scan',
    'Run AFTER building (Phase 6 Forge complete). Scans code for security vulnerabilities, checks monitoring instrumentation, and optionally runs legal compliance review (Pro tier - enable via postrc_configure with legal_enabled=true). Pass code_context with the actual project code. Returns findings by severity (critical/high/medium/low) with CWE/legal references. LONG-RUNNING: involves LLM analysis. After success: present findings to user in plain language. Then call postrc_gate for ship/no-ship decision. If critical findings exist, also generates REMEDIATION-TASKS file.',
    PostRCScanInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcScan(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 2: Override a finding with audit trail
  server.tool(
    'postrc_override',
    'Override a specific scan finding when the user accepts the risk. Requires: finding_id (from postrc_scan results) and justification (why this is acceptable). Creates an immutable audit record. Use when postrc_gate is blocked by a finding the user wants to accept. ALWAYS warn the user if overriding critical/high severity - explain the risk in plain language. Optionally set an expiration date. After override: re-run postrc_gate to re-evaluate ship decision.',
    PostRCOverrideInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcOverride(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 3: Generate validation report artifact
  server.tool(
    'postrc_report',
    'Generate a formal validation report from scan results. Call after postrc_scan to produce a shareable markdown document with: findings summary, severity breakdown, override records, and remediation recommendations. Useful for stakeholders, compliance, or audit trails. Saved to post-rc/. Read-only - does not modify scan state.',
    PostRCReportInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcReport(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 4: Configure per-project validation policy
  server.tool(
    'postrc_configure',
    'OPTIONAL - configure validation policy BEFORE running postrc_scan. Sets: which modules are active (security, monitoring, legal-claims, legal-product), whether to block on critical/high findings, CWE suppressions (known false positives), monitoring requirements, and legal review settings (Pro tier: product domain, jurisdiction, license/accessibility checks). Defaults are reasonable - only call this if the user has specific compliance or risk tolerance requirements. Saved to post-rc/ state.',
    PostRCConfigureInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcConfigure(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 5: Ship/no-ship gate decision
  server.tool(
    'postrc_gate',
    'Final checkpoint - ship/no-ship decision. Call after postrc_scan completes and user has reviewed findings. NEVER auto-approve - always present findings summary first. Returns PASS (safe to ship), WARN (issues exist but not blocking), or BLOCK (critical issues must be fixed or overridden). If BLOCK: user must either fix issues and re-scan, or use postrc_override to accept risks. After PASS/approved: pipeline is complete for the build phase. Consider running trace_map_findings next for coverage metrics.',
    PostRCGateInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcGate(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 6: Show scan progress and findings summary
  server.tool(
    'postrc_status',
    'Check Post-RC validation progress. Read-only, safe to call anytime. Returns: active modules, latest scan ID and findings count, override count, and gate status. Use this to orient yourself when resuming a session or when the user asks about validation status. Call before postrc_gate if you need to verify scan results are available.',
    PostRCStatusInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcStatus(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // Tool 7: Generate observability spec from PRD (pre-flight, Pattern A)
  server.tool(
    'postrc_generate_observability_spec',
    'PRE-FLIGHT tool - run BEFORE RC Method build phase, ideally after rc_define (Phase 2). Generates an observability requirements document from the PRD: error tracking setup, analytics events, SLO definitions, dashboard specs, and alerting rules. This ensures monitoring is designed in, not bolted on after shipping. Output feeds into rc_architect as a companion to the PRD. Optional but strongly recommended for production applications.',
    PostRCObservabilitySpecInputSchema.shape,
    async (args) => {
      try {
        const result = await postrcObservabilitySpec(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
