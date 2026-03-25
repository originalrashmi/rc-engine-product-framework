import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

export interface DesignResearchInput {
  projectPath: string;
  prdContext: string;
  icpData?: string;
  competitorData?: string;
  brandProfilePath?: string;
  designIntakePath?: string;
}

/**
 * Phase 2 research agent: produces a Design Research Brief from PRD, ICP,
 * competitor data, brand profile, and design intake assessment.
 *
 * The brief is consumed by both the CopyResearchAgent and the DesignAgent.
 */
export class DesignResearchAgent extends BaseAgent {
  async research(state: ProjectState, input: DesignResearchInput): Promise<AgentResult> {
    // Gather supplementary context
    let supplementary = '';

    if (input.icpData) {
      supplementary += `\n\n## Ideal Customer Profile\n${input.icpData}`;
    }

    if (input.competitorData) {
      supplementary += `\n\n## Competitor Analysis\n${input.competitorData}`;
    }

    // Load brand profile if available
    if (input.brandProfilePath) {
      try {
        const brandJson = fs.readFileSync(input.brandProfilePath, 'utf-8');
        supplementary += `\n\n## Brand Profile (Imported)\n\`\`\`json\n${brandJson}\n\`\`\``;
      } catch {
        console.error(`[rc-engine] Warning: Could not load brand profile at ${input.brandProfilePath}`);
      }
    }

    // Load design intake assessment - prefer structured JSON, fall back to markdown
    if (input.designIntakePath) {
      const jsonPath = input.designIntakePath.replace(/\.md$/, '.json');
      let loaded = false;
      if (fs.existsSync(jsonPath)) {
        try {
          const assessment = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          const c = assessment.extractedConstraints;
          supplementary += `\n\n## Design Intake Assessment (Structured)`;
          supplementary += `\n- **Verdict:** ${assessment.verdict} (alignment: ${assessment.alignmentScore}/100)`;
          if (c?.moodDirection?.keywords?.length)
            supplementary += `\n- **Mood:** ${c.moodDirection.keywords.join(', ')}`;
          if (c?.moodDirection?.aesthetic) supplementary += `\n- **Aesthetic:** ${c.moodDirection.aesthetic}`;
          if (c?.layoutDirection?.navigationPattern)
            supplementary += `\n- **Navigation:** ${c.layoutDirection.navigationPattern}`;
          if (c?.layoutDirection?.contentDensity)
            supplementary += `\n- **Content density:** ${c.layoutDirection.contentDensity}`;
          if (c?.platformDirection?.primaryPlatform)
            supplementary += `\n- **Platform:** ${c.platformDirection.primaryPlatform}`;
          if (c?.platformDirection?.devicePriority)
            supplementary += `\n- **Device priority:** ${c.platformDirection.devicePriority}`;
          if (c?.accessibilityDirection?.wcagTarget)
            supplementary += `\n- **WCAG target:** ${c.accessibilityDirection.wcagTarget}`;
          if (c?.screenInventory?.keyScreens?.length)
            supplementary += `\n- **Key screens:** ${c.screenInventory.keyScreens.join(', ')}`;
          if (c?.competitiveDifferentiators?.length)
            supplementary += `\n- **Differentiators:** ${c.competitiveDifferentiators.join('; ')}`;
          if (assessment.findings?.length) {
            const misaligned = assessment.findings.filter((f: { alignment: string }) => f.alignment === 'misaligned');
            if (misaligned.length) {
              supplementary += `\n\n### Misaligned Findings (require attention)`;
              for (const f of misaligned) {
                supplementary += `\n- **${f.category}**: ${f.recommendation}`;
              }
            }
          }
          loaded = true;
        } catch {
          // Fall through to markdown loading
        }
      }
      if (!loaded) {
        try {
          const intakeContent = fs.readFileSync(input.designIntakePath, 'utf-8');
          supplementary += `\n\n## Design Intake Assessment\n${intakeContent}`;
        } catch {
          console.error(`[rc-engine] Warning: Could not load design intake at ${input.designIntakePath}`);
        }
      }
    }

    const knowledgeFiles = [
      'skills/design/rc-design-research.md',
      'skills/design/rc-design-cognitive.md',
      'skills/design/rc-design-patterns.md',
      'skills/design/rc-design-trends-2026.md',
    ];

    const instructions = `You are the RC Method Design Research Agent. Produce a comprehensive Design Research Brief for "${state.projectName}".

RULES:
- Follow the methodology in rc-design-research.md exactly
- Apply cognitive psychology principles from rc-design-cognitive.md
- Reference relevant patterns from rc-design-patterns.md
- Incorporate current trends from rc-design-trends-2026.md
- If a Brand Profile is provided, note brand constraints (colors, typography, shape) that the design must follow
- If a Design Intake Assessment is provided, incorporate user preferences and the intake verdict
- The brief should cover: ICP analysis, competitive design gaps, emotional design strategy, information architecture, trend recommendations, and design constraints
- Output as a complete markdown document

OUTPUT FORMAT: A markdown document titled "# Design Research Brief: {projectName}"

Sections required:
1. ICP Design Profile - who they are, what they expect, what tools they use
2. Competitive Design Landscape - gaps, overused patterns, differentiation opportunities
3. Emotional Design Strategy - Norman's 3 levels mapped to the user journey
4. Information Architecture - screen inventory, navigation strategy, content hierarchy
5. Cognitive Design Principles - which principles apply and how
6. Trend Recommendations - which 2-3 trends to adopt, which to avoid
7. Design Constraints - from brand profile, intake assessment, or ICP requirements
8. Typography & Color Direction - recommended pairings and palette strategy`;

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      `Generate the Design Research Brief.\n\n## PRD\n${input.prdContext}`,
      supplementary || undefined,
    );

    // Save artifact
    const filename = `DESIGN-RESEARCH-BRIEF.md`;
    const briefPath = path.join(state.projectPath, 'rc-method', 'design', filename);
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, text, 'utf-8');

    const artifactRef = `rc-method/design/${filename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
    };
  }

  async run(): Promise<AgentResult> {
    return { text: 'DesignResearchAgent requires calling research() directly.' };
  }
}
