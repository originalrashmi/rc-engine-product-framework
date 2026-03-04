import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState, UxMode } from '../types.js';

export class UxAgent extends BaseAgent {
  /** Score UX triggers for a feature list and return routing recommendation */
  async score(featureList: string): Promise<AgentResult> {
    const instructions = `You are the RC Method UX Scoring Agent. Score the UI complexity using the UX-TRIGGERS.md rubric.

RULES:
- Evaluate each condition in the scoring table against the feature list
- Show your scoring: list each condition, whether it applies, and the points awarded
- Sum the total score
- Determine the mode: Standard (< 4), Selective (4-6), Deep Dive (>= 7)
- If Selective or Deep Dive, identify the primary UX challenges and list which specialist modules should be loaded
- Use the Challenge -> Specialist mapping from UX-TRIGGERS.md
- Output the score, mode, and recommended specialists clearly`;

    const text = await this.execute(
      ['ux/UX-TRIGGERS.md'],
      instructions,
      `Score the UX complexity for this feature list:\n\n${featureList}`,
    );

    // Parse score from response (look for "Score: X" pattern)
    const scoreMatch = text.match(/Score:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    let uxMode: UxMode | null = null;
    if (score !== null) {
      if (score < 4) uxMode = 'standard';
      else if (score <= 6) uxMode = 'selective';
      else uxMode = 'deep_dive';
    }

    return {
      text,
      // Caller can read these from the result to update state
      artifacts: score !== null ? [`ux-score:${score}`, `ux-mode:${uxMode}`] : undefined,
    };
  }

  /** Run a UX audit on code or a UI description using routed specialists */
  async audit(codeOrDescription: string, taskType: string): Promise<AgentResult> {
    // Load UX context with dynamic specialist routing
    const uxContext = this.contextLoader.loadUxContext(taskType);
    const specialists = this.contextLoader.getSpecialistsForTask(taskType);

    const specialistNote =
      specialists.length > 0
        ? `Specialist modules loaded: ${specialists.join(', ')}`
        : 'No specialist modules loaded - using core rules only';

    const instructions = `You are the RC Method UX Audit Agent. Audit the provided UI code or description against the loaded UX rules.

RULES:
- Apply all 42 core rules from rc-ux-core.md
- ${specialistNote}
- For each finding: cite the specific rule number, explain the issue, suggest a fix
- Categorize findings by severity: High (breaks usability), Medium (degrades experience), Low (polish)
- Limit to top 20 most impactful findings
- Present in a clear, actionable format
- Task type being audited: "${taskType}"`;

    const text = await this.execute(
      ['skills/rc-ux-core.md'],
      instructions,
      `Audit this UI for UX issues:\n\n${codeOrDescription}`,
      uxContext,
    );

    return { text };
  }

  /** Generate a UX child PRD with full specialist context */
  async generate(state: ProjectState, screensDescription: string): Promise<AgentResult> {
    // Load existing main PRD for context
    const prdFiles = state.artifacts.filter((a) => a.includes('/prds/PRD-') && !a.includes('-ux.md'));
    let prdContext = '';
    for (const prdFile of prdFiles) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, prdFile);
        prdContext += `\n\n--- ${prdFile} ---\n\n${content}`;
      } catch {
        console.error(`Warning: Could not load PRD ${prdFile}`);
      }
    }

    // Load full audit-level UX context for generation
    const uxContext = this.contextLoader.loadUxContext('audit');

    const instructions = `You are the RC Method UX PRD Generator. Generate a complete UX child PRD using the template from rc-ux-core.md.

RULES:
- Follow the exact UX Child PRD Template from the knowledge file
- Include ALL sections: Screen Inventory, Critical User Flows, Component Inventory, State Contracts, Copy Inventory, Accessibility Checklist, Non-White-Label Acceptance Criteria
- Every state contract cell must be filled (Loading/Empty/Error/Success)
- Every copy entry must reference the applicable rule number
- Keep the UX PRD under 2,500 tokens
- The project is "${state.projectName}"
- UX Score: ${state.uxScore ?? 'Not scored yet'}
- UX Mode: ${state.uxMode ?? 'Not determined yet'}`;

    const text = await this.execute(
      ['skills/rc-ux-core.md'],
      instructions,
      `Generate a UX child PRD for this project.\n\nScreens:\n${screensDescription}`,
      `${prdContext}\n\n--- UX Specialist Context ---\n\n${uxContext}`,
    );

    // Save the UX child PRD
    const prdFilename = `PRD-${this.sanitizeName(state.projectName)}-ux.md`;
    const prdPath = path.join(state.projectPath, 'rc-method', 'prds', prdFilename);
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

  /** Required by BaseAgent - routing happens through score/audit/generate */
  async run(): Promise<AgentResult> {
    return { text: 'UX agent requires calling score(), audit(), or generate() directly.' };
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
