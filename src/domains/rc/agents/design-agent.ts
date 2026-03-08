import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import { DesignSpecSchema } from '../design-types.js';
import type { DesignInput, DesignIterateInput, DesignSpec, DesignWireframe } from '../design-types.js';
import type { DesignDirectionAssessment, ExtractedDesignConstraints } from '../design-intake-types.js';
import { stampVersion } from '../artifact-versioning.js';

export class DesignAgent extends BaseAgent {
  /**
   * Generate design options with wireframes.
   * Call 1: Generate DesignSpec JSON (option specs + recommendation)
   * Call 2: For each option, generate HTML wireframes for key screens
   */
  async generate(state: ProjectState, input: DesignInput): Promise<AgentResult> {
    // Step 1: Generate design spec JSON
    const spec = await this.generateSpec(state, input);

    // Step 1.5: Validate spec against brand/intake constraints
    const constraintWarnings = this.validateConstraints(spec, input);

    // Step 2: Generate wireframes for each option (with brand/copy/font context)
    // Use atomic approach: collect all, validate, then save
    const wireframes: DesignWireframe[] = [];
    const failedOptions: string[] = [];
    for (const option of spec.options) {
      try {
        const screens = await this.generateWireframes(state, option, spec, input);
        // Verify wireframes have actual content (not just placeholders)
        const hasContent = screens.some(s =>
          s.hifiHtml.length > 100 && !s.hifiHtml.includes('wireframe not generated'),
        );
        if (!hasContent) {
          failedOptions.push(option.id);
        }
        wireframes.push(...screens);
      } catch (err) {
        failedOptions.push(option.id);
        console.error(`[DesignAgent] Wireframe generation failed for option ${option.id}: ${(err as Error).message}`);
      }
    }

    // If ALL options failed, return error instead of saving empty artifacts
    if (failedOptions.length === spec.options.length) {
      return {
        text: `Error: Wireframe generation failed for all design options (${failedOptions.join(', ')}). The design spec was generated but no wireframes could be produced. Try again or adjust the design parameters.`,
        isError: true,
        errorCode: 'LLM_ERROR',
      };
    }

    // Step 3: Self-critique against design rules + intake constraints
    const critiqueNote = await this.selfCritique(state, spec, input);

    // Step 4: Save artifacts (only for successful options)
    const successfulWireframes = wireframes.filter(wf => !failedOptions.includes(wf.optionId));
    const savedFiles = this.saveDesignArtifacts(state, spec, successfulWireframes);

    // Build user-facing summary
    let summary = this.formatSummary(spec, successfulWireframes, savedFiles);

    if (constraintWarnings.length > 0) {
      summary += `\n\n---\n\n## Constraint Validation Warnings\n\n`;
      for (const w of constraintWarnings) {
        summary += `- ${w}\n`;
      }
    }

    if (failedOptions.length > 0) {
      summary += `\n\n> **Note:** Wireframe generation failed for option(s): ${failedOptions.join(', ')}. Only successful options were saved.\n`;
    }

    if (critiqueNote) {
      summary += `\n\n---\n\n## Design Self-Critique\n\n${critiqueNote}`;
    }

    return {
      text: summary,
      artifacts: savedFiles,
    };
  }

