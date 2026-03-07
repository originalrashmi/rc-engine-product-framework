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

    // Step 2: Generate wireframes for each option (with brand/copy/font context)
    const wireframes: DesignWireframe[] = [];
    for (const option of spec.options) {
      const screens = await this.generateWireframes(state, option, spec, input);
      wireframes.push(...screens);
    }

    // Step 3: Self-critique against design rules (if critique knowledge available)
    const critiqueNote = await this.selfCritique(state, spec);

    // Step 4: Save artifacts
    const savedFiles = this.saveDesignArtifacts(state, spec, wireframes);

    // Build user-facing summary
    let summary = this.formatSummary(spec, wireframes, savedFiles);
    if (critiqueNote) {
      summary += `\n\n---\n\n## Design Self-Critique\n\n${critiqueNote}`;
    }

    return {
      text: summary,
      artifacts: savedFiles,
    };
  }

  /** Self-critique the generated design spec against design rules */
  private async selfCritique(state: ProjectState, spec: DesignSpec): Promise<string | null> {
    const critiqueKnowledge = this.contextLoader.tryLoadFile('skills/design/rc-design-critique.md');
    if (!critiqueKnowledge) return null;

    const a11yKnowledge = this.contextLoader.tryLoadFile('skills/design/rc-design-accessibility.md');

    const knowledgeFiles = ['skills/design/rc-design-critique.md'];
    if (a11yKnowledge) knowledgeFiles.push('skills/design/rc-design-accessibility.md');

    const specSummary = spec.options.map((o) => {
      return `Option ${o.id} "${o.name}": Primary=${o.style.colorPalette.primary}, Secondary=${o.style.colorPalette.secondary}, Heading=${o.style.typography.headingFont}, Body=${o.style.typography.bodyFont}, Radius=${o.style.layout.borderRadius}, ICP=${o.icpAlignment}`;
    }).join('\n');

    const instructions = `You are a design critic. Review this design specification and identify potential issues.

FOCUS ON:
- Color contrast (will primary text on background meet WCAG AA 4.5:1?)
- Typography pairing quality (do heading + body fonts complement each other?)
- ICP alignment (does the visual style match the target user?)
- Missing states (did the spec account for loading, empty, error states?)
- Accessibility risks (color-only indicators, small touch targets, etc.)

Be concise. List the top 3-5 findings as bullet points with severity (critical/high/medium).
If the design is solid, say so briefly.`;

    try {
      return await this.execute(
        knowledgeFiles,
        instructions,
        `Critique this design specification for "${state.projectName}":\n\n${specSummary}\n\nRecommended option: ${spec.recommendation.optionId} — ${spec.recommendation.reason}`,
      );
    } catch {
      return null;
    }
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
      [
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-accessibility.md',
      ],
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
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Design spec validation failed: ${issues}`);
    }

    return result.data;
  }

  /** Generate HTML wireframes for a single design option */
  private async generateWireframes(
    state: ProjectState,
    option: DesignSpec['options'][0],
    _spec: DesignSpec,
    input?: DesignInput,
  ): Promise<DesignWireframe[]> {
    const { colorPalette, typography, layout } = option.style;
    const screenList = option.keyScreens.map((s) => `- ${s.name}: ${s.description}`).join('\n');

    // Build font embed instruction
    let fontSection = '';
    if (input?.fontEmbedHtml) {
      fontSection = `\n\nFONT EMBED (include in <head> of hi-fi wireframes):\n${input.fontEmbedHtml}`;
    }

    // Build copy context instruction
    let copySection = '';
    if (input?.copySystemPath) {
      try {
        const copyContent = fs.readFileSync(input.copySystemPath, 'utf-8');
        copySection = `\n\nCOPY SYSTEM (use real copy from this, not placeholder text):\n${copyContent.slice(0, 4000)}`;
      } catch { /* continue with placeholder copy */ }
    }

    // Build brand constraints
    let brandSection = '';
    if (input?.brandProfilePath) {
      try {
        const brandJson = fs.readFileSync(input.brandProfilePath, 'utf-8');
        const brand = JSON.parse(brandJson);
        if (brand.shape?.borderRadius) {
          brandSection += `\n- Brand border radius: ${brand.shape.borderRadius.default}`;
        }
        if (brand.voice?.personality) {
          brandSection += `\n- Brand personality: ${brand.voice.personality.join(', ')}`;
        }
      } catch { /* continue without brand */ }
    }

    const instructions = `You are a UI wireframe generator. Create self-contained HTML wireframes for the design option described below.

RULES:
- Generate TWO versions for each screen: lo-fi (grayscale, boxes, placeholder text) and hi-fi (full colors, real-looking content)
- Each HTML file must be self-contained (inline CSS). The ONLY allowed external dependency is Google Fonts via <link> tag
- Use the exact color palette and typography specified
- Include realistic placeholder content (not "Lorem ipsum")${copySection ? ' — USE THE COPY SYSTEM BELOW for actual headlines, CTAs, and body text' : ''}
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
- Border radius: ${layout.borderRadius}${brandSection}${fontSection}${copySection}

OUTPUT FORMAT: For each screen, output in this exact format:

===WIREFRAME: screenName|lofi===
<complete HTML document>
===END_WIREFRAME===

===WIREFRAME: screenName|hifi===
<complete HTML document>
===END_WIREFRAME===`;

    const text = await this.execute(
      [
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-accessibility.md',
      ],
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
