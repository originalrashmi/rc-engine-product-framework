/**
 * Multi-Agent Forge Types
 *
 * Types for the parallel, role-based build system.
 * Build agents are specialized by task tag and work in layered phases.
 */

import type { TechStack } from '../types.js';

// ── Task Tags ───────────────────────────────────────────────────────────────

export type TaskTag = 'SETUP' | 'CONFIG' | 'DATA' | 'API' | 'UI' | 'INTEGRATION' | 'OBS' | 'TEST';

// ── Build Layers ────────────────────────────────────────────────────────────

/** Execution layers — tasks in the same layer run in parallel */
export enum BuildLayer {
  /** Layer 1: Platform setup + database schema */
  Foundation = 1,
  /** Layer 2: Backend API endpoints */
  Backend = 2,
  /** Layer 3: Frontend UI components */
  Frontend = 3,
  /** Layer 4: Integration + observability */
  Integration = 4,
  /** Layer 5: QA sweep + test execution */
  QA = 5,
}

/** Which tags belong to which layer */
export const TAG_LAYER_MAP: Record<TaskTag, BuildLayer> = {
  SETUP: BuildLayer.Foundation,
  CONFIG: BuildLayer.Foundation,
  DATA: BuildLayer.Foundation,
  API: BuildLayer.Backend,
  UI: BuildLayer.Frontend,
  INTEGRATION: BuildLayer.Integration,
  OBS: BuildLayer.Integration,
  TEST: BuildLayer.QA,
};

// ── Parsed Task ─────────────────────────────────────────────────────────────

export interface BuildTask {
  /** Task ID from the sequence phase (e.g. "TASK-001") */
  taskId: string;
  /** Task title/description */
  title: string;
  /** Primary tag determining which agent handles it */
  tag: TaskTag;
  /** Computed execution layer */
  layer: BuildLayer;
  /** Task IDs this task depends on */
  dependencies: string[];
  /** Estimated effort from sequence phase */
  effort?: string;
  /** Full task spec text from the task list */
  spec: string;
}

// ── Build Results ───────────────────────────────────────────────────────────

export interface TaskBuildResult {
  taskId: string;
  /** The agent that built this task */
  agentName: string;
  /** Generated code output */
  output: string;
  /** Files extracted from the output */
  generatedFiles: string[];
  /** Token usage for this build */
  tokensUsed: number;
  /** Cost in USD */
  costUsd: number;
  /** Duration in ms */
  durationMs: number;
  /** Whether the build succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface ReviewResult {
  taskId: string;
  /** Reviewer that performed this review */
  reviewerName: string;
  /** Review findings */
  findings: ReviewFinding[];
  /** Overall verdict */
  verdict: 'pass' | 'needs_rework' | 'critical';
  /** Summary text */
  summary: string;
}

export interface ReviewFinding {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  description: string;
  file?: string;
  line?: number;
}

// ── Forge State ─────────────────────────────────────────────────────────────

export interface ForgeContracts {
  /** Database schema (Prisma/SQLAlchemy) — populated after Layer 1 */
  schemas: string;
  /** API route contracts — populated after Layer 2 */
  apiRoutes: string;
  /** Component interfaces — populated after Layer 3 */
  componentInterfaces: string;
}

export interface ForgeState {
  /** Shared contracts updated after each layer */
  contracts: ForgeContracts;
  /** Results from completed build tasks */
  taskResults: Record<string, TaskBuildResult>;
  /** Review results */
  reviews: Record<string, ReviewResult>;
  /** Tech stack for generated code */
  techStack: TechStack;
  /** Project name */
  projectName: string;
  /** Project path */
  projectPath: string;
}

// ── Forge Metrics ───────────────────────────────────────────────────────────

export interface ForgeMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  totalCostUsd: number;
  totalTokens: number;
  reviewPassRate: number;
  reworkCount: number;
  layerTimings: Record<BuildLayer, number>;
}
