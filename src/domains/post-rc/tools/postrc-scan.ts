import type { z } from 'zod';
import { Severity, GateDecision, ScanStatus } from '../types.js';
import type {
  ValidationModule,
  Finding,
  ScanResult,
  ScanSummary,
  ModuleSummary,
  PostRCState,
  PostRCScanInputSchema,
} from '../types.js';
import { loadState, ensureDirectories, saveState } from '../state/state-manager.js';
import { runSecurityModule } from '../modules/security/security-scanner.js';
import { runMonitoringModule } from '../modules/monitoring/monitoring-checker.js';
import { runClaimsAuditModule } from '../modules/legal/claims-auditor.js';
import { runProductLegalModule } from '../modules/legal/product-legal-auditor.js';
import { runEdgeCaseModule } from '../modules/edge-case/edge-case-analyzer.js';
import { runAppSecurityModule } from '../modules/application/application-security-auditor.js';
// Community edition - all features available
const readTier = (_path: string): string => 'pro';
import { PostRcCoordinator } from '../graph/postrc-coordinator.js';
import type { PostRcNodeHandlers } from '../graph/postrc-graph.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { audit } from '../../../shared/audit.js';
import { recordQualityMetrics } from '../../../shared/benchmark.js';
import { bridgeGraphToEventBus } from '../../../shared/graph-bridge.js';

type ScanInput = z.infer<typeof PostRCScanInputSchema>;

/**
 * Create node handlers for the Post-RC graph.
 * Closures capture the code context and config for the scan modules.
 */