  /** Validate design spec against brand profile and intake constraints */
  private validateConstraints(spec: DesignSpec, input: DesignInput): string[] {
    const warnings: string[] = [];

    // Validate against brand profile colors
    if (input.brandProfilePath) {
      try {
        const brand = JSON.parse(fs.readFileSync(input.brandProfilePath, 'utf-8'));
        const brandPrimary = brand.colors?.primary?.hex?.toUpperCase();
        if (brandPrimary) {
          for (const option of spec.options) {
            const specPrimary = option.style.colorPalette.primary?.toUpperCase();
            if (specPrimary && specPrimary !== brandPrimary) {
              warnings.push(
                `Option ${option.id}: Primary color ${specPrimary} differs from brand primary ${brandPrimary}. Verify this is intentional.`,
              );
            }
          }
        }

        // Validate fonts
        const brandHeadingFont = brand.typography?.headingFont?.family;
        if (brandHeadingFont) {
          for (const option of spec.options) {
            if (option.style.typography.headingFont !== brandHeadingFont) {
              warnings.push(
                `Option ${option.id}: Heading font "${option.style.typography.headingFont}" differs from brand font "${brandHeadingFont}".`,
              );
            }
          }
        }
      } catch { /* continue without brand validation */ }
    }

    // Validate against intake constraints
    if (input.designIntakePath) {
      try {
        const jsonPath = input.designIntakePath.replace(/\.md$/, '.json');
        if (fs.existsSync(jsonPath)) {
          const intake = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          const constraints = intake.extractedConstraints as ExtractedDesignConstraints | undefined;

          // Check avoided colors
          if (constraints?.colorDirection?.avoid?.length) {
            for (const option of spec.options) {
              const palette = option.style.colorPalette;
              const paletteColors = [palette.primary, palette.secondary, palette.background]
                .filter(Boolean)
                .map(c => c!.toUpperCase());
              for (const avoided of constraints.colorDirection.avoid) {
                const avoidedUpper = avoided.toUpperCase();
                if (paletteColors.includes(avoidedUpper)) {
                  warnings.push(
                    `Option ${option.id}: Uses avoided color ${avoided} (from intake preferences).`,
                  );
                }
              }
            }
          }

          // Check WCAG target
          if (constraints?.accessibilityDirection?.wcagTarget) {
            warnings.push(
              `WCAG target: ${constraints.accessibilityDirection.wcagTarget} — verify all options meet this level.`,
            );
          }
        }
      } catch { /* continue without intake validation */ }
    }

    return warnings;
  }

  /** Self-critique the generated design spec against design rules and intake constraints */
  private async selfCritique(state: ProjectState, spec: DesignSpec, input?: DesignInput): Promise<string | null> {
    // Both critique files are required -- loadDesignContext('critique') would also work
    const knowledgeFiles = ['skills/design/rc-design-critique.md', 'skills/design/rc-design-accessibility.md'];

    const specSummary = spec.options.map((o) => {
      return `Option ${o.id} "${o.name}": Primary=${o.style.colorPalette.primary}, Secondary=${o.style.colorPalette.secondary}, Heading=${o.style.typography.headingFont}, Body=${o.style.typography.bodyFont}, Radius=${o.style.layout.borderRadius}, ICP=${o.icpAlignment}`;
    }).join('\n');

    // Include intake constraints so critique can verify compliance
    let intakeContext = '';
    if (input) {
      const constraints = this.loadIntakeConstraints(input);
      if (constraints) {
        intakeContext = `\n\nDesign Intake Constraints (verify the spec follows these):\n${this.formatIntakeConstraints(constraints)}`;
      }
    }

    const instructions = `You are a design critic. Review this design specification and identify potential issues.

FOCUS ON:
- Color contrast (will primary text on background meet WCAG AA 4.5:1?)
- Typography pairing quality (do heading + body fonts complement each other?)
- ICP alignment (does the visual style match the target user?)
- Missing states (did the spec account for loading, empty, error states?)
- Accessibility risks (color-only indicators, small touch targets, etc.)${intakeContext ? '\n- Intake constraint compliance (does the spec follow the validated design direction?)' : ''}

Be concise. List the top 3-5 findings as bullet points with severity (critical/high/medium).
If the design is solid, say so briefly.`;

    try {
      return await this.execute(
        knowledgeFiles,
        instructions,
        `Critique this design specification for "${state.projectName}":\n\n${specSummary}\n\nRecommended option: ${spec.recommendation.optionId} — ${spec.recommendation.reason}${intakeContext}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[DesignAgent] selfCritique failed: ${message}`);
      return `**Warning: Design self-critique was skipped due to an error.**\nReason: ${message}\n\nConsider running \`design_challenge\` manually to get a full design review.`;
    }
  }

  /**
   * Load design intake constraints from JSON file.
   * Tries .json first (structured), falls back to .md path by swapping extension.
   */
  private loadIntakeConstraints(input: DesignInput): ExtractedDesignConstraints | null {
    if (!input.designIntakePath) return null;

    // Try JSON version first (Gap A saves this alongside .md)
    const jsonPath = input.designIntakePath.replace(/\.md$/, '.json');
    for (const candidate of [jsonPath, input.designIntakePath]) {
      try {
        if (!fs.existsSync(candidate)) continue;
        if (candidate.endsWith('.json')) {
          const assessment: DesignDirectionAssessment = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
          return assessment.extractedConstraints;
        }
      } catch { /* continue to next candidate */ }
    }
    return null;
  }

