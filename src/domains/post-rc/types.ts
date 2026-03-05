import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum ValidationModule {
  Security = 'security',
  Monitoring = 'monitoring',
  LegalClaims = 'legal-claims',
  LegalProduct = 'legal-product',
  EdgeCase = 'edge-case',
  // Future modules:
  // Performance = 'performance',
  // TestAdequacy = 'test-adequacy',
  // DependencyHealth = 'dependency-health',
  // Architecture = 'architecture',
  // Accessibility = 'accessibility',
}

export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  Info = 'info',
}

export enum GateDecision {
  Pass = 'pass',
  Warn = 'warn',
  Block = 'block',
}

export enum ScanStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

export enum OverrideStatus {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
}

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface Finding {
  id: string;
  module: ValidationModule;
  severity: Severity;
  title: string;
  description: string;
  cweId?: string;
  filePath?: string;
  lineRange?: { start: number; end: number };
  remediation: string;
  category: string;
}

export interface ScanResult {
  id: string;
  timestamp: string;
  status: ScanStatus;
  modules: ValidationModule[];
  findings: Finding[];
  summary: ScanSummary;
  gateDecision: GateDecision;
  duration_ms: number;
}

export interface ScanSummary {
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  moduleSummaries: ModuleSummary[];
}

export interface ModuleSummary {
  module: ValidationModule;
  findings: number;
  passed: boolean;
  details: string;
}

export interface Override {
  id: string;
  findingId: string;
  reason: string;
  overriddenBy: string;
  timestamp: string;
  expiresAt?: string;
  status: OverrideStatus;
}

export type EdgeCaseCategory =
  | 'input-boundary'
  | 'error-state'
  | 'concurrency'
  | 'data-integrity'
  | 'integration'
  | 'state-transition'
  | 'performance-edge';

export interface EdgeCasePolicy {
  enabled: boolean;
  /** Categories to scan. Defaults to all if omitted. */
  categories?: EdgeCaseCategory[];
  /** Severity threshold below which findings are omitted. Defaults to 'info'. */
  minSeverity?: Severity;
  /** Finding IDs to suppress from output. */
  suppressedFindings: string[];
  /** Block ship gate on critical edge case findings. */
  blockOnCritical: boolean;
}

export interface ProjectConfig {
  projectPath: string;
  projectName: string;
  activeModules: ValidationModule[];
  securityPolicy: SecurityPolicy;
  monitoringPolicy: MonitoringPolicy;
  legalPolicy?: LegalPolicy;
  edgeCasePolicy?: EdgeCasePolicy;
}

export interface SecurityPolicy {
  enabled: boolean;
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  suppressedCWEs: string[];
  customPatterns: string[];
}

export interface MonitoringPolicy {
  enabled: boolean;
  requireErrorTracking: boolean;
  requireAnalytics: boolean;
  requireDashboards: boolean;
  requireAlerts: boolean;
}

export interface LegalPolicy {
  enabled: boolean;
  /** Run claims audit against the RC Engine framework itself. */
  claimsAuditEnabled: boolean;
  /** Run product legal review against user's product. */
  productLegalEnabled: boolean;
  /** Product domain for regulatory detection. */
  productDomain?: 'healthcare' | 'finance' | 'education' | 'children' | 'general';
  /** Jurisdiction for compliance checks. */
  jurisdiction?: 'us' | 'eu' | 'both';
  /** Suppressed legal finding IDs. */
  suppressedFindings: string[];
  /** Check dependency license compliance. */
  checkLicenses: boolean;
  /** Check accessibility compliance (ADA/WCAG). */
  checkAccessibility: boolean;
}

export interface GateHistoryEntry {
  decision: 'approved' | 'rejected' | 'question';
  scanId: string;
  feedback?: string;
  timestamp: string;
}

export interface PostRCState {
  projectPath: string;
  projectName: string;
  config: ProjectConfig;
  scans: ScanResult[];
  overrides: Override[];
  lastScan?: ScanResult;
  gateHistory?: GateHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  /** Transient: pending findings from parallel scan modules (cleared after merge). Not persisted. */
  _pendingFindings?: Finding[];
}

// ============================================================================
// ZOD SCHEMAS (for MCP tool input validation)
// ============================================================================

export const PostRCScanInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  modules: z.array(z.nativeEnum(ValidationModule)).optional().describe('Modules to run (default: all active)'),
  code_context: z
    .string()
    .optional()
    .describe('Code or file content to scan (optional - will read from rc-method/tasks/ if not provided)'),
});

export const PostRCOverrideInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  finding_id: z.string().describe('ID of the finding to override'),
  reason: z.string().describe('Justification for the override'),
  expires_days: z.number().optional().describe('Override expiration in days (default: 90)'),
});

export const PostRCReportInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  scan_id: z.string().optional().describe('Specific scan ID (default: latest)'),
});

export const PostRCConfigureInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  project_name: z.string().optional().describe('Project name'),
  modules: z.array(z.nativeEnum(ValidationModule)).optional().describe('Active validation modules'),
  block_on_critical: z.boolean().optional().describe('Block deployment on Critical findings'),
  block_on_high: z.boolean().optional().describe('Block deployment on High findings'),
  suppressed_cwes: z.array(z.string()).optional().describe('CWE IDs to suppress'),
  require_error_tracking: z.boolean().optional().describe('Require error tracking instrumentation'),
  require_analytics: z.boolean().optional().describe('Require analytics instrumentation'),
  // Legal policy configuration (Pro tier)
  legal_enabled: z.boolean().optional().describe('Enable legal review modules'),
  legal_claims_audit: z.boolean().optional().describe('Enable framework claims audit (self-audit)'),
  legal_product_audit: z.boolean().optional().describe('Enable product legal review'),
  product_domain: z
    .enum(['healthcare', 'finance', 'education', 'children', 'general'])
    .optional()
    .describe('Product domain for regulatory detection (e.g., healthcare triggers HIPAA checks)'),
  jurisdiction: z
    .enum(['us', 'eu', 'both'])
    .optional()
    .describe('Jurisdiction for compliance checks (e.g., eu triggers GDPR checks)'),
  check_licenses: z.boolean().optional().describe('Check dependency license compliance'),
  check_accessibility: z.boolean().optional().describe('Check accessibility compliance (ADA/WCAG)'),
  // Edge case policy configuration (Pro tier)
  edge_case_enabled: z.boolean().optional().describe('Enable edge case analysis module (Pro tier)'),
  edge_case_block_on_critical: z.boolean().optional().describe('Block ship gate on critical edge case findings'),
  edge_case_categories: z
    .array(
      z.enum([
        'input-boundary',
        'error-state',
        'concurrency',
        'data-integrity',
        'integration',
        'state-transition',
        'performance-edge',
      ]),
    )
    .optional()
    .describe('Edge case categories to scan (default: all)'),
});

export const PostRCGateInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  decision: z.string().describe('Checkpoint decision: "approve", "reject [reason]", or "question [text]"'),
  feedback: z.string().optional().describe('Optional additional feedback'),
});

export const PostRCStatusInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});

export const PostRCObservabilitySpecInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  prd_content: z
    .string()
    .optional()
    .describe('PRD content to analyze (optional - will read from rc-method/prds/ or pre-rc-research/ if not provided)'),
});
