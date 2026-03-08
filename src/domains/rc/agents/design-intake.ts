import { BaseAgent } from './base-agent.js';
import type { AgentResult } from '../types.js';
import type { BrandProfile } from '../brand-types.js';
import type {
  DesignIntakeInput,
  DesignDirectionAssessment,
  CompetitiveLandscape,
  DesignDirectionFinding,
  ExtractedDesignConstraints,
} from '../design-intake-types.js';
import { FontService } from '../services/font-service.js';

/**
 * DesignIntakeAgent
 *
 * Gathers user design intelligence before the design phase.
 * Runs three parallel analysis tasks:
 * 1. CompetitorAnalyzer - scrapes and analyzes competitor URLs
 * 2. ReferenceAnalyzer - analyzes reference designs + user preferences
 * 3. DesignDirectionEvaluator - synthesizes all inputs and produces verdict
 *
 * Produces a DesignDirectionAssessment with:
 * - Competitive landscape findings
 * - Alignment score (user preferences vs ICP)
 * - Verdict: proceed / proceed_with_adjustments / reconsider
 * - Extracted constraints for the Design Agent
 */
export class DesignIntakeAgent extends BaseAgent {
  private fontService = new FontService();

  /**
   * Run the full design intake analysis.
   */
  async analyze(
    input: DesignIntakeInput,
    prdContext: string,
    icpData?: string,
    brandProfile?: BrandProfile,
  ): Promise<AgentResult & { assessment: DesignDirectionAssessment }> {
    const hasCompetitors = input.competitorUrls && input.competitorUrls.length > 0;
    const hasAnyPreferences = !!(
      input.colorPreferences || input.fontPreferences || input.referenceUrls?.length ||
      input.moodKeywords?.length || input.aestheticDirection || input.brandPersonality?.length ||
      input.navigationPattern || input.contentDensity || input.animationPreference ||
      input.interactionDensity || input.componentPreferences || input.iconStyle ||
      input.imageryStyle || input.primaryPlatform || input.devicePriority ||
      input.designSystemFramework || input.wcagTarget || input.accessibilityRequirements?.length ||
      input.competitorLikes?.length || input.competitorDislikes?.length ||
      input.keyScreens?.length || input.criticalFlows?.length || input.priorityScreens?.length ||
      input.structuralPreferences?.length || input.additionalContext
    );
    const isAutonomous = input.mode === 'autonomous';

    // Run parallel phases with graceful failure handling
    const parallelTasks: Array<Promise<{ type: string; result: unknown }>> = [];

    // Phase 1: Analyze competitors (if provided)
    if (hasCompetitors) {
      parallelTasks.push(
        this.analyzeCompetitors(input.competitorUrls!)
          .then(result => ({ type: 'competitors' as const, result }))
          .catch(err => {
            console.error(`[DesignIntake] Competitor analysis failed: ${(err as Error).message}`);
            return { type: 'competitors' as const, result: undefined };
          }),
      );
    }

    // Phase 2: Analyze all preferences and inputs into findings
    if (hasAnyPreferences) {
      parallelTasks.push(
        this.analyzeReferences(input, icpData)
          .then(result => ({ type: 'references' as const, result }))
          .catch(err => {
            console.error(`[DesignIntake] Reference analysis failed: ${(err as Error).message}`);
            return { type: 'references' as const, result: [] };
          }),
      );
    }

    // Phase 3: Validate font preferences
    if (input.fontPreferences?.liked) {
      parallelTasks.push(
        this.validateFontPreferences(input.fontPreferences.liked)
          .then(result => ({ type: 'fonts' as const, result }))
          .catch(err => {
            console.error(`[DesignIntake] Font validation failed: ${(err as Error).message}`);
            return { type: 'fonts' as const, result: [] };
          }),
      );
    }

    // Wait for all parallel tasks — partial failures don't block others
    const settled = await Promise.all(parallelTasks);

    let competitiveLandscape: CompetitiveLandscape | undefined;
    let referenceFindings: DesignDirectionFinding[] = [];
    let fontFindings: DesignDirectionFinding[] = [];
    const warnings: string[] = [];

    for (const { type, result } of settled) {
      if (type === 'competitors') {
        competitiveLandscape = result as CompetitiveLandscape | undefined;
        if (!competitiveLandscape) warnings.push('Competitor analysis failed — proceeding without competitive data.');
      } else if (type === 'references') {
        referenceFindings = (result as DesignDirectionFinding[]) ?? [];
      } else if (type === 'fonts') {
        fontFindings = (result as DesignDirectionFinding[]) ?? [];
      }
    }

    // Phase 4: Synthesize all inputs and produce assessment
    const assessment = await this.evaluateDirection(
      input,
      prdContext,
      icpData,
      brandProfile,
      competitiveLandscape,
      [...referenceFindings, ...fontFindings],
    );

    // Format output text
    let text = this.formatAssessment(assessment, isAutonomous);
    if (warnings.length > 0) {
      text += '\n\n---\n\n**Partial Analysis Warnings:**\n';
      for (const w of warnings) {
        text += `- ${w}\n`;
      }
    }

    return { text, assessment };
  }

  /**
   * Autonomous mode — analyze from PRD data only, no user input.
   */
  async analyzeAutonomous(
    projectPath: string,
    prdContext: string,
    icpData?: string,
    brandProfile?: BrandProfile,
  ): Promise<AgentResult & { assessment: DesignDirectionAssessment }> {
    return this.analyze(
      {
        projectPath,
        mode: 'autonomous',
      },
      prdContext,
      icpData,
      brandProfile,
    );
  }