  /** Format intake constraints into LLM-consumable text */
  private formatIntakeConstraints(constraints: ExtractedDesignConstraints): string {
    const sections: string[] = ['## Design Intake Constraints (MUST FOLLOW)'];

    // Color direction
    if (constraints.colorDirection.primary || constraints.colorDirection.palette?.length) {
      sections.push(`\n### Color Direction`);
      if (constraints.colorDirection.primary) sections.push(`- Primary color: ${constraints.colorDirection.primary}`);
      if (constraints.colorDirection.palette?.length) sections.push(`- Palette: ${constraints.colorDirection.palette.join(', ')}`);
      if (constraints.colorDirection.avoid?.length) sections.push(`- AVOID: ${constraints.colorDirection.avoid.join(', ')}`);
      if (constraints.colorDirection.semanticColors) {
        const sc = constraints.colorDirection.semanticColors;
        sections.push(`- Semantic: success=${sc.success ?? 'auto'}, warning=${sc.warning ?? 'auto'}, error=${sc.error ?? 'auto'}, info=${sc.info ?? 'auto'}`);
      }
      sections.push(`- Rationale: ${constraints.colorDirection.rationale}`);
    }

    // Typography
    if (constraints.typographyDirection.headingStyle || constraints.typographyDirection.bodyStyle) {
      sections.push(`\n### Typography Direction`);
      if (constraints.typographyDirection.headingStyle) sections.push(`- Heading style: ${constraints.typographyDirection.headingStyle}`);
      if (constraints.typographyDirection.bodyStyle) sections.push(`- Body style: ${constraints.typographyDirection.bodyStyle}`);
      if (constraints.typographyDirection.pairingSuggestions.length) sections.push(`- Pairings: ${constraints.typographyDirection.pairingSuggestions.join('; ')}`);
    }

    // Layout
    sections.push(`\n### Layout Direction`);
    if (constraints.layoutDirection.patterns.length) sections.push(`- Preferred patterns: ${constraints.layoutDirection.patterns.join(', ')}`);
    if (constraints.layoutDirection.avoidPatterns.length) sections.push(`- AVOID patterns: ${constraints.layoutDirection.avoidPatterns.join(', ')}`);
    if (constraints.layoutDirection.navigationPattern) sections.push(`- Navigation: ${constraints.layoutDirection.navigationPattern}`);
    if (constraints.layoutDirection.contentDensity) sections.push(`- Content density: ${constraints.layoutDirection.contentDensity}`);

    // Mood
    if (constraints.moodDirection.keywords.length) {
      sections.push(`\n### Mood & Aesthetic`);
      sections.push(`- Keywords: ${constraints.moodDirection.keywords.join(', ')}`);
      if (constraints.moodDirection.aesthetic) sections.push(`- Aesthetic: ${constraints.moodDirection.aesthetic}`);
    }

    // Interaction & Motion
    if (constraints.interactionDirection.animationLevel || constraints.interactionDirection.interactionDensity) {
      sections.push(`\n### Interaction & Motion`);
      if (constraints.interactionDirection.animationLevel) sections.push(`- Animation level: ${constraints.interactionDirection.animationLevel}`);
      if (constraints.interactionDirection.interactionDensity) sections.push(`- Interaction density: ${constraints.interactionDirection.interactionDensity}`);
    }

    // Component preferences
    const cd = constraints.componentDirection;
    if (cd.cardStyle || cd.formStyle || cd.buttonStyle || cd.iconStyle || cd.imageryStyle) {
      sections.push(`\n### Component Preferences`);
      if (cd.cardStyle) sections.push(`- Cards: ${cd.cardStyle}`);
      if (cd.formStyle) sections.push(`- Forms: ${cd.formStyle}`);
      if (cd.buttonStyle) sections.push(`- Buttons: ${cd.buttonStyle}`);
      if (cd.modalPreference) sections.push(`- Modals: ${cd.modalPreference}`);
      if (cd.iconStyle) sections.push(`- Icons: ${cd.iconStyle}`);
      if (cd.imageryStyle) sections.push(`- Imagery: ${cd.imageryStyle}`);
    }

    // Platform
    if (constraints.platformDirection.primaryPlatform || constraints.platformDirection.designSystemFramework) {
      sections.push(`\n### Platform & Device`);
      if (constraints.platformDirection.primaryPlatform) sections.push(`- Platform: ${constraints.platformDirection.primaryPlatform}`);
      if (constraints.platformDirection.devicePriority) sections.push(`- Device priority: ${constraints.platformDirection.devicePriority}`);
      if (constraints.platformDirection.designSystemFramework) sections.push(`- Framework: ${constraints.platformDirection.designSystemFramework}`);
    }

    // Accessibility
    if (constraints.accessibilityDirection.wcagTarget || constraints.accessibilityDirection.requirements.length) {
      sections.push(`\n### Accessibility`);
      if (constraints.accessibilityDirection.wcagTarget) sections.push(`- WCAG target: ${constraints.accessibilityDirection.wcagTarget}`);
      if (constraints.accessibilityDirection.requirements.length) sections.push(`- Requirements: ${constraints.accessibilityDirection.requirements.join(', ')}`);
    }

    // Screen inventory
    if (constraints.screenInventory.keyScreens.length) {
      sections.push(`\n### Screen Inventory (from intake)`);
      sections.push(`- Key screens: ${constraints.screenInventory.keyScreens.join(', ')}`);
      if (constraints.screenInventory.priorityScreens.length) sections.push(`- Priority screens (design these first): ${constraints.screenInventory.priorityScreens.join(', ')}`);
      if (constraints.screenInventory.criticalFlows.length) sections.push(`- Critical flows: ${constraints.screenInventory.criticalFlows.join('; ')}`);
    }

    // Competitive differentiation
    if (constraints.competitiveDifferentiators.length) {
      sections.push(`\n### Competitive Differentiation`);
      for (const d of constraints.competitiveDifferentiators) sections.push(`- ${d}`);
    }

    return sections.join('\n');
  }

