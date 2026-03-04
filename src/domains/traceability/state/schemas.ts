/**
 * Zod schemas for Traceability domain state validation.
 *
 * Used by CheckpointStore to validate state on read. Mirrors the
 * TraceabilityMatrix interface in types.ts.
 */

import { z } from 'zod';
import { RequirementCategory } from '../types.js';

const RequirementSchema = z.object({
  id: z.string(),
  category: z.nativeEnum(RequirementCategory),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.string(),
  sourceSection: z.string(),
  status: z.enum(['unimplemented', 'implemented', 'verified', 'failed']),
  mappedTasks: z.array(z.string()),
  mappedFindings: z.array(z.string()),
  mappedFiles: z.array(z.string()),
  verificationResult: z.enum(['pass', 'fail', 'untested']),
});

const TraceSummarySchema = z.object({
  totalRequirements: z.number(),
  implemented: z.number(),
  verified: z.number(),
  failed: z.number(),
  orphanRequirements: z.array(z.string()),
  orphanTasks: z.array(z.string()),
  coveragePercent: z.number(),
});

export const TraceabilityMatrixSchema = z.object({
  projectName: z.string(),
  enhancedPrdPath: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requirements: z.array(RequirementSchema),
  summary: TraceSummarySchema,
});

export type TraceabilityMatrixValidated = z.infer<typeof TraceabilityMatrixSchema>;