  // ── Analysis Methods ──────────────────────────────────────────────────

  private async analyzeCompetitors(urls: string[]): Promise<CompetitiveLandscape> {
    // In passthrough mode (no API key), we generate a prompt for the host IDE
    // to fetch and analyze the URLs. In autonomous mode, we'd use fetch directly.
    const instructions = `You are a competitive design analyst. Analyze the following competitor URLs and extract design patterns.

For each URL, identify:
1. Color palette (dominant colors, accent colors)
2. Typography (font families, heading style)
3. Layout pattern (hero style, grid, navigation)
4. CTA style (placement, color, copy)
5. Strengths (what they do well visually)
6. Weaknesses (design gaps we can exploit)

Then synthesize across ALL competitors:
- Common patterns (what most/all share)
- Gaps (what NONE of them do)
- Overused patterns (saturated, differentiation opportunity)
- Visual positioning summary

URLs to analyze:
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;

    const text = await this.execute(
      ['skills/design/rc-brand-system.md'],
      instructions,
      'Analyze these competitor URLs for design intelligence.',
    );

    // Parse the LLM response into structured data
    return this.parseCompetitiveLandscape(text, urls.length);
  }

  private async analyzeReferences(
    input: DesignIntakeInput,
    icpData?: string,
  ): Promise<DesignDirectionFinding[]> {
    const findings: DesignDirectionFinding[] = [];
    const icpNote = icpData ? 'Evaluated against ICP data' : 'No ICP data available for comparison';

    // Color preferences
    if (input.colorPreferences?.liked) {
      for (const color of input.colorPreferences.liked) {
        findings.push({
          category: 'color',
          userPreference: color,
          icpExpectation: icpNote,
          alignment: 'neutral',
          recommendation: `Color preference "${color}" noted for design direction`,
        });
      }
    }

    // Reference URLs
    if (input.referenceUrls) {
      for (const url of input.referenceUrls) {
        findings.push({
          category: 'style',
          userPreference: `Reference: ${url}`,
          icpExpectation: 'To be evaluated against ICP alignment',
          alignment: 'neutral',
          recommendation: 'Reference design will be analyzed for visual patterns',
        });
      }
    }

    // Structural preferences
    if (input.structuralPreferences) {
      for (const pref of input.structuralPreferences) {
        findings.push({
          category: 'layout',
          userPreference: pref,
          icpExpectation: 'Layout suitability for product type',
          alignment: 'neutral',
          recommendation: `Structural preference "${pref}" noted`,
        });
      }
    }

    // Mood & Aesthetic
    if (input.moodKeywords) {
      findings.push({
        category: 'mood',
        userPreference: input.moodKeywords.join(', '),
        icpExpectation: 'Mood must resonate with target user expectations',
        alignment: 'neutral',
        recommendation: `Mood keywords captured: ${input.moodKeywords.join(', ')}`,
      });
    }
    if (input.aestheticDirection && input.aestheticDirection !== 'no-preference') {
      findings.push({
        category: 'mood',
        userPreference: `Aesthetic: ${input.aestheticDirection}`,
        icpExpectation: 'Aesthetic direction must suit product category',
        alignment: 'neutral',
        recommendation: `Aesthetic direction "${input.aestheticDirection}" will inform design options`,
      });
    }

    // Navigation & Content Density
    if (input.navigationPattern && input.navigationPattern !== 'no-preference') {
      findings.push({
        category: 'layout',
        userPreference: `Navigation: ${input.navigationPattern}`,
        icpExpectation: 'Navigation pattern must support primary user flows',
        alignment: 'neutral',
        recommendation: `Navigation pattern "${input.navigationPattern}" noted`,
      });
    }
    if (input.contentDensity) {
      findings.push({
        category: 'layout',
        userPreference: `Content density: ${input.contentDensity}`,
        icpExpectation: 'Density must match ICP technical sophistication',
        alignment: 'neutral',
        recommendation: `Content density "${input.contentDensity}" will guide spacing and information hierarchy`,
      });
    }

    // Interaction & Motion
    if (input.animationPreference && input.animationPreference !== 'no-preference') {
      findings.push({
        category: 'interaction',
        userPreference: `Animation: ${input.animationPreference}`,
        icpExpectation: 'Animation level must suit product type and a11y requirements',
        alignment: 'neutral',
        recommendation: `Animation level "${input.animationPreference}" noted for motion design`,
      });
    }
    if (input.interactionDensity) {
      findings.push({
        category: 'interaction',
        userPreference: `Interaction density: ${input.interactionDensity}`,
        icpExpectation: 'Must match target user expertise level',
        alignment: 'neutral',
        recommendation: `"${input.interactionDensity}" interaction targets — affects touch/click areas and spacing`,
      });
    }

    // Component Preferences
    if (input.componentPreferences) {
      const cp = input.componentPreferences;
      const prefs = [
        cp.cardStyle && cp.cardStyle !== 'no-preference' ? `cards: ${cp.cardStyle}` : null,
        cp.formStyle && cp.formStyle !== 'no-preference' ? `forms: ${cp.formStyle}` : null,
        cp.buttonStyle && cp.buttonStyle !== 'no-preference' ? `buttons: ${cp.buttonStyle}` : null,
        cp.modalPreference && cp.modalPreference !== 'no-preference' ? `overlays: ${cp.modalPreference}` : null,
      ].filter(Boolean);
      if (prefs.length > 0) {
        findings.push({
          category: 'component',
          userPreference: prefs.join(', '),
          icpExpectation: 'Component styles must be consistent with overall aesthetic',
          alignment: 'neutral',
          recommendation: `Component style preferences: ${prefs.join(', ')}`,
        });
      }
    }
    if (input.iconStyle && input.iconStyle !== 'no-preference') {
      findings.push({
        category: 'component',
        userPreference: `Icons: ${input.iconStyle}`,
        icpExpectation: 'Icon style must complement typography and layout',
        alignment: 'neutral',
        recommendation: `Icon style "${input.iconStyle}" will inform icon library selection`,
      });
    }
    if (input.imageryStyle && input.imageryStyle !== 'no-preference') {
      findings.push({
        category: 'component',
        userPreference: `Imagery: ${input.imageryStyle}`,
        icpExpectation: 'Imagery approach must suit brand and content strategy',
        alignment: 'neutral',
        recommendation: `Imagery style "${input.imageryStyle}" noted for visual content direction`,
      });
    }

    // Platform & Device
    if (input.primaryPlatform) {
      findings.push({
        category: 'platform',
        userPreference: `Platform: ${input.primaryPlatform}`,
        icpExpectation: 'Design must follow platform conventions (Material/HIG/Web)',
        alignment: 'neutral',
        recommendation: `Primary platform "${input.primaryPlatform}" — design patterns will follow platform guidelines`,
      });
    }
    if (input.devicePriority && input.devicePriority !== 'no-preference') {
      findings.push({
        category: 'platform',
        userPreference: `Device priority: ${input.devicePriority}`,
        icpExpectation: 'Must match how ICP primarily accesses the product',
        alignment: 'neutral',
        recommendation: `"${input.devicePriority}" strategy will drive responsive breakpoint design`,
      });
    }
    if (input.designSystemFramework && input.designSystemFramework !== 'no-preference') {
      findings.push({
        category: 'platform',
        userPreference: `Framework: ${input.designSystemFramework}`,
        icpExpectation: 'Framework must support required component patterns',
        alignment: 'neutral',
        recommendation: `Design system framework "${input.designSystemFramework}" — wireframes will align with its patterns`,
      });
    }

    // Accessibility
    if (input.wcagTarget && input.wcagTarget !== 'no-preference') {
      findings.push({
        category: 'accessibility',
        userPreference: `WCAG ${input.wcagTarget}`,
        icpExpectation: 'Compliance target drives contrast, touch targets, and interaction design',
        alignment: 'aligned',
        recommendation: `WCAG ${input.wcagTarget} compliance — all design decisions will be validated against this standard`,
      });
    }
    if (input.accessibilityRequirements?.length) {
      findings.push({
        category: 'accessibility',
        userPreference: input.accessibilityRequirements.join(', '),
        icpExpectation: 'Accessibility requirements are non-negotiable constraints',
        alignment: 'aligned',
        recommendation: `A11y requirements: ${input.accessibilityRequirements.join(', ')}`,
      });
    }

    // Competitor likes/dislikes (qualitative)
    if (input.competitorLikes?.length) {
      findings.push({
        category: 'competitive',
        userPreference: `Likes: ${input.competitorLikes.join('; ')}`,
        icpExpectation: 'Elements to potentially adopt if ICP-aligned',
        alignment: 'neutral',
        recommendation: `User appreciates: ${input.competitorLikes.join('; ')}`,
      });
    }
    if (input.competitorDislikes?.length) {
      findings.push({
        category: 'competitive',
        userPreference: `Dislikes: ${input.competitorDislikes.join('; ')}`,
        icpExpectation: 'Differentiation opportunities',
        alignment: 'neutral',
        recommendation: `User wants to avoid: ${input.competitorDislikes.join('; ')}`,
      });
    }

    // Screen Inventory
    if (input.keyScreens?.length) {
      findings.push({
        category: 'screen-inventory',
        userPreference: `Key screens: ${input.keyScreens.join(', ')}`,
        icpExpectation: 'Screen inventory drives design scope',
        alignment: 'aligned',
        recommendation: `${input.keyScreens.length} key screens identified for design`,
      });
    }
    if (input.criticalFlows?.length) {
      findings.push({
        category: 'screen-inventory',
        userPreference: `Critical flows: ${input.criticalFlows.join('; ')}`,
        icpExpectation: 'User journeys must be optimized in design',
        alignment: 'aligned',
        recommendation: `${input.criticalFlows.length} critical user flow(s) to prioritize`,
      });
    }
    if (input.priorityScreens?.length) {
      findings.push({
        category: 'screen-inventory',
        userPreference: `Priority screens: ${input.priorityScreens.join(', ')}`,
        icpExpectation: 'These screens get highest design fidelity',
        alignment: 'aligned',
        recommendation: `Top priority screens for design quality: ${input.priorityScreens.join(', ')}`,
      });
    }

    // Brand personality
    if (input.brandPersonality?.length) {
      findings.push({
        category: 'mood',
        userPreference: `Brand personality: ${input.brandPersonality.join(', ')}`,
        icpExpectation: 'Personality must resonate with target audience',
        alignment: 'neutral',
        recommendation: `Brand personality traits: ${input.brandPersonality.join(', ')}`,
      });
    }

    return findings;
  }

  private async validateFontPreferences(
    fonts: string[],
  ): Promise<DesignDirectionFinding[]> {
    const findings: DesignDirectionFinding[] = [];

    for (const font of fonts) {
      // Check if it's a style description (e.g., "editorial serif") or specific font
      if (font.includes(' ') && !font.match(/^[A-Z]/)) {
        // Style description — find matching pairings
        const mood = this.mapDescriptionToMood(font);
        if (mood) {
          const pairings = this.fontService.getPairings({ mood });
          findings.push({
            category: 'typography',
            userPreference: font,
            icpExpectation: `Mapped to "${mood}" mood`,
            alignment: 'aligned',
            recommendation: `Matched to ${pairings.length} curated pairings for "${mood}" style`,
          });
        }
      } else {
        // Specific font name — validate availability
        const validation = await this.fontService.validate({
          family: font,
          requiredWeights: [400, 600, 700],
        });

        if (validation.available) {
          findings.push({
            category: 'typography',
            userPreference: font,
            icpExpectation: 'Font availability confirmed',
            alignment: 'aligned',
            recommendation: `"${font}" is available on ${validation.source}`,
          });
        } else {
          const altNames = validation.alternatives
            .slice(0, 3)
            .map((a) => a.family)
            .join(', ');
          findings.push({
            category: 'typography',
            userPreference: font,
            icpExpectation: 'Font must be freely available',
            alignment: 'misaligned',
            recommendation: `"${font}" is not available as a free font. Alternatives: ${altNames}`,
          });
        }
      }
    }

    return findings;
  }

  private async evaluateDirection(
    input: DesignIntakeInput,
    prdContext: string,
    icpData: string | undefined,
    brandProfile: BrandProfile | undefined,
    competitive: CompetitiveLandscape | undefined,
    findings: DesignDirectionFinding[],
  ): Promise<DesignDirectionAssessment> {
    // Build context for the evaluator LLM call
    const contextParts: string[] = [];

    if (prdContext) contextParts.push(`PRD Context:\n${prdContext.slice(0, 2000)}`);
    if (icpData) contextParts.push(`ICP Data:\n${icpData.slice(0, 1500)}`);
    if (brandProfile)
      contextParts.push(
        `Brand Profile:\n- Name: ${brandProfile.name}\n- Primary: ${brandProfile.colors.primary.hex}\n- Voice: ${brandProfile.voice?.personality?.join(', ') ?? 'not defined'}`,
      );
    if (competitive)
      contextParts.push(
        `Competitive Landscape:\n- Common: ${competitive.commonPatterns.join(', ')}\n- Gaps: ${competitive.gaps.join(', ')}`,
      );

    // Build comprehensive user preferences section
    const userPrefs: string[] = [];

    // Visual preferences
    if (input.colorPreferences?.liked) userPrefs.push(`Colors liked: ${input.colorPreferences.liked.join(', ')}`);
    if (input.colorPreferences?.disliked) userPrefs.push(`Colors disliked: ${input.colorPreferences.disliked.join(', ')}`);
    if (input.colorPreferences?.semanticRequirements) {
      const sem = input.colorPreferences.semanticRequirements;
      const parts = [sem.success && `success=${sem.success}`, sem.warning && `warning=${sem.warning}`, sem.error && `error=${sem.error}`, sem.info && `info=${sem.info}`].filter(Boolean);
      if (parts.length > 0) userPrefs.push(`Semantic colors: ${parts.join(', ')}`);
    }
    if (input.fontPreferences?.liked) userPrefs.push(`Fonts liked: ${input.fontPreferences.liked.join(', ')}`);
    if (input.fontPreferences?.disliked) userPrefs.push(`Fonts disliked: ${input.fontPreferences.disliked.join(', ')}`);

    // Layout & structure
    if (input.structuralPreferences) userPrefs.push(`Layout: ${input.structuralPreferences.join(', ')}`);
    if (input.navigationPattern && input.navigationPattern !== 'no-preference') userPrefs.push(`Navigation: ${input.navigationPattern}`);
    if (input.contentDensity) userPrefs.push(`Content density: ${input.contentDensity}`);

    // Mood & aesthetic
    if (input.brandPersonality?.length) userPrefs.push(`Brand personality: ${input.brandPersonality.join(', ')}`);
    if (input.moodKeywords?.length) userPrefs.push(`Mood: ${input.moodKeywords.join(', ')}`);
    if (input.aestheticDirection && input.aestheticDirection !== 'no-preference') userPrefs.push(`Aesthetic: ${input.aestheticDirection}`);

    // Interaction & motion
    if (input.animationPreference && input.animationPreference !== 'no-preference') userPrefs.push(`Animation: ${input.animationPreference}`);
    if (input.interactionDensity) userPrefs.push(`Interaction density: ${input.interactionDensity}`);

    // Components
    if (input.componentPreferences) {
      const cp = input.componentPreferences;
      const parts = [
        cp.cardStyle && cp.cardStyle !== 'no-preference' ? `cards=${cp.cardStyle}` : null,
        cp.formStyle && cp.formStyle !== 'no-preference' ? `forms=${cp.formStyle}` : null,
        cp.buttonStyle && cp.buttonStyle !== 'no-preference' ? `buttons=${cp.buttonStyle}` : null,
        cp.modalPreference && cp.modalPreference !== 'no-preference' ? `overlays=${cp.modalPreference}` : null,
      ].filter(Boolean);
      if (parts.length > 0) userPrefs.push(`Components: ${parts.join(', ')}`);
    }
    if (input.iconStyle && input.iconStyle !== 'no-preference') userPrefs.push(`Icons: ${input.iconStyle}`);
    if (input.imageryStyle && input.imageryStyle !== 'no-preference') userPrefs.push(`Imagery: ${input.imageryStyle}`);

    // Platform & device
    if (input.primaryPlatform) userPrefs.push(`Platform: ${input.primaryPlatform}`);
    if (input.devicePriority && input.devicePriority !== 'no-preference') userPrefs.push(`Device priority: ${input.devicePriority}`);
    if (input.designSystemFramework && input.designSystemFramework !== 'no-preference') userPrefs.push(`Design system: ${input.designSystemFramework}`);

    // Accessibility
    if (input.wcagTarget && input.wcagTarget !== 'no-preference') userPrefs.push(`WCAG target: ${input.wcagTarget}`);
    if (input.accessibilityRequirements?.length) userPrefs.push(`A11y requirements: ${input.accessibilityRequirements.join(', ')}`);

    // Competitor qualitative
    if (input.competitorLikes?.length) userPrefs.push(`Competitor likes: ${input.competitorLikes.join('; ')}`);
    if (input.competitorDislikes?.length) userPrefs.push(`Competitor dislikes: ${input.competitorDislikes.join('; ')}`);

    // Screen inventory
    if (input.keyScreens?.length) userPrefs.push(`Key screens: ${input.keyScreens.join(', ')}`);
    if (input.criticalFlows?.length) userPrefs.push(`Critical flows: ${input.criticalFlows.join('; ')}`);
    if (input.priorityScreens?.length) userPrefs.push(`Priority screens: ${input.priorityScreens.join(', ')}`);

    if (input.additionalContext) userPrefs.push(`Context: ${input.additionalContext}`);

    if (userPrefs.length > 0) contextParts.push(`User Preferences:\n${userPrefs.join('\n')}`);

    const instructions = `You are the Design Direction Evaluator — a senior UX engineer versed in Google Material Design, Apple HIG, and Amazon design principles. Assess whether the user's design preferences align with their ICP, product goals, and platform conventions.

${contextParts.join('\n\n---\n\n')}

EVALUATE:
1. Do the user's color/font/style preferences match what their ICP would expect?
2. Do the structural and navigation preferences suit the product type?
3. Does the mood/aesthetic direction align with brand personality and ICP?
4. Are the animation and interaction density choices appropriate for the platform and audience?
5. Do the component style preferences create a coherent visual language?
6. Does the platform target require specific design conventions (Material Design for Android, HIG for iOS)?
7. Are the accessibility requirements achievable with the chosen visual direction?
8. Are there conflicts between what the user wants and what would work?
9. What competitive differentiators can we exploit visually?
10. Is the screen inventory sufficient for design scope estimation?

RESPOND with:
- Alignment score (0-100)
- Verdict: "proceed" (70-100), "proceed_with_adjustments" (40-69), or "reconsider" (0-39)
- Rationale for the verdict
- Color direction (primary hex if determinable, palette direction, semantic colors, colors to avoid)
- Typography direction (heading/body style, specific fonts if determinable)
- Layout direction (patterns to use, navigation approach, content density rationale, patterns to avoid)
- Mood direction (aesthetic rationale, personality alignment)
- Interaction direction (animation level rationale, interaction density rationale)
- Component direction (card/form/button/modal style rationale, icon and imagery approach)
- Platform direction (platform conventions to follow, device priority rationale, framework recommendations)
- Accessibility direction (WCAG compliance plan, specific requirements to enforce)
- Screen inventory assessment (completeness, missing screens, flow gaps)
- Competitive differentiators
- Any open questions`;

    const text = await this.execute(
      ['skills/design/rc-brand-system.md'],
      instructions,
      'Evaluate design direction alignment with ICP and product goals.',
    );

    // Parse LLM response into structured assessment
    return this.parseAssessment(text, input, competitive, findings);
  }

  // ── Parsing ───────────────────────────────────────────────────────────

  private parseCompetitiveLandscape(
    text: string,
    competitorCount: number,
  ): CompetitiveLandscape {
    // Extract structured data from LLM response
    // In production, use structured output or JSON mode
    return {
      competitorsAnalyzed: competitorCount,
      commonPatterns: this.extractListFromText(text, 'common pattern'),
      gaps: this.extractListFromText(text, 'gap'),
      differentiators: this.extractListFromText(text, 'differentiator'),
      overusedPatterns: this.extractListFromText(text, 'overused'),
      visualPositioning: this.extractSectionFromText(text, 'positioning') ?? 'See detailed analysis above',
    };
  }

  private parseAssessment(
    text: string,
    input: DesignIntakeInput,
    competitive: CompetitiveLandscape | undefined,
    findings: DesignDirectionFinding[],
  ): DesignDirectionAssessment {
    // Parse alignment score
    const scoreMatch = text.match(/(?:alignment|score).*?(\d{1,3})/i);
    const alignmentScore = scoreMatch ? Math.min(parseInt(scoreMatch[1], 10), 100) : 50;

    // Parse verdict — check if LLM explicitly provided one, otherwise use thresholds
    let verdict: DesignDirectionAssessment['verdict'] = 'proceed_with_adjustments';
    const explicitVerdict = text.match(/\b(proceed|proceed_with_adjustments|reconsider)\b/i)?.[1]?.toLowerCase();
    if (explicitVerdict === 'proceed' || explicitVerdict === 'proceed_with_adjustments' || explicitVerdict === 'reconsider') {
      verdict = explicitVerdict as DesignDirectionAssessment['verdict'];
    } else {
      // Configurable thresholds (can be overridden via env)
      const proceedThreshold = parseInt(process.env.RC_VERDICT_PROCEED_THRESHOLD ?? '70', 10);
      const reconsiderThreshold = parseInt(process.env.RC_VERDICT_RECONSIDER_THRESHOLD ?? '40', 10);
      if (alignmentScore >= proceedThreshold) verdict = 'proceed';
      else if (alignmentScore < reconsiderThreshold) verdict = 'reconsider';
    }

    // Override: if critical misalignments exist in accessibility or platform, force adjustments
    const hasCriticalMisalignment = findings.some(
      f => f.alignment === 'misaligned' && (f.category === 'accessibility' || f.category === 'platform'),
    );
    if (hasCriticalMisalignment && verdict === 'proceed') {
      verdict = 'proceed_with_adjustments';
    }

    // Parse constraints — comprehensive extraction
    const extractedConstraints: ExtractedDesignConstraints = {
      colorDirection: {
        primary: input.colorPreferences?.liked?.[0],
        palette: input.colorPreferences?.liked,
        avoid: input.colorPreferences?.disliked,
        semanticColors: input.colorPreferences?.semanticRequirements,
        rationale: this.extractSectionFromText(text, 'color') ?? 'See analysis',
      },
      typographyDirection: {
        pairingSuggestions: this.extractListFromText(text, 'font'),
        rationale: this.extractSectionFromText(text, 'typography') ?? 'See analysis',
      },
      layoutDirection: {
        patterns: input.structuralPreferences ?? [],
        avoidPatterns: this.extractListFromText(text, 'avoid'),
        navigationPattern: input.navigationPattern !== 'no-preference' ? input.navigationPattern : undefined,
        contentDensity: input.contentDensity,
        rationale: this.extractSectionFromText(text, 'layout') ?? 'See analysis',
      },
      moodDirection: {
        keywords: [...(input.moodKeywords ?? []), ...(input.brandPersonality ?? [])],
        aesthetic: input.aestheticDirection !== 'no-preference' ? input.aestheticDirection : undefined,
        rationale: this.extractSectionFromText(text, 'mood') ?? this.extractSectionFromText(text, 'aesthetic') ?? 'See analysis',
      },
      interactionDirection: {
        animationLevel: input.animationPreference !== 'no-preference' ? input.animationPreference : undefined,
        interactionDensity: input.interactionDensity,
        rationale: this.extractSectionFromText(text, 'interaction') ?? this.extractSectionFromText(text, 'animation') ?? 'See analysis',
      },
      componentDirection: {
        cardStyle: input.componentPreferences?.cardStyle !== 'no-preference' ? input.componentPreferences?.cardStyle : undefined,
        formStyle: input.componentPreferences?.formStyle !== 'no-preference' ? input.componentPreferences?.formStyle : undefined,
        buttonStyle: input.componentPreferences?.buttonStyle !== 'no-preference' ? input.componentPreferences?.buttonStyle : undefined,
        modalPreference: input.componentPreferences?.modalPreference !== 'no-preference' ? input.componentPreferences?.modalPreference : undefined,
        iconStyle: input.iconStyle !== 'no-preference' ? input.iconStyle : undefined,
        imageryStyle: input.imageryStyle !== 'no-preference' ? input.imageryStyle : undefined,
        rationale: this.extractSectionFromText(text, 'component') ?? 'See analysis',
      },
      platformDirection: {
        primaryPlatform: input.primaryPlatform,
        devicePriority: input.devicePriority !== 'no-preference' ? input.devicePriority : undefined,
        designSystemFramework: input.designSystemFramework !== 'no-preference' ? input.designSystemFramework : undefined,
        rationale: this.extractSectionFromText(text, 'platform') ?? 'See analysis',
      },
      accessibilityDirection: {
        wcagTarget: input.wcagTarget !== 'no-preference' ? input.wcagTarget : undefined,
        requirements: input.accessibilityRequirements ?? [],
        rationale: this.extractSectionFromText(text, 'accessibility') ?? 'See analysis',
      },
      screenInventory: {
        keyScreens: input.keyScreens ?? [],
        criticalFlows: input.criticalFlows ?? [],
        priorityScreens: input.priorityScreens ?? [],
      },
      competitiveDifferentiators: competitive?.gaps ?? [],
      competitorInsights: {
        likes: input.competitorLikes ?? [],
        dislikes: input.competitorDislikes ?? [],
      },
    };

    const prefsProvided: string[] = [];
    if (input.colorPreferences) prefsProvided.push('colors');
    if (input.fontPreferences) prefsProvided.push('fonts');
    if (input.structuralPreferences) prefsProvided.push('layout');
    if (input.moodKeywords?.length || input.aestheticDirection) prefsProvided.push('mood');
    if (input.brandPersonality?.length) prefsProvided.push('brand-personality');
    if (input.animationPreference || input.interactionDensity) prefsProvided.push('interaction');
    if (input.componentPreferences || input.iconStyle || input.imageryStyle) prefsProvided.push('components');
    if (input.primaryPlatform || input.devicePriority) prefsProvided.push('platform');
    if (input.wcagTarget || input.accessibilityRequirements?.length) prefsProvided.push('accessibility');
    if (input.keyScreens?.length || input.criticalFlows?.length) prefsProvided.push('screen-inventory');
    if (input.competitorLikes?.length || input.competitorDislikes?.length) prefsProvided.push('competitor-insights');
    if (input.referenceUrls?.length) prefsProvided.push('references');
    if (input.additionalContext) prefsProvided.push('context');

    return {
      inputSummary: {
        competitorsAnalyzed: competitive?.competitorsAnalyzed ?? 0,
        referencesAnalyzed: input.referenceUrls?.length ?? 0,
        userPreferencesProvided: prefsProvided,
      },
      competitiveLandscape: competitive,
      alignmentScore,
      verdict,
      verdictRationale: text.slice(0, 500),
      findings,
      extractedConstraints,
      openQuestions: this.extractListFromText(text, 'question'),
    };
  }

  // ── Formatting ────────────────────────────────────────────────────────

  private formatAssessment(
    assessment: DesignDirectionAssessment,
    isAutonomous: boolean,
  ): string {
    const lines: string[] = [];
    lines.push('# Design Direction Assessment');
    lines.push('');

    if (isAutonomous) {
      lines.push('*Mode: Autonomous (analyzed from PRD/ICP data)*');
      lines.push('');
    }

    // Verdict
    const verdictIcon =
      assessment.verdict === 'proceed'
        ? 'PROCEED'
        : assessment.verdict === 'proceed_with_adjustments'
          ? 'PROCEED WITH ADJUSTMENTS'
          : 'RECONSIDER';
    lines.push(`## Verdict: ${verdictIcon}`);
    lines.push(`**Alignment Score:** ${assessment.alignmentScore}/100`);
    lines.push('');
    lines.push(assessment.verdictRationale);
    lines.push('');

    // Competitive landscape
    if (assessment.competitiveLandscape) {
      const cl = assessment.competitiveLandscape;
      lines.push('## Competitive Landscape');
      lines.push(`Analyzed ${cl.competitorsAnalyzed} competitor(s).`);
      lines.push('');
      if (cl.commonPatterns.length > 0) {
        lines.push('**Common patterns:** ' + cl.commonPatterns.join(', '));
      }
      if (cl.gaps.length > 0) {
        lines.push('**Gaps to exploit:** ' + cl.gaps.join(', '));
      }
      if (cl.overusedPatterns.length > 0) {
        lines.push('**Overused (avoid):** ' + cl.overusedPatterns.join(', '));
      }
      lines.push('');
    }

    // Findings
    if (assessment.findings.length > 0) {
      lines.push('## Detailed Findings');
      for (const f of assessment.findings) {
        const alignIcon =
          f.alignment === 'aligned' ? '[OK]' : f.alignment === 'misaligned' ? '[!!]' : '[--]';
        lines.push(`- ${alignIcon} **${f.category}**: ${f.userPreference}`);
        lines.push(`  ${f.recommendation}`);
      }
      lines.push('');
    }

    // Extracted constraints — comprehensive
    const ec = assessment.extractedConstraints;
    lines.push('## Design Constraints (for Design Agent)');
    lines.push('');

    lines.push('### Visual Direction');
    lines.push(`**Color:** ${ec.colorDirection.rationale}`);
    if (ec.colorDirection.palette?.length) lines.push(`  Palette: ${ec.colorDirection.palette.join(', ')}`);
    if (ec.colorDirection.avoid?.length) lines.push(`  Avoid: ${ec.colorDirection.avoid.join(', ')}`);
    lines.push(`**Typography:** ${ec.typographyDirection.rationale}`);
    if (ec.typographyDirection.pairingSuggestions.length > 0) lines.push(`  Pairings: ${ec.typographyDirection.pairingSuggestions.join(', ')}`);
    lines.push('');

    lines.push('### Layout & Structure');
    lines.push(`**Layout:** ${ec.layoutDirection.rationale}`);
    if (ec.layoutDirection.navigationPattern) lines.push(`  Navigation: ${ec.layoutDirection.navigationPattern}`);
    if (ec.layoutDirection.contentDensity) lines.push(`  Density: ${ec.layoutDirection.contentDensity}`);
    lines.push('');

    lines.push('### Mood & Aesthetic');
    lines.push(`**Mood:** ${ec.moodDirection.rationale}`);
    if (ec.moodDirection.keywords.length > 0) lines.push(`  Keywords: ${ec.moodDirection.keywords.join(', ')}`);
    if (ec.moodDirection.aesthetic) lines.push(`  Aesthetic: ${ec.moodDirection.aesthetic}`);
    lines.push('');

    lines.push('### Interaction & Motion');
    lines.push(`**Interaction:** ${ec.interactionDirection.rationale}`);
    if (ec.interactionDirection.animationLevel) lines.push(`  Animation: ${ec.interactionDirection.animationLevel}`);
    if (ec.interactionDirection.interactionDensity) lines.push(`  Density: ${ec.interactionDirection.interactionDensity}`);
    lines.push('');

    lines.push('### Component Styles');
    lines.push(`**Components:** ${ec.componentDirection.rationale}`);
    const componentDetails = [
      ec.componentDirection.cardStyle && `Cards: ${ec.componentDirection.cardStyle}`,
      ec.componentDirection.formStyle && `Forms: ${ec.componentDirection.formStyle}`,
      ec.componentDirection.buttonStyle && `Buttons: ${ec.componentDirection.buttonStyle}`,
      ec.componentDirection.modalPreference && `Overlays: ${ec.componentDirection.modalPreference}`,
      ec.componentDirection.iconStyle && `Icons: ${ec.componentDirection.iconStyle}`,
      ec.componentDirection.imageryStyle && `Imagery: ${ec.componentDirection.imageryStyle}`,
    ].filter(Boolean);
    if (componentDetails.length > 0) lines.push(`  ${componentDetails.join(' | ')}`);
    lines.push('');

    lines.push('### Platform & Device');
    lines.push(`**Platform:** ${ec.platformDirection.rationale}`);
    if (ec.platformDirection.primaryPlatform) lines.push(`  Target: ${ec.platformDirection.primaryPlatform}`);
    if (ec.platformDirection.devicePriority) lines.push(`  Device priority: ${ec.platformDirection.devicePriority}`);
    if (ec.platformDirection.designSystemFramework) lines.push(`  Framework: ${ec.platformDirection.designSystemFramework}`);
    lines.push('');

    lines.push('### Accessibility');
    lines.push(`**A11y:** ${ec.accessibilityDirection.rationale}`);
    if (ec.accessibilityDirection.wcagTarget) lines.push(`  Target: WCAG ${ec.accessibilityDirection.wcagTarget}`);
    if (ec.accessibilityDirection.requirements.length > 0) lines.push(`  Requirements: ${ec.accessibilityDirection.requirements.join(', ')}`);
    lines.push('');

    if (ec.screenInventory.keyScreens.length > 0) {
      lines.push('### Screen Inventory');
      lines.push(`**Key screens (${ec.screenInventory.keyScreens.length}):** ${ec.screenInventory.keyScreens.join(', ')}`);
      if (ec.screenInventory.criticalFlows.length > 0) lines.push(`**Critical flows:** ${ec.screenInventory.criticalFlows.join('; ')}`);
      if (ec.screenInventory.priorityScreens.length > 0) lines.push(`**Priority screens:** ${ec.screenInventory.priorityScreens.join(', ')}`);
      lines.push('');
    }

    if (ec.competitiveDifferentiators.length > 0) {
      lines.push(`**Differentiators:** ${ec.competitiveDifferentiators.join(', ')}`);
    }
    if (ec.competitorInsights.likes.length > 0) {
      lines.push(`**Competitor likes:** ${ec.competitorInsights.likes.join('; ')}`);
    }
    if (ec.competitorInsights.dislikes.length > 0) {
      lines.push(`**Competitor dislikes:** ${ec.competitorInsights.dislikes.join('; ')}`);
    }
    lines.push('');

    // Open questions
    if (assessment.openQuestions.length > 0) {
      lines.push('## Open Questions');
      for (const q of assessment.openQuestions) {
        lines.push(`- ${q}`);
      }
    }

    return lines.join('\n');
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  private mapDescriptionToMood(
    description: string,
  ): 'professional' | 'playful' | 'luxurious' | 'technical' | 'warm' | 'bold' | 'minimal' | null {
    const desc = description.toLowerCase();
    if (desc.includes('editorial') || desc.includes('luxury') || desc.includes('premium'))
      return 'luxurious';
    if (desc.includes('playful') || desc.includes('fun') || desc.includes('friendly'))
      return 'playful';
    if (desc.includes('technical') || desc.includes('developer') || desc.includes('code'))
      return 'technical';
    if (desc.includes('bold') || desc.includes('brutalist') || desc.includes('strong'))
      return 'bold';
    if (desc.includes('warm') || desc.includes('cozy') || desc.includes('inviting'))
      return 'warm';
    if (desc.includes('minimal') || desc.includes('clean') || desc.includes('simple'))
      return 'minimal';
    if (desc.includes('professional') || desc.includes('corporate') || desc.includes('enterprise'))
      return 'professional';
    return null;
  }

  private extractListFromText(text: string, keyword: string): string[] {
    const lines = text.split('\n');
    const items: string[] = [];

    for (const line of lines) {
      if (line.toLowerCase().includes(keyword) && (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))) {
        const cleaned = line.replace(/^[-*\d.)\s]+/, '').trim();
        if (cleaned.length > 3) items.push(cleaned);
      }
    }

    return items.slice(0, 10);
  }

  private extractSectionFromText(text: string, keyword: string): string | null {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(keyword)) {
        // Return the next non-empty line as the value
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const content = lines[j].replace(/^[#*-\s]+/, '').trim();
          if (content.length > 10 && !content.toLowerCase().startsWith(keyword)) {
            return content;
          }
        }
        return lines[i].replace(/^[#*-\s]+/, '').trim();
      }
    }
    return null;
  }

  /** Required by BaseAgent */
  async run(): Promise<AgentResult> {
    return {
      text: 'DesignIntakeAgent requires calling analyze() or analyzeAutonomous() directly.',
    };
  }
}
