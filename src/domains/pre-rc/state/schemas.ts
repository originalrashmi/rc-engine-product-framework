/**
 * Zod schemas for Pre-RC domain state validation.
 *
 * Used by CheckpointStore to validate state on read -- corruption throws
 * instead of silently degrading. Mirrors the ResearchState interface in types.ts.
 */

import { z } from 'zod';
import { ComplexityDomain, ResearchStage, StageStatus, PersonaId } from '../types.js';
import { LLMProvider, GateStatus } from '../../../shared/types.js';

const ProductBriefSchema = z.object({
  name: z.string(),
  description: z.string(),
  rawInput: z.string(),
  timestamp: z.string(),
});

const ComplexityClassificationSchema = z.object({
  domain: z.nativeEnum(ComplexityDomain),
  confidence: z.number(),
  reasoning: z.string(),
  productClass: z.string(),
  complexityFactors: z.array(z.string()),
});

const PersonaSelectionSchema = z.object({
  activePersonas: z.array(z.nativeEnum(PersonaId)),
  skippedPersonas: z.array(
    z.object({
      id: z.nativeEnum(PersonaId),
      reason: z.string(),
    }),
  ),
  totalActive: z.number(),
  totalSkipped: z.number(),
});

const ResearchArtifactSchema = z.object({
  personaId: z.nativeEnum(PersonaId),
  personaName: z.string(),
  stage: z.nativeEnum(ResearchStage),
  content: z.string(),
  tokenCount: z.number(),
  llmUsed: z.nativeEnum(LLMProvider),
  timestamp: z.string(),
  filePath: z.string(),
});

const GateDecisionSchema = z.object({
  gateNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.nativeEnum(GateStatus),
  feedback: z.string(),
  timestamp: z.string(),
});

export const ResearchStateSchema = z.object({
  projectPath: z.string(),
  projectName: z.string(),
  brief: ProductBriefSchema,
  classification: ComplexityClassificationSchema.nullable(),
  personaSelection: PersonaSelectionSchema.nullable(),
  currentStage: z.nativeEnum(ResearchStage).nullable(),
  stageStatus: z.record(z.nativeEnum(ResearchStage), z.nativeEnum(StageStatus)),
  artifacts: z.array(ResearchArtifactSchema),
  gates: z.array(GateDecisionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  _synthesisOutput: z.string().optional(),
  _stressTestVerdict: z.enum(['GO', 'NO-GO', 'CONDITIONAL']).nullable().optional(),
  _stressTestConfidence: z.number().optional(),
  _stressTestOutput: z.string().optional(),
});

export type ResearchStateValidated = z.infer<typeof ResearchStateSchema>;