  /** Generate the design specification JSON */
  private async generateSpec(state: ProjectState, input: DesignInput): Promise<DesignSpec> {
    const inspirationSection = input.inspiration
      ? `\n\n## User Design Preferences\nThe user provided these design references/preferences:\n${input.inspiration}`
      : '\n\n## User Design Preferences\nNo specific preferences provided -- use your best judgment based on ICP and product type.';

    const icpSection = input.icpData ? `\n\n## Ideal Customer Profile\n${input.icpData}` : '';

    const competitorSection = input.competitorData ? `\n\n## Competitor Analysis\n${input.competitorData}` : '';

    // Load and format design intake constraints
    const intakeConstraints = this.loadIntakeConstraints(input);
    const intakeSection = intakeConstraints
      ? `\n\n${this.formatIntakeConstraints(intakeConstraints)}`
      : '';

    const intakeRules = intakeConstraints
      ? `\n- CRITICAL: Follow the Design Intake Constraints below — these represent validated user preferences aligned with ICP
- Use the intake's screen inventory for keyScreens (don't invent different screens)
- Respect color, typography, mood, component, and platform constraints
- Each option should interpret the constraints differently while staying within bounds`
      : '';

    const instructions = `You are a senior product designer and design system architect. Generate ${input.optionCount === 1 ? '1 design option' : '3 distinct design options'} for the product described below.

RULES:
- Each option must have a distinct visual personality and approach
- Base design decisions on the ICP (ideal customer profile) and product type
- Consider current design trends and competitor gaps
- Include a color palette, typography, layout strategy, and key screen descriptions
- Score each option for ICP alignment (0-100)
- Recommend the best option with clear reasoning${intakeRules}
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
        "colorPalette": { "primary": "#...", "secondary": "#...", "background": "#...", "surface": "#...", "text": "#...", "muted": "#...", "semantic": { "success": "#...", "warning": "#...", "error": "#...", "info": "#..." } },
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

    // Load full 'generate' knowledge set: patterns, emotional design, accessibility, trends, typography
    const text = await this.execute(
      [
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-emotional.md',
        'skills/design/rc-design-accessibility.md',
        'skills/design/rc-design-trends-2026.md',
        'skills/design/rc-design-typography.md',
      ],
      instructions,
      `Generate design options for this product.\n\n## Product Requirements\n${input.prdContext}${inspirationSection}${icpSection}${competitorSection}${intakeSection}`,
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

    // Build intake constraints for wireframe generation
    let intakeWireframeSection = '';
    if (input) {
      const intakeConstraints = this.loadIntakeConstraints(input);
      if (intakeConstraints) {
        const parts: string[] = ['\n\nDESIGN INTAKE CONSTRAINTS (apply to wireframes):'];
        const cd = intakeConstraints.componentDirection;
        if (cd.cardStyle) parts.push(`- Card style: ${cd.cardStyle}`);
        if (cd.formStyle) parts.push(`- Form input style: ${cd.formStyle}`);
        if (cd.buttonStyle) parts.push(`- Button style: ${cd.buttonStyle}`);
        if (cd.modalPreference) parts.push(`- Modal pattern: ${cd.modalPreference}`);
        if (cd.iconStyle) parts.push(`- Icon style: ${cd.iconStyle}`);
        if (intakeConstraints.interactionDirection.animationLevel) {
          parts.push(`- Animation level: ${intakeConstraints.interactionDirection.animationLevel}`);
        }
        if (intakeConstraints.interactionDirection.interactionDensity) {
          parts.push(`- Interaction density: ${intakeConstraints.interactionDirection.interactionDensity}`);
        }
        if (intakeConstraints.layoutDirection.navigationPattern) {
          parts.push(`- Navigation pattern: ${intakeConstraints.layoutDirection.navigationPattern}`);
        }
        if (intakeConstraints.accessibilityDirection.wcagTarget) {
          parts.push(`- WCAG target: ${intakeConstraints.accessibilityDirection.wcagTarget} — ensure contrast ratios meet this level`);
        }
        if (parts.length > 1) intakeWireframeSection = parts.join('\n');
      }
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
- Border radius: ${layout.borderRadius}${brandSection}${fontSection}${copySection}${intakeWireframeSection}

OUTPUT FORMAT: For each screen, output in this exact format:

===WIREFRAME: screenName|lofi===
<complete HTML document>
===END_WIREFRAME===

===WIREFRAME: screenName|hifi===
<complete HTML document>
===END_WIREFRAME===`;

    // Wireframes need patterns + accessibility + typography (for font rendering rules)
    const text = await this.execute(
      [
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-accessibility.md',
        'skills/design/rc-design-typography.md',
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

    // Save design spec JSON with schema version
    const specPath = path.join(designDir, `DESIGN-SPEC.json`);
    const versionedSpec = stampVersion('design-spec', spec as unknown as Record<string, unknown>);
    fs.writeFileSync(specPath, JSON.stringify(versionedSpec, null, 2), 'utf-8');
    const specRef = `rc-method/design/DESIGN-SPEC.json`;
    savedFiles.push(specRef);

    // Save wireframes as HTML files and build manifest
    const manifest: Array<{
      optionId: string;
      screenName: string;
      lofi: string;
      hifi: string;
    }> = [];

    for (const wf of wireframes) {
      const screenSlug = wf.screenName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const optionDir = path.join(designDir, `option-${wf.optionId.toLowerCase()}`);
      fs.mkdirSync(optionDir, { recursive: true });

      const lofiRef = `rc-method/design/option-${wf.optionId.toLowerCase()}/${screenSlug}-lofi.html`;
      const hifiRef = `rc-method/design/option-${wf.optionId.toLowerCase()}/${screenSlug}-hifi.html`;

      const lofiPath = path.join(optionDir, `${screenSlug}-lofi.html`);
      fs.writeFileSync(lofiPath, wf.lofiHtml, 'utf-8');
      savedFiles.push(lofiRef);

      const hifiPath = path.join(optionDir, `${screenSlug}-hifi.html`);
      fs.writeFileSync(hifiPath, wf.hifiHtml, 'utf-8');
      savedFiles.push(hifiRef);

      manifest.push({
        optionId: wf.optionId,
        screenName: wf.screenName,
        lofi: lofiRef,
        hifi: hifiRef,
      });
    }

    // Save wireframe manifest (maps spec screens → actual files)
    const manifestPath = path.join(designDir, 'WIREFRAME-MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), wireframes: manifest }, null, 2), 'utf-8');
    const manifestRef = 'rc-method/design/WIREFRAME-MANIFEST.json';
    savedFiles.push(manifestRef);

    // Track in state (deduplicated)
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

  /**
   * Iterate on existing wireframes based on user feedback.
   * Loads the current design spec and selected option, regenerates wireframes
   * for targeted screens with the feedback applied.
   */
  async iterate(state: ProjectState, input: DesignIterateInput): Promise<AgentResult> {
    // Load existing design spec
    const designDir = path.join(state.projectPath, 'rc-method', 'design');
    const specFile = 'DESIGN-SPEC.json';
    const specFilePath = path.join(designDir, specFile);
    if (!fs.existsSync(specFilePath)) {
      return { text: 'Error: No design spec found. Run ux_design first.', isError: true, errorCode: 'FILE_NOT_FOUND' };
    }

    const specContent = fs.readFileSync(specFilePath, 'utf-8');
    const spec: DesignSpec = JSON.parse(specContent);

    // Find the target option
    const optionId = input.targetOptionId ?? state.selectedDesign?.optionId ?? spec.recommendation.optionId;
    const option = spec.options.find((o) => o.id === optionId);
    if (!option) {
      return { text: `Error: Design option "${optionId}" not found in spec.`, isError: true, errorCode: 'FILE_NOT_FOUND' };
    }

    // Filter screens if specified
    const screens = input.targetScreens
      ? option.keyScreens.filter((s) => input.targetScreens!.some((t) => s.name.toLowerCase().includes(t.toLowerCase())))
      : option.keyScreens;

    if (screens.length === 0) {
      return { text: `Error: No matching screens found for targets: ${input.targetScreens?.join(', ')}`, isError: true };
    }

    // Load existing wireframes for context
    const optionDir = path.join(designDir, `option-${optionId.toLowerCase()}`);
    let existingWireframes = '';
    if (fs.existsSync(optionDir)) {
      const hifiFiles = fs.readdirSync(optionDir).filter((f) => f.endsWith('-hifi.html'));
      for (const f of hifiFiles.slice(0, 3)) {
        existingWireframes += `\n\n### ${f}\n\`\`\`html\n${fs.readFileSync(path.join(optionDir, f), 'utf-8').slice(0, 2000)}\n\`\`\``;
      }
    }

