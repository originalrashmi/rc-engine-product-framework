/**
 * Zod schemas for Post-RC domain state validation.
 *
 * Used by CheckpointStore to validate state on read. Mirrors the
 * PostRCState interface in types.ts.
 */

import { z } from 'zod';
import { ValidationModule, Severity, GateDecision, ScanStatus, OverrideStatus } from '../types.js';

const FindingSchema = z.object({
  id: z.string(),
  module: z.nativeEnum(ValidationModule),
  severity: z.nativeEnum(Severity),
  title: z.string(),
  description: z.string(),
  cweId: z.string().optional(),
  filePath: z.string().optional(),
  lineRange: z.object({ start: z.number(), end: z.number() }).optional(),
  remediation: z.string(),
  category: z.string(),
});

const ModuleSummarySchema = z.object({
  module: z.nativeEnum(ValidationModule),
  findings: z.number(),
  passed: z.boolean(),
  details: z.string(),
});

const ScanSummarySchema = z.object({
  totalFindings: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  info: z.number(),
  moduleSummaries: z.array(ModuleSummarySchema),
});

const ScanResultSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  status: z.nativeEnum(ScanStatus),
  modules: z.array(z.nativeEnum(ValidationModule)),
  findings: z.array(FindingSchema),
  summary: ScanSummarySchema,
  gateDecision: z.nativeEnum(GateDecision),
  duration_ms: z.number(),
});

const OverrideSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  reason: z.string(),
  overriddenBy: z.string(),
  timestamp: z.string(),
  expiresAt: z.string().optional(),
  status: z.nativeEnum(OverrideStatus),
});

const SecurityPolicySchema = z.object({
  enabled: z.boolean(),
  blockOnCritical: z.boolean(),
  blockOnHigh: z.boolean(),
  suppressedCWEs: z.array(z.string()),
  customPatterns: z.array(z.string()),
});

const MonitoringPolicySchema = z.object({
  enabled: z.boolean(),
  requireErrorTracking: z.boolean(),
  requireAnalytics: z.boolean(),
  requireDashboards: z.boolean(),
  requireAlerts: z.boolean(),
});

const LegalPolicySchema = z.object({
  enabled: z.boolean(),
  claimsAuditEnabled: z.boolean(),
  productLegalEnabled: z.boolean(),
  productDomain: z.enum(['healthcare', 'finance', 'education', 'children', 'general']).optional(),
  jurisdiction: z.enum(['us', 'eu', 'both']).optional(),
  suppressedFindings: z.array(z.string()),
  checkLicenses: z.boolean(),
  checkAccessibility: z.boolean(),
});

const ProjectConfigSchema = z.object({
  projectPath: z.string(),
  projectName: z.string(),
  activeModules: z.array(z.nativeEnum(ValidationModule)),
  securityPolicy: SecurityPolicySchema,
  monitoringPolicy: MonitoringPolicySchema,
  legalPolicy: LegalPolicySchema.optional(),
});

const GateHistoryEntrySchema = z.object({
  decision: z.enum(['approved', 'rejected', 'question']),
  scanId: z.string(),
  feedback: z.string().optional(),
  timestamp: z.string(),
});

export const PostRCStateSchema = z.object({
  projectPath: z.string(),
  projectName: z.string(),
  config: ProjectConfigSchema,
  scans: z.array(ScanResultSchema),
  overrides: z.array(OverrideSchema),
  lastScan: ScanResultSchema.optional(),
  gateHistory: z.array(GateHistoryEntrySchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PostRCStateValidated = z.infer<typeof PostRCStateSchema>;
