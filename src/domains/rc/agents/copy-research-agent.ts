import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import type { CopyResearchInput } from '../copy-types.js';

/**
 * Phase 1 copy research: produces a Copy Research Brief containing
 * VOC phrase bank, awareness mapping, JTBD extraction, objection mapping,
 * competitive copy audit, and persuasion framework selection.
 *
 * Runs AFTER ux_research_brief, BEFORE copy_generate and ux_design.
 */
export class CopyResearchAgent extends BaseAgent {
  async research(state: ProjectState, input: CopyResearchInput): Promise<AgentResult> {
    let supplementary = '';

    if (input.icpData) {
      supplementary += `\n\n## Ideal Customer Profile\n${input.icpData}`;
    }

    if (input.competitorData) {
      supplementary += `\n\n## Competitor Analysis\n${input.competitorData}`;
    }

    // Load Design Research Brief if it exists
    if (input.designResearchBrief) {
      supplementary += `\n\n## Design Research Brief\n${input.designResearchBrief}`;
    } else {
      // Try loading from saved artifact
      const briefPath = path.join(state.projectPath, 'rc-method', 'design', 'DESIGN-RESEARCH-BRIEF.md');
      if (fs.existsSync(briefPath)) {
        const brief = fs.readFileSync(briefPath, 'utf-8');
        supplementary += `\n\n## Design Research Brief\n${brief}`;
      }
    }

    // Load brand voice if available
    if (state.brand?.profilePath) {
      try {
        const brandJson = fs.readFileSync(state.brand.profilePath, 'utf-8');
        const brand = JSON.parse(brandJson);
        if (brand.voice) {
          supplementary += `\n\n## Brand Voice (from Brand Profile)\n\`\`\`json\n${JSON.stringify(brand.voice, null, 2)}\n\`\`\``;
        }
      } catch {
        // Brand profile unavailable, proceed without
      }
    }

    const knowledgeFiles = ['skills/copy/rc-copy-research.md', 'skills/copy/rc-copy-frameworks.md'];

    const instructions = `You are the RC Method Copy Research Agent - a senior conversion copywriter conducting pre-writing research for "${state.projectName}".

RULES:
- Follow the research methodology in rc-copy-research.md exactly
- Use the persuasion frameworks from rc-copy-frameworks.md for framework selection
- Extract VOC phrases from PRD pain points, ICP data, and competitor analysis
- Map each screen/page to an awareness level (Schwartz's 5 levels)
- Extract JTBD statements across functional, emotional, and social dimensions
- Map top 5-7 objections with copy countermeasures and placement
- Audit competitor copy positioning if competitor data is available
- Select primary and secondary persuasion frameworks with rationale
- If a Brand Voice section is provided, note voice constraints for the copy system
- Output as a structured markdown document

OUTPUT FORMAT: A markdown document titled "# Copy Research Brief: {projectName}"

Sections required:
1. VOC Phrase Bank - pain phrases, outcome phrases, objection phrases, decision triggers
2. Awareness Map - each screen mapped to awareness level with copy strategy
3. JTBD & Messaging Hierarchy - jobs, positioning statement, claims, proof points, risk reversal
4. Objection Map - objections with countermeasures and placement
5. Competitive Copy Audit - competitor analysis with gaps (if competitor data available)
6. Framework Selection - primary and secondary frameworks with rationale`;

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      `Generate the Copy Research Brief.\n\n## PRD\n${input.prdContext}`,
      supplementary || undefined,
    );

    // Save artifact
    const filename = 'COPY-RESEARCH-BRIEF.md';
    const briefPath = path.join(state.projectPath, 'rc-method', 'copy', filename);
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, text, 'utf-8');

    const artifactRef = `rc-method/copy/${filename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
    };
  }

  async run(): Promise<AgentResult> {
    return { text: 'CopyResearchAgent requires calling research() directly.' };
  }
}