    const { colorPalette, typography, layout } = option.style;
    const screenList = screens.map((s) => `- ${s.name}: ${s.description}`).join('\n');

    const instructions = `You are a UI wireframe iteration agent. Revise wireframes based on user feedback while maintaining the design system.

RULES:
- Apply the feedback to the specified screens
- Maintain consistency with the existing design spec (colors, typography, layout)
- Generate BOTH lo-fi and hi-fi versions for each revised screen
- Each HTML file must be self-contained (inline CSS). The ONLY allowed external dependency is Google Fonts via <link> tag
- Show what changed and why
- The project is "${state.projectName}"

DESIGN TOKENS:
- Primary: ${colorPalette.primary}, Secondary: ${colorPalette.secondary}
- Background: ${colorPalette.background}, Surface: ${colorPalette.surface}
- Text: ${colorPalette.text}, Muted: ${colorPalette.muted}
- Heading font: ${typography.headingFont}, Body font: ${typography.bodyFont}
- Max width: ${layout.maxWidth}, Spacing: ${layout.spacing}, Border radius: ${layout.borderRadius}

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
      `Revise wireframes for option "${optionId}: ${option.name}" based on this feedback:\n\n${input.feedback}\n\nScreens to revise:\n${screenList}`,
      existingWireframes ? `## Existing Wireframes (for reference)${existingWireframes}` : undefined,
    );

    // Parse and save revised wireframes
    const wireframes = this.parseWireframes(optionId, text);
    const savedFiles: string[] = [];

    for (const wf of wireframes) {
      const screenSlug = wf.screenName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      fs.mkdirSync(optionDir, { recursive: true });

      const lofiPath = path.join(optionDir, `${screenSlug}-lofi.html`);
      fs.writeFileSync(lofiPath, wf.lofiHtml, 'utf-8');
      savedFiles.push(`rc-method/design/option-${optionId.toLowerCase()}/${screenSlug}-lofi.html`);

      const hifiPath = path.join(optionDir, `${screenSlug}-hifi.html`);
      fs.writeFileSync(hifiPath, wf.hifiHtml, 'utf-8');
      savedFiles.push(`rc-method/design/option-${optionId.toLowerCase()}/${screenSlug}-hifi.html`);
    }

    for (const ref of savedFiles) {
      if (!state.artifacts.includes(ref)) {
        state.artifacts.push(ref);
      }
    }

    return {
      text: `## Design Iteration Complete\n\n**Option:** ${optionId} — ${option.name}\n**Screens revised:** ${wireframes.map((w) => w.screenName).join(', ')}\n**Feedback applied:** ${input.feedback}\n\n### Updated Files (${savedFiles.length})\n${savedFiles.map((f) => `- \`${f}\``).join('\n')}`,
      artifacts: savedFiles,
    };
  }

  /** Required by BaseAgent */
  async run(): Promise<AgentResult> {
    return { text: 'Design agent requires calling generate() or iterate() directly.' };
  }
}
