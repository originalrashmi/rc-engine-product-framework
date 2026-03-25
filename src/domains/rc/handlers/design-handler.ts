import type { StateManager } from '../state/state-manager.js';
import type { DesignAgent } from '../agents/design-agent.js';
import type { DesignResearchAgent, DesignResearchInput } from '../agents/design-research-agent.js';
import type { ChallengerAgent } from '../agents/challenger-agent.js';
import type { DesignIntakeAgent } from '../agents/design-intake.js';
import type { BrandAssetLoader } from '../agents/brand-loader.js';
import type { AgentResult } from '../types.js';
import type { DesignInput, DesignIterateInput } from '../design-types.js';
import type { ChallengeInput } from '../challenger-types.js';
import type { BrandImportInput, BrandProfile } from '../brand-types.js';
import type { DesignIntakeInput } from '../design-intake-types.js';
import { stampVersion } from '../artifact-versioning.js';
import { safeWriteFile, hasPrd, addArtifact, deduplicateArtifacts } from './shared-helpers.js';
import fs from 'node:fs';
import path from 'node:path';

export class DesignHandler {
  constructor(
    private stateManager: StateManager,
    private designAgent: DesignAgent,
    private designResearchAgent: DesignResearchAgent,
    private challengerAgent: ChallengerAgent,
    private designIntakeAgent: DesignIntakeAgent,
    private brandLoader: BrandAssetLoader,
  ) {}

  /** Generate design options with wireframes */
  async designGenerate(input: DesignInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);

    // Phase dependency: PRD must exist
    if (!hasPrd(input.projectPath)) {
      return {
        text: 'Error: No PRD found. Run rc_define first to create a PRD before generating designs.',
        isError: true,
        errorCode: 'VALIDATION_FAILED',
      };
    }

    const result = await this.designAgent.generate(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Iterate on wireframes with user feedback */
  async designIterate(input: DesignIterateInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);
    const result = await this.designAgent.iterate(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Import brand assets from project files, URL, or manual input */
  async brandImport(input: BrandImportInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);
    const result = await this.brandLoader.import(input);

    // Save brand profile to project
    const profilePath = path.join(input.projectPath, 'rc-method', 'design', 'BRAND-PROFILE.json');
    const versionedProfile = stampVersion('brand-profile', result.profile as Record<string, unknown>);
    safeWriteFile(profilePath, JSON.stringify(versionedProfile, null, 2));

    // Update state
    state.brand = {
      profilePath,
      mode: result.source === 'auto-detected' ? 'constrained' : 'generation',
      importedAt: new Date().toISOString(),
    };
    const artifactRef = 'rc-method/design/BRAND-PROFILE.json';
    addArtifact(state, artifactRef);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);

    const summary = [
      `# Brand Import Complete`,
      ``,
      `**Source:** ${result.source}`,
      `**Confidence:** ${result.confidence}%`,
      `**Detected from:** ${result.detectedFrom.join(', ')}`,
      result.gaps.length > 0 ? `**Gaps (auto-filled):** ${result.gaps.join(', ')}` : '',
      ``,
      `Saved to: ${artifactRef}`,
    ]
      .filter(Boolean)
      .join('\n');

    return { text: summary, artifacts: [artifactRef] };
  }

  /** Run design intake assessment (competitor + preference analysis) */
  async designIntake(
    input: DesignIntakeInput,
    prdContext: string,
    icpData?: string,
    externalBrandProfile?: BrandProfile,
  ): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);

    // Load brand profile: prefer externally-provided, fall back to state
    let brandProfile = externalBrandProfile;
    if (!brandProfile && state.brand?.profilePath) {
      try {
        brandProfile = JSON.parse(fs.readFileSync(state.brand.profilePath, 'utf-8'));
      } catch {
        /* continue without brand */
      }
    }

    const result = await this.designIntakeAgent.analyze(input, prdContext, icpData, brandProfile);

    // Save assessment as markdown
    const assessmentPath = path.join(input.projectPath, 'rc-method', 'design', 'DESIGN-INTAKE.md');
    safeWriteFile(assessmentPath, result.text);

    // Save structured assessment as JSON for downstream consumption
    const jsonPath = path.join(input.projectPath, 'rc-method', 'design', 'DESIGN-INTAKE.json');
    const versionedAssessment = stampVersion('design-intake', result.assessment as unknown as Record<string, unknown>);
    safeWriteFile(jsonPath, JSON.stringify(versionedAssessment, null, 2));

    const constraints = result.assessment.extractedConstraints;
    state.designIntake = {
      assessmentPath,
      jsonPath,
      verdict: result.assessment.verdict,
      alignmentScore: result.assessment.alignmentScore,
      completedAt: new Date().toISOString(),
      // Key constraint fields for quick access without re-reading JSON
      primaryPlatform: constraints.platformDirection.primaryPlatform,
      devicePriority: constraints.platformDirection.devicePriority,
      designSystemFramework: constraints.platformDirection.designSystemFramework,
      wcagTarget: constraints.accessibilityDirection.wcagTarget,
      aesthetic: constraints.moodDirection.aesthetic,
      animationLevel: constraints.interactionDirection.animationLevel,
      keyScreens: constraints.screenInventory.keyScreens,
      priorityScreens: constraints.screenInventory.priorityScreens,
      criticalFlows: constraints.screenInventory.criticalFlows,
    };
    const artifactRef = 'rc-method/design/DESIGN-INTAKE.md';
    const jsonArtifactRef = 'rc-method/design/DESIGN-INTAKE.json';
    addArtifact(state, artifactRef);
    addArtifact(state, jsonArtifactRef);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);

    return { text: result.text, artifacts: [artifactRef, jsonArtifactRef] };
  }

  /** Generate design research brief */
  async designResearch(input: DesignResearchInput): Promise<AgentResult> {
    // Phase dependency: PRD must exist
    if (!hasPrd(input.projectPath)) {
      return {
        text: 'Error: No PRD found. Run rc_define first to create a PRD before generating design research.',
        isError: true,
        errorCode: 'VALIDATION_FAILED',
      };
    }

    const state = this.stateManager.load(input.projectPath);
    const result = await this.designResearchAgent.research(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Run the Design Challenger - brutal multi-lens review */
  async designChallenge(input: ChallengeInput): Promise<AgentResult> {
    // Phase dependency: design spec must exist
    const specPath = path.join(input.projectPath, 'rc-method', 'design', 'DESIGN-SPEC.json');
    if (!fs.existsSync(specPath)) {
      return {
        text: 'Error: No design spec found. Run ux_design first to generate design options before running the challenger.',
        isError: true,
        errorCode: 'VALIDATION_FAILED',
      };
    }

    const state = this.stateManager.load(input.projectPath);
    const result = await this.challengerAgent.challenge(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Save the user's selected design option */
  designSelect(projectPath: string, optionId: string, specPath: string): AgentResult {
    const state = this.stateManager.load(projectPath);
    state.selectedDesign = {
      optionId,
      specPath,
      selectedAt: new Date().toISOString(),
    };
    this.stateManager.save(projectPath, state);
    return { text: `Design option ${optionId} selected and saved.` };
  }
}
