import type {
  ResearchState,
  ProductBrief,
  ComplexityClassification,
  PersonaSelection,
  ResearchArtifact,
  GateDecision,
} from '../types.js';
import { ResearchStage, StageStatus, GateStatus } from '../types.js';

export class ResearchStateManager {
  private state: ResearchState;

  private constructor(state: ResearchState) {
    this.state = state;
  }

  static create(projectPath: string, projectName: string, brief: ProductBrief): ResearchStateManager {
    const now = new Date().toISOString();
    return new ResearchStateManager({
      projectPath,
      projectName,
      brief,
      classification: null,
      personaSelection: null,
      currentStage: null,
      stageStatus: {
        [ResearchStage.MetaOrchestration]: StageStatus.NotStarted,
        [ResearchStage.UserIntelligence]: StageStatus.NotStarted,
        [ResearchStage.BusinessMarket]: StageStatus.NotStarted,
        [ResearchStage.Technical]: StageStatus.NotStarted,
        [ResearchStage.UXCognitive]: StageStatus.NotStarted,
        [ResearchStage.Validation]: StageStatus.NotStarted,
      },
      artifacts: [],
      gates: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromState(state: ResearchState): ResearchStateManager {
    return new ResearchStateManager(state);
  }

  getState(): ResearchState {
    return this.state;
  }

  // --- Classification ---

  setClassification(classification: ComplexityClassification): void {
    this.state.classification = classification;
    this.touch();
  }

  setPersonaSelection(selection: PersonaSelection): void {
    this.state.personaSelection = selection;
    this.touch();
  }

  // --- Stage management ---

  startStage(stage: ResearchStage): void {
    this.state.currentStage = stage;
    this.state.stageStatus[stage] = StageStatus.InProgress;
    this.touch();
  }

  completeStage(stage: ResearchStage): void {
    this.state.stageStatus[stage] = StageStatus.Completed;
    this.touch();
  }

  skipStage(stage: ResearchStage): void {
    this.state.stageStatus[stage] = StageStatus.Skipped;
    this.touch();
  }

  getStageStatus(stage: ResearchStage): StageStatus {
    return this.state.stageStatus[stage];
  }

  // --- Artifacts ---

  addArtifact(artifact: ResearchArtifact): void {
    this.state.artifacts.push(artifact);
    this.touch();
  }

  getArtifactsByStage(stage: ResearchStage): ResearchArtifact[] {
    return this.state.artifacts.filter((a) => a.stage === stage);
  }

  getAllArtifacts(): ResearchArtifact[] {
    return this.state.artifacts;
  }

  // --- Gates ---

  addGateDecision(decision: GateDecision): void {
    // Replace existing gate decision for same gate number
    this.state.gates = this.state.gates.filter((g) => g.gateNumber !== decision.gateNumber);
    this.state.gates.push(decision);
    this.touch();
  }

  isGateApproved(gateNumber: 1 | 2 | 3): boolean {
    return this.state.gates.some((g) => g.gateNumber === gateNumber && g.status === GateStatus.Approved);
  }

  getGate(gateNumber: 1 | 2 | 3): GateDecision | undefined {
    return this.state.gates.find((g) => g.gateNumber === gateNumber);
  }

  /**
   * Determine which gate should fire next based on completed stages.
   * Returns null if no gate is pending.
   */
  getNextPendingGate(): 1 | 2 | 3 | null {
    const s = this.state.stageStatus;

    // Gate 1: After classification (Stage 1 meta is about to start)
    if (this.state.classification && !this.isGateApproved(1)) {
      return 1;
    }

    // Gate 2: After stages 2-4 complete
    const coreStagesComplete =
      (s[ResearchStage.UserIntelligence] === StageStatus.Completed ||
        s[ResearchStage.UserIntelligence] === StageStatus.Skipped) &&
      (s[ResearchStage.BusinessMarket] === StageStatus.Completed ||
        s[ResearchStage.BusinessMarket] === StageStatus.Skipped) &&
      (s[ResearchStage.Technical] === StageStatus.Completed || s[ResearchStage.Technical] === StageStatus.Skipped);

    if (coreStagesComplete && s[ResearchStage.MetaOrchestration] === StageStatus.Completed && !this.isGateApproved(2)) {
      return 2;
    }

    // Gate 3: After stage 5 (UX) complete, before validation
    const uxComplete =
      s[ResearchStage.UXCognitive] === StageStatus.Completed || s[ResearchStage.UXCognitive] === StageStatus.Skipped;

    if (coreStagesComplete && uxComplete && !this.isGateApproved(3)) {
      return 3;
    }

    return null;
  }

  private touch(): void {
    this.state.updatedAt = new Date().toISOString();
  }
}
