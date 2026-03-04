// RC Method Agent - Domain Types
// GateStatus is imported from the shared layer (enum with same string values)
import { GateStatus } from '../../shared/types.js';

export { GateStatus };

export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type UxMode = 'standard' | 'selective' | 'deep_dive';

export const PHASE_NAMES: Record<Phase, string> = {
  1: 'Illuminate',
  2: 'Define',
  3: 'Architect',
  4: 'Sequence',
  5: 'Validate',
  6: 'Forge',
  7: 'Connect',
  8: 'Compound',
};

// All phases have a review gate. Phase 6 (Forge) gate fires after all tasks complete.
export const GATED_PHASES: Phase[] = [1, 2, 3, 4, 5, 6, 7, 8];

export interface GateRecord {
  status: GateStatus;
  date?: string;
  feedback?: string;
}

export interface PreRcSource {
  prdPath: string;
  statePath: string;
  importedAt: string;
  artifactCount: number;
  personaCount: number;
}

export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface ForgeTaskRecord {
  taskId: string;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  generatedFiles?: string[];
}

export interface DesignSelection {
  optionId: string;
  specPath: string;
  selectedAt: string;
}

export interface ProjectState {
  projectName: string;
  projectPath: string;
  currentPhase: Phase;
  gates: Partial<Record<Phase, GateRecord>>;
  artifacts: string[];
  uxScore: number | null;
  uxMode: UxMode | null;
  preRcSource?: PreRcSource;
  forgeTasks?: Record<string, ForgeTaskRecord>;
  selectedDesign?: DesignSelection;
  /** Transient: operator input for the current phase handler. Not persisted. */
  _pendingInput?: string;
  /** Transient: output text from the last phase handler. Not persisted. */
  _lastOutput?: string;
  /** Transient: task ID for forge handler. Not persisted. */
  _forgeTaskId?: string;
}

export interface AgentResult {
  text: string;
  artifacts?: string[];
  gateReady?: boolean;
  phaseComplete?: boolean;
}

// UX specialist routing table (from rc-ux-core.md)
export const UX_ROUTING_TABLE: Record<string, string[]> = {
  form: ['ux-interaction', 'ux-a11y', 'ux-copy'],
  dashboard: ['ux-hierarchy', 'ux-navigation', 'ux-system'],
  onboarding: ['ux-behavior', 'ux-copy', 'ux-interaction'],
  admin: ['ux-navigation', 'ux-system', 'ux-a11y'],
  payment: ['ux-behavior', 'ux-interaction', 'ux-copy'],
  component_library: ['ux-system', 'ux-code', 'ux-a11y'],
  content: ['ux-hierarchy', 'ux-copy', 'ux-a11y'],
  navigation: ['ux-navigation', 'ux-hierarchy', 'ux-system'],
  audit: [
    'ux-navigation',
    'ux-system',
    'ux-interaction',
    'ux-copy',
    'ux-behavior',
    'ux-hierarchy',
    'ux-a11y',
    'ux-code',
  ],
};
