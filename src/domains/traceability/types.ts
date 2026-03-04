import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum RequirementCategory {
  FUNC = 'FUNC',
  SEC = 'SEC',
  PERF = 'PERF',
  UX = 'UX',
  DATA = 'DATA',
  INT = 'INT',
  OBS = 'OBS',
  BIZ = 'BIZ',
}

export type RequirementStatus = 'unimplemented' | 'implemented' | 'verified' | 'failed';
export type VerificationResult = 'pass' | 'fail' | 'untested';

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface Requirement {
  id: string;
  category: RequirementCategory;
  title: string;
  description: string;
  acceptanceCriteria: string;
  sourceSection: string;
  status: RequirementStatus;
  mappedTasks: string[];
  mappedFindings: string[];
  mappedFiles: string[];
  verificationResult: VerificationResult;
}

export interface TraceSummary {
  totalRequirements: number;
  implemented: number;
  verified: number;
  failed: number;
  orphanRequirements: string[];
  orphanTasks: string[];
  coveragePercent: number;
}

export interface TraceabilityMatrix {
  projectName: string;
  enhancedPrdPath: string;
  createdAt: string;
  updatedAt: string;
  requirements: Requirement[];
  summary: TraceSummary;
}

// ============================================================================
// PARSED DATA TYPES (from external agent files)
// ============================================================================

export interface ParsedRequirement {
  title: string;
  description: string;
  sourceSection: string;
  suggestedCategory: RequirementCategory;
}

export interface ParsedFinding {
  id: string;
  title: string;
  severity: string;
  module: string;
  category: string;
  description: string;
}

export interface ParsedTask {
  id: string;
  description: string;
  prdCriteria: string;
}

// ============================================================================
// ZOD INPUT SCHEMAS (MCP tool inputs)
// ============================================================================

export const TraceEnhancePrdInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  prd_content: z
    .string()
    .optional()
    .describe('Optional: PRD text directly. If not provided, auto-discovers from standard locations.'),
});

export const TraceMapFindingsInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});

export const TraceStatusInputSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});

// ============================================================================
// ZOD LLM OUTPUT SCHEMAS (for autonomous mode)
// ============================================================================

export const LLMRequirementSchema = z.object({
  title: z.string(),
  description: z.string(),
  sourceSection: z.string(),
  suggestedCategory: z.nativeEnum(RequirementCategory),
  acceptanceCriteria: z.string(),
});

export const LLMEnhancePrdOutputSchema = z.object({
  requirements: z.array(LLMRequirementSchema),
});

export const LLMFindingMappingSchema = z.object({
  requirementId: z.string(),
  findingId: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const LLMMapFindingsOutputSchema = z.object({
  findingMappings: z.array(LLMFindingMappingSchema),
  taskMappings: z.array(
    z.object({
      requirementId: z.string(),
      taskId: z.string(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
    }),
  ),
});
