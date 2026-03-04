import { z } from 'zod';
import { LLMProvider, GateStatus } from '../../shared/types.js';

// Re-export shared types used by Pre-RC domain consumers
export { LLMProvider, GateStatus };

// ============================================================================
// ENUMS
// ============================================================================

export enum ComplexityDomain {
  Clear = 'clear',
  Complicated = 'complicated',
  Complex = 'complex',
  Chaotic = 'chaotic',
}

export enum ResearchStage {
  MetaOrchestration = 'stage-1-meta',
  UserIntelligence = 'stage-2-user-intelligence',
  BusinessMarket = 'stage-3-business-market',
  Technical = 'stage-4-technical',
  UXCognitive = 'stage-5-ux',
  Validation = 'stage-6-validation',
}

export enum PersonaId {
  MetaProductArchitect = 'meta-product-architect',
  ResearchProgramDirector = 'research-program-director',
  TokenEconomicsOptimizer = 'token-economics-optimizer',
  PrimaryUserArchetype = 'primary-user-archetype',
  SecondaryEdgeUser = 'secondary-edge-user',
  DemandSideTheorist = 'demand-side-theorist',
  AccessibilityAdvocate = 'accessibility-advocate',
  MarketLandscapeAnalyst = 'market-landscape-analyst',
  BusinessModelStrategist = 'business-model-strategist',
  GTMStrategist = 'gtm-strategist',
  SystemsArchitect = 'systems-architect',
  AIMLSpecialist = 'ai-ml-specialist',
  DataTelemetryStrategist = 'data-telemetry-strategist',
  SecurityComplianceAnalyst = 'security-compliance-analyst',
  UXSystemsDesigner = 'ux-systems-designer',
  CognitiveLoadAnalyst = 'cognitive-load-analyst',
  ContentLanguageStrategist = 'content-language-strategist',
  PersonaCoverageAuditor = 'persona-coverage-auditor',
  ResearchSynthesisSpecialist = 'research-synthesis-specialist',
  PRDTranslationSpecialist = 'prd-translation-specialist',
}

export enum StageStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Completed = 'completed',
  Skipped = 'skipped',
}

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface ProductBrief {
  name: string;
  description: string;
  rawInput: string;
  timestamp: string;
}

export interface ComplexityClassification {
  domain: ComplexityDomain;
  confidence: number;
  reasoning: string;
  productClass: string;
  complexityFactors: string[];
}

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  stage: ResearchStage;
  llmProvider: LLMProvider;
  alwaysRuns: boolean;
  activationConditions: ActivationCondition[];
  tokenBudget: number;
  knowledgeFile: string;
  /** When true, the persona's LLM call will include web search grounding (citations, recency). */
  webGrounded?: boolean;
}

export interface ActivationCondition {
  type: 'complexity' | 'product-class' | 'always';
  values: string[];
}

export interface PersonaSelection {
  activePersonas: PersonaId[];
  skippedPersonas: Array<{ id: PersonaId; reason: string }>;
  totalActive: number;
  totalSkipped: number;
}

export interface ResearchArtifact {
  personaId: PersonaId;
  personaName: string;
  stage: ResearchStage;
  content: string;
  tokenCount: number;
  llmUsed: LLMProvider;
  timestamp: string;
  filePath: string;
}

export interface GateDecision {
  gateNumber: 1 | 2 | 3;
  status: GateStatus;
  feedback: string;
  timestamp: string;
}

export interface ResearchState {
  projectPath: string;
  projectName: string;
  brief: ProductBrief;
  classification: ComplexityClassification | null;
  personaSelection: PersonaSelection | null;
  currentStage: ResearchStage | null;
  stageStatus: Record<ResearchStage, StageStatus>;
  artifacts: ResearchArtifact[];
  gates: GateDecision[];
  createdAt: string;
  updatedAt: string;
  /** Transient: synthesis output stored by graph handler, consumed by tool layer. */
  _synthesisOutput?: string;
  /** Transient: stress test verdict stored for orchestrator consumption. */
  _stressTestVerdict?: 'GO' | 'NO-GO' | 'CONDITIONAL' | null;
  _stressTestConfidence?: number;
  /** Transient: stress test output stored by graph handler, consumed by tool layer. */
  _stressTestOutput?: string;
}

// ============================================================================
// TOOL INPUT SCHEMAS (Zod)
// ============================================================================

export const PrcStartSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  project_name: z.string().describe('Name of the project'),
  brief: z.string().describe('The product idea, brief, or description to research'),
});

export const PrcClassifySchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});

export const PrcGateSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  decision: z.string().describe("Gate decision: 'approve', 'reject [reason]', or 'question [text]'"),
  feedback: z.string().optional().describe('Optional additional feedback'),
});

export const PrcRunStageSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  stage: z.string().describe('Research stage to execute (e.g., "stage-1-meta", "stage-2-user-intelligence")'),
});

export const PrcStatusSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});

export const PrcSynthesizeSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
  include_task_deck: z
    .boolean()
    .optional()
    .describe(
      'When true, also generates a consulting-grade HTML deck for the task list (separate file). Defaults to false.',
    ),
});

export const PrcStressTestSchema = z.object({
  project_path: z.string().describe('Absolute path to the project directory'),
});
