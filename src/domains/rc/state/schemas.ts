/**
 * Zod schemas for RC Method domain state validation.
 *
 * Used by CheckpointStore to validate state on read. Mirrors the
 * ProjectState interface in types.ts.
 */

import { z } from 'zod';
import { GateStatus } from '../../../shared/types.js';

const PhaseSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

const GateRecordSchema = z.object({
  status: z.nativeEnum(GateStatus),
  date: z.string().optional(),
  feedback: z.string().optional(),
});

const PreRcSourceSchema = z.object({
  prdPath: z.string(),
  statePath: z.string(),
  importedAt: z.string(),
  artifactCount: z.number(),
  personaCount: z.number(),
});

const ForgeTaskRecordSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'in_progress', 'complete', 'failed']),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  generatedFiles: z.array(z.string()).optional(),
});

const DesignSelectionSchema = z.object({
  optionId: z.string(),
  specPath: z.string(),
  selectedAt: z.string(),
});

export const ProjectStateSchema = z.object({
  projectName: z.string(),
  projectPath: z.string(),
  currentPhase: PhaseSchema,
  gates: z.record(z.string(), GateRecordSchema),
  artifacts: z.array(z.string()),
  uxScore: z.number().nullable(),
  uxMode: z.enum(['standard', 'selective', 'deep_dive']).nullable(),
  preRcSource: PreRcSourceSchema.optional(),
  forgeTasks: z.record(z.string(), ForgeTaskRecordSchema).optional(),
  selectedDesign: DesignSelectionSchema.optional(),
  // Transient fields -- used for inter-node communication within a graph run.
  // Optional so existing persisted state without them still validates.
  _pendingInput: z.string().optional(),
  _lastOutput: z.string().optional(),
  _forgeTaskId: z.string().optional(),
});

export type ProjectStateValidated = z.infer<typeof ProjectStateSchema>;