function createScanHandlers(codeContext: string | undefined, state: PostRCState): PostRcNodeHandlers {
  return {
    scanSecurity: async (s) => {
      if (!state.config.securityPolicy.enabled) return { state: s };
      const findings = await runSecurityModule(s.projectPath, codeContext, state.config.securityPolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    scanMonitoring: async (s) => {
      if (!state.config.monitoringPolicy.enabled) return { state: s };
      const findings = await runMonitoringModule(s.projectPath, codeContext, state.config.monitoringPolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    scanLegalClaims: async (s) => {
      if (!state.config.legalPolicy?.enabled || !state.config.legalPolicy?.claimsAuditEnabled) {
        return { state: s };
      }
      const findings = await runClaimsAuditModule(s.projectPath, codeContext, state.config.legalPolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    scanLegalProduct: async (s) => {
      if (!state.config.legalPolicy?.enabled || !state.config.legalPolicy?.productLegalEnabled) {
        return { state: s };
      }
      const findings = await runProductLegalModule(s.projectPath, codeContext, state.config.legalPolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    scanEdgeCase: async (s) => {
      if (!state.config.edgeCasePolicy?.enabled) return { state: s };
      const findings = await runEdgeCaseModule(s.projectPath, codeContext, state.config.edgeCasePolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    scanAppSecurity: async (s) => {
      if (!state.config.appSecurityPolicy?.enabled) return { state: s };
      const findings = await runAppSecurityModule(s.projectPath, codeContext, state.config.appSecurityPolicy);
      return { state: { ...s, _pendingFindings: findings } };
    },
    mergeScans: (states, original) => {
      const allFindings: Finding[] = states.flatMap((s) => s._pendingFindings ?? []);

      // Filter overridden findings
      const activeOverrideIds = new Set(
        original.overrides.filter((o) => o.status === 'active').map((o) => o.findingId),
      );
      const activeFindings = allFindings.filter((f) => !activeOverrideIds.has(f.id));

      // Build summary
      const summary = buildScanSummary(activeFindings, state.config.activeModules);

      // Gate decision
      const gateDecision = computeGateDecision(summary, state.config.securityPolicy);

      const scanResult: ScanResult = {
        id: `scan-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: ScanStatus.Completed,
        modules: state.config.activeModules,
        findings: activeFindings,
        summary,
        gateDecision,
        duration_ms: 0, // Approximate - real timing is in the execution trace
      };

      return {
        ...original,
        scans: [...original.scans, scanResult],
        lastScan: scanResult,
        updatedAt: new Date().toISOString(),
        _pendingFindings: undefined, // Clear transient field
      };
    },
  };
}

export async function postrcScan(args: ScanInput): Promise<string> {
  const { project_path, code_context } = args;

  await ensureDirectories(project_path);
  const state = await loadState(project_path);

  // Create handlers and coordinator for parallel scan execution
  const handlers = createScanHandlers(code_context, state);
  const coordinator = new PostRcCoordinator(handlers);
  const unsubscribe = bridgeGraphToEventBus(coordinator.graphRunner, `postrc-scan-${project_path}`);

  const startTime = Date.now();

  // Run graph: fan-out -> [security, monitoring] -> fan-in -> ship-gate (pauses)
  const result = await coordinator.run(project_path, state);

  // Update duration on the scan result
  const lastScan = result.state.lastScan;
  if (lastScan) {
    lastScan.duration_ms = Date.now() - startTime;
  }

  unsubscribe();

  // Persist with markdown export (coordinator already saved to CheckpointStore)
  await saveState(project_path, result.state);
  audit('scan.complete', 'post-rc', project_path, {
    scanId: lastScan?.id,
    totalFindings: lastScan?.summary.totalFindings,
    gateDecision: lastScan?.gateDecision,
  });
  if (lastScan) {
    recordQualityMetrics(`postrc-${lastScan.id}`, {
      scanPassRate: lastScan.summary.totalFindings > 0 ? 0 : 1,
      totalFindings: lastScan.summary.totalFindings,
    });
  }

  // Pattern B: Generate remediation tasks if findings exist
  let remediationPath: string | null = null;
  if (lastScan && lastScan.findings.length > 0) {
    remediationPath = await generateRemediationTasks(project_path, lastScan.id, lastScan.findings);
  }

  // Format output with tier-aware redaction for edge case findings
  if (!lastScan) {
    return 'Scan completed but no results were produced.';
  }
  const tier = readTier(project_path);
  return formatScanOutput(
    lastScan,
    result.state.overrides.filter((o) => o.status === 'active').length,
    remediationPath,
    tier,
  );
}

// ── Summary and Gate Decision ────────────────────────────────────────────────

function buildScanSummary(activeFindings: Finding[], activeModules: ValidationModule[]): ScanSummary {
  return {
    totalFindings: activeFindings.length,
    critical: activeFindings.filter((f) => f.severity === Severity.Critical).length,
    high: activeFindings.filter((f) => f.severity === Severity.High).length,
    medium: activeFindings.filter((f) => f.severity === Severity.Medium).length,
    low: activeFindings.filter((f) => f.severity === Severity.Low).length,
    info: activeFindings.filter((f) => f.severity === Severity.Info).length,
    moduleSummaries: activeModules.map((mod) => {
      const modFindings = activeFindings.filter((f) => f.module === mod);
      return {
        module: mod,
        findings: modFindings.length,
        passed:
          modFindings.filter((f) => f.severity === Severity.Critical || f.severity === Severity.High).length === 0,
        details: `${modFindings.length} findings (${modFindings.filter((f) => f.severity === Severity.Critical).length} critical, ${modFindings.filter((f) => f.severity === Severity.High).length} high)`,
      } satisfies ModuleSummary;
    }),
  };
}

function computeGateDecision(
  summary: ScanSummary,
  securityPolicy: { blockOnCritical: boolean; blockOnHigh: boolean },
): GateDecision {
  if (summary.critical > 0 && securityPolicy.blockOnCritical) {
    return GateDecision.Block;
  }
  if (summary.high > 0 && securityPolicy.blockOnHigh) {
    return GateDecision.Block;
  }
  if (summary.high > 0 || summary.medium > 0) {
    return GateDecision.Warn;
  }
  return GateDecision.Pass;
}

// ── Output Formatting ────────────────────────────────────────────────────────

function formatScanOutput(
  scan: ScanResult,
  activeOverrides: number,
  remediationPath: string | null = null,
  tier: string = 'free',
): string {
  const isProOrHigher = tier === 'pro' || tier === 'enterprise';
  const gateIcon =
    scan.gateDecision === GateDecision.Pass ? 'PASS' : scan.gateDecision === GateDecision.Warn ? 'WARN' : 'BLOCK';

  let output = `
===============================================
  POST-RC METHOD: VALIDATION SCAN
===============================================

  Scan ID: ${scan.id}
  Duration: ${scan.duration_ms}ms
  Modules: ${scan.modules.join(', ')}

  FINDINGS SUMMARY:
    Critical: ${scan.summary.critical}
    High:     ${scan.summary.high}
    Medium:   ${scan.summary.medium}
    Low:      ${scan.summary.low}
    Info:     ${scan.summary.info}
    Total:    ${scan.summary.totalFindings}
    Overridden: ${activeOverrides} active overrides

  MODULE RESULTS:
`;

  for (const mod of scan.summary.moduleSummaries) {
    output += `    ${mod.passed ? 'Y' : 'N'}  ${mod.module}: ${mod.details}\n`;
  }

  output += `
  GATE DECISION: ${gateIcon}
`;

  // Edge case teaser for non-Pro tiers
  const ecxFindings = scan.findings.filter((f) => f.module === 'edge-case');
  if (ecxFindings.length > 0 && !isProOrHigher) {
    const ecxCategories = new Set(ecxFindings.map((f) => f.category));
    output += `
  EDGE CASE ANALYSIS (Pro feature):
    ${ecxFindings.length} edge case(s) found across ${ecxCategories.size} category(s).
    Upgrade to Pro to see the full matrix with remediation details.
`;
  }

  if (scan.findings.length > 0) {
    output += '\n  FINDINGS:\n';
    for (const finding of scan.findings) {
      // Redact edge case finding details for non-Pro tiers
      if (finding.module === 'edge-case' && !isProOrHigher) {
        output += `\n    [${finding.severity.toUpperCase()}] ${finding.id}: ${finding.title}`;
        output += `\n      [Pro feature] Upgrade to Pro for details and remediation.\n`;
        continue;
      }

      const sevIcon =
        finding.severity === Severity.Critical
          ? 'CRITICAL'
          : finding.severity === Severity.High
            ? 'HIGH'
            : finding.severity === Severity.Medium
              ? 'MEDIUM'
              : 'LOW';
      output += `\n    [${sevIcon}] ${finding.id}: ${finding.title}`;
      output += `\n      ${finding.description}`;
      if (finding.cweId) output += `\n      CWE: ${finding.cweId}`;
      if (finding.filePath) output += `\n      File: ${finding.filePath}`;
      output += `\n      Fix: ${finding.remediation}\n`;
    }
  }

  if (remediationPath) {
    output += `
  REMEDIATION TASKS GENERATED:
    ${remediationPath}
    Feed these tasks back into RC Method (rc_forge_task) to fix.
`;
  }

  // Legal findings disclaimer
  const hasLegalFindings = scan.findings.some((f) => f.module === 'legal-claims' || f.module === 'legal-product');
  if (hasLegalFindings) {
    output += `
  LEGAL DISCLAIMER:
    Legal findings are automated compliance checks, not legal counsel.
    Consult a qualified attorney for advice specific to your product
    and jurisdiction.
`;
  }

  output += `
  NOTICE:
    This scan uses static pattern analysis and AI heuristics. It does not
    replace professional security auditing, penetration testing, or legal
    review. A "PASS" decision means no blocking patterns were detected --
    not a guarantee of security, compliance, or production readiness.
    Toerana accepts no liability for issues not detected by this scan.

  NEXT STEPS:
    -> "postrc_override" to override specific findings
    -> "postrc_report" to generate full report artifact
    -> "postrc_gate" with "approve" to ship or "reject" to fix${remediationPath ? '\n    -> Review remediation tasks and feed into RC Method' : ''}
===============================================`;

  return output;
}

async function generateRemediationTasks(projectPath: string, scanId: string, findings: Finding[]): Promise<string> {
  const tasksDir = join(projectPath, 'post-rc', 'remediation');
  await mkdir(tasksDir, { recursive: true });

  const fileName = `REMEDIATION-TASKS-${scanId}.md`;
  const filePath = join(tasksDir, fileName);

  let md = `# Post-RC Remediation Tasks\n\n`;
  md += `> Auto-generated by Post-RC Method scan \`${scanId}\`\n`;
  md += `> Generated: ${new Date().toISOString()}\n`;
  md += `> Feed these tasks into RC Method using rc_forge_task\n\n`;

  // Group findings by module
  const byModule = new Map<string, Finding[]>();
  for (const f of findings) {
    const group = byModule.get(f.module) || [];
    group.push(f);
    byModule.set(f.module, group);
  }

  // Sort by severity within each module
  const severityOrder: Record<string, number> = {
    [Severity.Critical]: 0,
    [Severity.High]: 1,
    [Severity.Medium]: 2,
    [Severity.Low]: 3,
    [Severity.Info]: 4,
  };

  let taskNum = 0;
  for (const [module, moduleFindings] of byModule) {
    md += `## Module: ${module.charAt(0).toUpperCase() + module.slice(1)}\n\n`;

    const sorted = moduleFindings.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

    for (const finding of sorted) {
      taskNum++;
      const tagMap: Record<string, string> = {
        security: '[SECURITY]',
        monitoring: '[OBSERVABILITY]',
        'legal-claims': '[LEGAL-CLAIMS]',
        'legal-product': '[LEGAL]',
        'edge-case': '[EDGE-CASE]',
        'app-security': '[APP-SECURITY]',
      };
      const tag = tagMap[module] || `[${module.toUpperCase()}]`;
      const priority =
        finding.severity === Severity.Critical
          ? 'P0'
          : finding.severity === Severity.High
            ? 'P1'
            : finding.severity === Severity.Medium
              ? 'P2'
              : 'P3';

      md += `### Task ${taskNum}: ${tag} ${finding.title}\n\n`;
      md += `- **Priority:** ${priority} (${finding.severity.toUpperCase()})\n`;
      md += `- **Finding ID:** ${finding.id}\n`;
      if (finding.cweId) md += `- **CWE:** ${finding.cweId}\n`;
      if (finding.filePath) md += `- **File:** ${finding.filePath}\n`;
      if (finding.lineRange) md += `- **Lines:** ${finding.lineRange.start}-${finding.lineRange.end}\n`;
      md += `- **Category:** ${finding.category}\n`;
      md += `\n**Problem:**\n${finding.description}\n`;
      md += `\n**Remediation:**\n${finding.remediation}\n\n`;
      md += `---\n\n`;
    }
  }

  md += `## Summary\n\n`;
  md += `| Priority | Count |\n|----------|-------|\n`;
  md += `| P0 (Critical) | ${findings.filter((f) => f.severity === Severity.Critical).length} |\n`;
  md += `| P1 (High) | ${findings.filter((f) => f.severity === Severity.High).length} |\n`;
  md += `| P2 (Medium) | ${findings.filter((f) => f.severity === Severity.Medium).length} |\n`;
  md += `| P3 (Low) | ${findings.filter((f) => f.severity === Severity.Low).length} |\n`;
  md += `| **Total** | **${findings.length}** |\n`;

  md += `\n---\n\n`;
  md += `## Disclaimer\n\n`;
  md += `These remediation tasks are auto-generated based on automated pattern matching and AI analysis. `;
  md += `They do not constitute professional security, legal, or compliance advice. `;
  md += `Findings may contain false positives or miss issues not covered by the scanner's pattern set. `;
  md += `Consult qualified professionals before making compliance, security, or legal decisions based on these findings.\n`;

  await writeFile(filePath, md, 'utf-8');
  return `post-rc/remediation/${fileName}`;
}
