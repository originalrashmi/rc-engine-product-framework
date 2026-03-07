import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

export class PrdAgent extends BaseAgent {
  /** Run the PRD generation process (Phase 2: Define) */
  async run(state: ProjectState, operatorInputs: string): Promise<AgentResult> {
    const instructions = `You are the RC Method PRD Agent. Generate a comprehensive PRD following the exact template in the knowledge file.

RULES:
- Write in plain language for non-technical product owners
- Every feature needs a user story and testable acceptance criteria
- Include the UX Requirements section (Section 5)
- Score UX complexity using the trigger rubric and include the score
- If the PRD exceeds 3,000 tokens or has 3+ features, recommend child PRD splits
- Use MoSCoW priority (Must Have / Should Have / Nice to Have)
- The project is "${state.projectName}"`;

    const text = await this.execute(
      ['skills/rc-prd-master.md', 'skills/rc-prd-child.md'],
      instructions,
      operatorInputs,
    );

    // Save PRD artifact
    const prdFilename = `PRD-${this.sanitizeName(state.projectName)}-master.md`;
    const prdPath = path.join(state.projectPath, 'rc-method', 'prds', prdFilename);
    fs.mkdirSync(path.dirname(prdPath), { recursive: true });
    fs.writeFileSync(prdPath, text, 'utf-8');

    const artifactRef = `rc-method/prds/${prdFilename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
      gateReady: true,
    };
  }

  /** Generate a UX child PRD */
  async generateUxPrd(state: ProjectState, screensDescription: string): Promise<AgentResult> {
    // Load UX context alongside PRD knowledge
    const uxContext = this.contextLoader.loadUxContext('audit');

    const instructions = `You are the RC Method UX PRD Agent. Generate a UX child PRD using the UX Child PRD template from the UX core knowledge.

RULES:
- Follow the exact template structure from rc-ux-core.md
- Include screen inventory, state contracts, component inventory, copy inventory, accessibility checklist
- Include non-white-label acceptance criteria
- Keep the UX PRD under 2,500 tokens
- The project is "${state.projectName}"`;

    const text = await this.execute(
      ['skills/rc-ux-core.md'],
      instructions,
      `Generate a UX child PRD for this project.\n\nScreens:\n${screensDescription}`,
      uxContext,
    );

    const prdFilename = `PRD-${this.sanitizeName(state.projectName)}-ux.md`;
    const prdPath = path.join(state.projectPath, 'rc-method', 'prds', prdFilename);
    fs.mkdirSync(path.dirname(prdPath), { recursive: true });
    fs.writeFileSync(prdPath, text, 'utf-8');

    const artifactRef = `rc-method/prds/${prdFilename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
    };
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
