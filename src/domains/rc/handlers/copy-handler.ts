import type { StateManager } from '../state/state-manager.js';
import type { CopyResearchAgent } from '../agents/copy-research-agent.js';
import type { CopyAgent } from '../agents/copy-agent.js';
import type { AgentResult } from '../types.js';
import type { CopyResearchInput, CopyGenerateInput, CopyIterateInput } from '../copy-types.js';
import { hasPrd, deduplicateArtifacts } from './shared-helpers.js';
import fs from 'node:fs';
import path from 'node:path';

export class CopyHandler {
  constructor(
    private stateManager: StateManager,
    private copyResearchAgent: CopyResearchAgent,
    private copyAgent: CopyAgent,
  ) {}

  /** Generate copy research brief */
  async copyResearch(input: CopyResearchInput): Promise<AgentResult> {
    // Phase dependency: PRD must exist
    if (!hasPrd(input.projectPath)) {
      return {
        text: 'Error: No PRD found. Run rc_define first before generating copy research.',
        isError: true,
        errorCode: 'VALIDATION_FAILED',
      };
    }

    const state = this.stateManager.load(input.projectPath);
    const result = await this.copyResearchAgent.research(state, input);
    state.copyResearchBrief = {
      path: path.join(input.projectPath, 'rc-method', 'copy', 'COPY-RESEARCH-BRIEF.md'),
      generatedAt: new Date().toISOString(),
    };
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Generate full copy system */
  async copyGenerate(input: CopyGenerateInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);
    const result = await this.copyAgent.generate(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Self-critique copy system */
  async copyCritique(projectPath: string): Promise<AgentResult> {
    // Phase dependency: copy system must exist
    const copyPath = path.join(projectPath, 'rc-method', 'copy', 'COPY-SYSTEM.md');
    if (!fs.existsSync(copyPath)) {
      return {
        text: 'Error: No copy system found. Run copy_generate first before critiquing.',
        isError: true,
        errorCode: 'VALIDATION_FAILED',
      };
    }

    const state = this.stateManager.load(projectPath);
    const result = await this.copyAgent.critique(state);
    deduplicateArtifacts(state);
    this.stateManager.save(projectPath, state);
    return result;
  }

  /** Iterate on copy system with feedback */
  async copyIterate(input: CopyIterateInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);
    const result = await this.copyAgent.iterate(state, input);
    deduplicateArtifacts(state);
    this.stateManager.save(input.projectPath, state);
    return result;
  }
}
