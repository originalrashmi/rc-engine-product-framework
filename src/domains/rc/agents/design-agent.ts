import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import { DesignSpecSchema } from '../design-types.js';
import type { DesignInput, DesignSpec, DesignWireframe } from '../design-types.js';

export class DesignAgent extends BaseAgent {
  /**
   * Generate design options with wireframes.
   * Call 1: Generate DesignSpec JSON (option specs + recommendation)
   * Call 2: For each option, generate HTML wireframes for key screens
   */
  async generate(state: ProjectState, input: DesignInput): Promise<AgentResult> {
    // Step 1: Generate design spec JSON
    const spec = await this.generateSpec(state, input);

    // Step 2: Generate wireframes for each option
    const wireframes: DesignWireframe[] = [];
    for (const option of spec.options) {
      const screens = await this.generateWireframes(state, option, spec);
      wireframes.push(...screens);
    }

    // Step 3: Save artifacts
    const savedFiles = this.saveDesignArtifacts(state, spec, wireframes);

    // Build user-facing summary
    const summary = this.formatSummary(spec, wireframes, savedFiles);

    return {
      text: summary,
      artifacts: savedFiles,
    };
  }

  /** Generate the design specification JSON */
  private async generateSpec(state: ProjectState, input: DesignInput): Promise<DesignSpec> {
    const inspirationSection = input.inspiration
      ? `\n\n## User Design Preferences\nThe user provided these design references/preferences:\n${input.inspiration}`
      : '\n\n## User Design Preferences\nNo specific preferences provided -- use your best judgment based on ICP and product type.';

    const icpSection = input.icpData ? `\n\n## Ideal Customer Profile\n${input.icpData}` : '';

    const competitorSection = input.competitorData ? `\n\n## Competitor Analysis\n${input.competitorData}` : '';

    const instructions = `You are a senior product designer and design system architect. Generate ${input.optionCount === 1 ? '1 design option' : '3 distinct design options'} for the product described below.

RULES:
- Each option must have a distinct visual personality and approach
- Base design decisions on the ICP (ideal customer profile) and product type
- Consider current design trends and competitor gaps
- Include a color palette, typography, layout strategy, and key screen descriptions
- Score each option for ICP alignment (0-100)
- Recommend the best option with clear reasoning
- The project is "${state.projectName}"

OUTPUT FORMAT: Return ONLY valid JSON matching this structure (no markdown, no code fences):
{
  "projectName": "${state.projectName}",
  "icpSummary": "...",
  "competitorGaps": ["..."],
  "designTrends": ["..."],
  "options": [
    {
      "id": "A",
      "name": "...",
      "style": {
        "colorPalette": { "primary": "#...", "secondary": "#...", "background": "#...", "surface": "#...", "text": "#...", "muted": "#..." },
        "typography": { "headingFont": "...", "bodyFont": "...", "scale": "standard" },
        "layout": { "maxWidth": "1200px", "spacing": "comfortable", "borderRadius": "rounded" },
        "personality": "..."
      },
      "rationale": "...",
      "icpAlignment": 85,
      "keyScreens": [{ "name": "...", "description": "..." }],
      "tradeoffs": { "strengths": ["..."], "weaknesses": ["..."] }
    }
  ],
  "recommendation": { "optionId": "A", "reason": "..." }
}`;

    const text = await this.execute(
      ['skills/rc-design-generation.md'],
      instructions,
      `Generate design options for this product.\n\n## Product Requirements\n${input.prdContext}${inspirationSection}${icpSection}${competitorSection}`,
    );

    // Parse and validate
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Design agent did not return valid JSON. Raw output saved for review.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = DesignSpecSchema.safeParse(parsed);
    if (!result.success) {
      // Return partial result with validation warnings
      console.error('Design spec validation warnings:', result.error.issues);
      return parsed as DesignSpec;
    }

    return result.data;
  }

  /** Generate HTML wireframes for a single design option */
  private async generateWireframes(
    state: ProjectState,
    option: DesignSpec['options'][0],
    _spec: DesignSpec,
  ): Promise<DesignWireframe[]> {
    const { colorPalette, typography, layout } = option.style;
    const screenList = option.keyScreens.map((s) => `- ${s.name}: ${s.description}`).join('\n');

    const instructions = `You are a UI wireframe generator. Create self-contained HTML wireframes for the design option described below.

RULES:
- Generate TWO versions for each screen: lo-fi (grayscale, boxes, placeholder text) and hi-fi (full colors, real-looking content)
- Each HTML file must be COMPLETELY self-contained (inline CSS, no external dependencies)
- Use the exact color palette and typography specified
- Include realistic placeholder content (not "Lorem ipsum")
- Make layouts responsive with max-width constraint
- Lo-fi: Use #ccc for backgrounds, #666 for text, simple rectangles for images
- Hi-fi: Use the full color palette, proper spacing, rounded corners per spec
- Include @media print styles for PDF export
- The project is "${state.projectName}"

DESIGN TOKENS:
- Primary: ${colorPalette.primary}
- Secondary: ${colorPalette.secondary}
- Background: ${colorPalette.background}
- Surface: ${colorPalette.surface}
- Text: ${colorPalette.text}
- Muted: ${colorPalette.muted}
- Heading font: ${typography.headingFont}
- Body font: ${typography.bodyFont}
- Scale: ${typography.scale}
- Max width: ${layout.maxWidth}
- Spacing: ${layout.spacing}
- Border radius: ${layout.borderRadius}

OUTPUT FORMAT: For each screen, output in this exact format:

===WIREFRAME: screenName|lofi===
<complete HTML document>
===END_WIREFRAME===

===WIREFRAME: screenName|hifi===
<complete HTML document>
===END_WIREFRAME===`;

    const text = await this.execute(
      ['skills/rc-design-generation.md'],
      instructions,
      `Generate wireframes for design option "${option.id}: ${option.name}".\n\nScreens:\n${screenList}\n\nDesign personality: ${option.style.personality}`,
    );

    // Parse wireframes from output
    return this.parseWireframes(option.id, text);
  }

