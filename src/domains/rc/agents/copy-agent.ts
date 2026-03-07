import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import type { CopyGenerateInput, CopyIterateInput } from '../copy-types.js';

/**
 * Copy Agent — Phase 2 (generate) and Phase 3 (critique & iterate).
 *
 * Phase 2: Produces the Content Strategy & Copy System:
 *   - Voice & Tone definition
 *   - Page-level copy for all screens (with variants)
 *   - Microcopy library (forms, errors, empty states, tooltips, loading, onboarding)
 *   - CTA matrix with Fogg/Cialdini annotations
 *   - SEO content map
 *
 * Phase 3: Self-critiques against conversion heuristics and iterates.
 */
export class CopyAgent extends BaseAgent {
  /**
   * Generate the full copy system from a Copy Research Brief.
   */
  async generate(state: ProjectState, input: CopyGenerateInput): Promise<AgentResult> {
    const researchBrief = JSON.stringify(input.copyResearchBrief, null, 2);

    let supplementary = `\n\n## Copy Research Brief\n\`\`\`json\n${researchBrief}\n\`\`\``;

    if (input.designResearchBrief) {
      supplementary += `\n\n## Design Research Brief\n${input.designResearchBrief}`;
    }

    supplementary += `\n\n## Screen Inventory\n${input.screenInventory.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    // Load brand voice if available
    if (state.brand?.profilePath) {
      try {
        const brandJson = fs.readFileSync(state.brand.profilePath, 'utf-8');
        const brand = JSON.parse(brandJson);
        if (brand.voice) {
          supplementary += `\n\n## Brand Voice Constraints\n\`\`\`json\n${JSON.stringify(brand.voice, null, 2)}\n\`\`\``;
        }
      } catch {
        // Brand profile unavailable
      }
    }

    const knowledgeFiles = [
      'skills/copy/rc-copy-voice-tone.md',
      'skills/copy/rc-copy-microcopy.md',
      'skills/copy/rc-copy-frameworks.md',
      'skills/copy/rc-copy-seo.md',
    ];

    const instructions = `You are the RC Method Copy Generation Agent — a senior conversion copywriter generating the complete Content Strategy & Copy System for "${state.projectName}".

RULES:
- Use the Copy Research Brief as your primary input (VOC phrases, messaging hierarchy, awareness map, objections, framework)
- Define the Voice & Tone system using NNGroup's 4 dimensions from rc-copy-voice-tone.md
- Write page-level copy for EVERY screen in the inventory, following the selected persuasion framework
- Generate 3 headline variants and 3 CTA variants per screen, each testing a different persuasion angle
- Build a complete microcopy library following rc-copy-microcopy.md patterns
- Build a CTA matrix with Fogg prompt types and Cialdini levers per rc-copy-frameworks.md
- Generate SEO content entries for organic-targeted pages per rc-copy-seo.md
- Use VOC phrases from the research brief as raw material for headlines and body copy
- If Brand Voice constraints are provided, ensure the voice definition aligns
- All copy must be specific, quantified, and outcome-framed — no generic placeholders

OUTPUT FORMAT: A comprehensive markdown document titled "# Content Strategy & Copy System: {projectName}"

Sections required:
1. Voice & Tone System — attributes, NNGroup dimensions, voice chart, DON'Ts, tone adaptations, vocabulary
2. Messaging Hierarchy — positioning statement, primary claim, supporting claims, proof points, risk reversal
3. Page Copy — for each screen: headline (with variants), subheadline, body sections, CTA (with variants), objections addressed, SEO
4. Microcopy Library — navigation, forms, empty states, errors, success, loading, tooltips, onboarding, confirmations
5. CTA Matrix — screen, CTA text, Fogg prompt type, awareness level, Cialdini lever, variants
6. SEO Content Map — per-page keyword targeting, meta tags, heading structure, schema type`;

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      `Generate the complete Content Strategy & Copy System.`,
      supplementary,
    );

    // Save artifact
    const filename = 'COPY-SYSTEM.md';
    const copyPath = path.join(state.projectPath, 'rc-method', 'copy', filename);
    fs.mkdirSync(path.dirname(copyPath), { recursive: true });
    fs.writeFileSync(copyPath, text, 'utf-8');

    const artifactRef = `rc-method/copy/${filename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    // Update project state
    state.copySystem = {
      path: copyPath,
      generatedAt: new Date().toISOString(),
      screenCount: input.screenInventory.length,
    };

    return {
      text,
      artifacts: [artifactRef],
    };
  }

  /**
   * Self-critique the generated copy against conversion heuristics.
   */
  async critique(state: ProjectState): Promise<AgentResult> {
    // Load the copy system
    const copySystemPath = path.join(state.projectPath, 'rc-method', 'copy', 'COPY-SYSTEM.md');
    if (!fs.existsSync(copySystemPath)) {
      return { text: 'Error: No copy system found. Run copy_generate first.' };
    }
    const copySystem = fs.readFileSync(copySystemPath, 'utf-8');

    // Load the research brief for reference
    const briefPath = path.join(
      state.projectPath,
      'rc-method',
      'copy',
      'COPY-RESEARCH-BRIEF.md',
    );
    let brief = '';
    if (fs.existsSync(briefPath)) {
      brief = fs.readFileSync(briefPath, 'utf-8');
    }

    const knowledgeFiles = ['skills/copy/rc-copy-critique.md'];

    const instructions = `You are the RC Method Copy Critique Agent. Evaluate the generated copy system against the conversion heuristics checklist in rc-copy-critique.md.