  /** Parse ===WIREFRAME: ...=== blocks from LLM output */
  private parseWireframes(optionId: string, text: string): DesignWireframe[] {
    const wireframeRegex = /===WIREFRAME:\s*(.+?)\|(.+?)===\n([\s\S]*?)===END_WIREFRAME===/g;
    const results: DesignWireframe[] = [];
    const screens = new Map<string, { lofi?: string; hifi?: string }>();

    let match;
    while ((match = wireframeRegex.exec(text)) !== null) {
      const screenName = match[1].trim();
      const fidelity = match[2].trim().toLowerCase();
      const html = match[3].trim();

      if (!screens.has(screenName)) {
        screens.set(screenName, {});
      }

      const screen = screens.get(screenName)!;
      if (fidelity === 'lofi') screen.lofi = html;
      else if (fidelity === 'hifi') screen.hifi = html;
    }

    for (const [screenName, content] of screens) {
      results.push({
        optionId,
        screenName,
        lofiHtml: content.lofi ?? '<html><body><p>Lo-fi wireframe not generated</p></body></html>',
        hifiHtml: content.hifi ?? '<html><body><p>Hi-fi wireframe not generated</p></body></html>',
      });
    }

    return results;
  }

  /** Save design spec and wireframes to project directory */
  private saveDesignArtifacts(state: ProjectState, spec: DesignSpec, wireframes: DesignWireframe[]): string[] {
    const sanitizedName = state.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const designDir = path.join(state.projectPath, 'rc-method', 'design');
    fs.mkdirSync(designDir, { recursive: true });

    const savedFiles: string[] = [];

    // Save design spec JSON
    const specPath = path.join(designDir, `design-spec-${sanitizedName}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');
    const specRef = `rc-method/design/design-spec-${sanitizedName}.json`;
    savedFiles.push(specRef);

    // Save wireframes as HTML files
    for (const wf of wireframes) {
      const screenSlug = wf.screenName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const optionDir = path.join(designDir, `option-${wf.optionId.toLowerCase()}`);
      fs.mkdirSync(optionDir, { recursive: true });

      const lofiPath = path.join(optionDir, `${screenSlug}-lofi.html`);
      fs.writeFileSync(lofiPath, wf.lofiHtml, 'utf-8');
      savedFiles.push(`rc-method/design/option-${wf.optionId.toLowerCase()}/${screenSlug}-lofi.html`);

      const hifiPath = path.join(optionDir, `${screenSlug}-hifi.html`);
      fs.writeFileSync(hifiPath, wf.hifiHtml, 'utf-8');
      savedFiles.push(`rc-method/design/option-${wf.optionId.toLowerCase()}/${screenSlug}-hifi.html`);
    }

    // Track in state
    for (const ref of savedFiles) {
      if (!state.artifacts.includes(ref)) {
        state.artifacts.push(ref);
      }
    }

    return savedFiles;
  }

  /** Format a user-facing summary of the design generation results */
  private formatSummary(spec: DesignSpec, wireframes: DesignWireframe[], savedFiles: string[]): string {
    const lines: string[] = [`## Design Options Generated`, '', `**ICP Summary:** ${spec.icpSummary}`, ''];

    if (spec.competitorGaps.length > 0) {
      lines.push('**Competitor Gaps Addressed:**');
      for (const gap of spec.competitorGaps) {
        lines.push(`- ${gap}`);
      }
      lines.push('');
    }

    if (spec.designTrends.length > 0) {
      lines.push('**Design Trends Applied:**');
      for (const trend of spec.designTrends) {
        lines.push(`- ${trend}`);
      }
      lines.push('');
    }

    for (const option of spec.options) {
      lines.push(`### Option ${option.id}: ${option.name}`);
      lines.push(`*${option.style.personality}*`);
      lines.push('');
      lines.push(`- **ICP Alignment:** ${option.icpAlignment}%`);
      lines.push(`- **Colors:** ${option.style.colorPalette.primary} / ${option.style.colorPalette.secondary}`);
      lines.push(`- **Typography:** ${option.style.typography.headingFont} + ${option.style.typography.bodyFont}`);
      lines.push(`- **Layout:** ${option.style.layout.spacing} spacing, ${option.style.layout.borderRadius} corners`);
      lines.push('');
      lines.push('**Strengths:**');
      for (const s of option.tradeoffs.strengths) lines.push(`- ${s}`);
      lines.push('');
      lines.push('**Tradeoffs:**');
      for (const w of option.tradeoffs.weaknesses) lines.push(`- ${w}`);
      lines.push('');

      const optionWireframes = wireframes.filter((w) => w.optionId === option.id);
      if (optionWireframes.length > 0) {
        lines.push(`**Wireframes:** ${optionWireframes.length} screens (lo-fi + hi-fi)`);
        for (const wf of optionWireframes) {
          lines.push(`- ${wf.screenName}`);
        }
        lines.push('');
      }
    }

    lines.push(`### Recommendation`);
    lines.push(`**Option ${spec.recommendation.optionId}** -- ${spec.recommendation.reason}`);
    lines.push('');
    lines.push(`### Saved Files (${savedFiles.length})`);
    for (const f of savedFiles) {
      lines.push(`- \`${f}\``);
    }

    return lines.join('\n');
  }

  /** Required by BaseAgent */
  async run(): Promise<AgentResult> {
    return { text: 'Design agent requires calling generate() directly.' };
  }
}