RULES:
- Score each of the 7 categories (Clarity, Persuasion Framework, Behavioral Design, Voice & Tone, Microcopy, Specificity, SEO) on a 1-5 scale
- Apply the weighted scoring formula from the rubric
- Check every item in the checklist — be thorough
- For any category scoring below 3: identify specific failures and recommend fixes
- Run the Copy-Design Integration Check
- Verify variant quality — each variant should test a meaningfully different persuasion angle
- If total score < 3.0: recommend rewrite with specific guidance
- Be honest and specific — generic praise doesn't help

OUTPUT FORMAT:
1. Per-screen critique with scoring table
2. Overall system evaluation
3. Specific revision actions (if needed)
4. Variant quality assessment`;

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      `Critique this copy system:\n\n${copySystem}`,
      brief ? `## Copy Research Brief (reference)\n${brief}` : undefined,
    );

    // Save critique
    const filename = 'COPY-CRITIQUE.md';
    const critiquePath = path.join(state.projectPath, 'rc-method', 'copy', filename);
    fs.writeFileSync(critiquePath, text, 'utf-8');

    const artifactRef = `rc-method/copy/${filename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
    };
  }

  /**
   * Iterate on copy with user feedback.
   */
  async iterate(state: ProjectState, input: CopyIterateInput): Promise<AgentResult> {
    // Load current copy system
    const copySystemPath = path.join(state.projectPath, 'rc-method', 'copy', 'COPY-SYSTEM.md');
    if (!fs.existsSync(copySystemPath)) {
      return { text: 'Error: No copy system found. Run copy_generate first.' };
    }
    const copySystem = fs.readFileSync(copySystemPath, 'utf-8');

    const knowledgeFiles = [
      'skills/copy/rc-copy-voice-tone.md',
      'skills/copy/rc-copy-microcopy.md',
    ];

    const targetNote = input.targetScreens?.length
      ? `Focus on these screens: ${input.targetScreens.join(', ')}`
      : 'Apply feedback across all screens as appropriate';

    const instructions = `You are the RC Method Copy Iteration Agent. Revise the copy system based on user feedback.

RULES:
- ${targetNote}
- Maintain voice and tone consistency after changes
- If changing headlines or CTAs, generate new variants
- Preserve the overall structure of the copy system document
- Show what changed and why
- Output the FULL revised copy system (not just the changes)`;

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      `Revise this copy system based on user feedback.\n\nFeedback: ${input.feedback}\n\n## Current Copy System\n${copySystem}`,
    );

    // Overwrite with revised version
    fs.writeFileSync(copySystemPath, text, 'utf-8');

    return {
      text: `Copy system revised based on feedback. Changes saved to rc-method/copy/COPY-SYSTEM.md.`,
      artifacts: ['rc-method/copy/COPY-SYSTEM.md'],
    };
  }

  async run(): Promise<AgentResult> {
    return {
      text: 'CopyAgent requires calling generate(), critique(), or iterate() directly.',
    };
  }
}
