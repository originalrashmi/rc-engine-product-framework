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
    const hasReferences = input.referenceUrls && input.referenceUrls.length > 0;
    const hasPreferences = input.colorPreferences || input.fontPreferences;
    const isAutonomous = input.mode === 'autonomous';

    // Phase 1: Analyze competitors (if provided)
    let competitiveLandscape: CompetitiveLandscape | undefined;
    if (hasCompetitors) {
      competitiveLandscape = await this.analyzeCompetitors(input.competitorUrls!);
    }

    // Phase 2: Analyze references and preferences
    let referenceFindings: DesignDirectionFinding[] = [];
    if (hasReferences || hasPreferences) {
      referenceFindings = await this.analyzeReferences(input, icpData);
    }

    // Phase 3: Validate font preferences
    let fontFindings: DesignDirectionFinding[] = [];
    if (input.fontPreferences?.liked) {
      fontFindings = await this.validateFontPreferences(input.fontPreferences.liked);
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
    const text = this.formatAssessment(assessment, isAutonomous);

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

    // Analyze color preferences against ICP
    if (input.colorPreferences?.liked) {
      for (const color of input.colorPreferences.liked) {
        findings.push({
          category: 'color',
          userPreference: color,
          icpExpectation: icpData
            ? 'Evaluated against ICP data'
            : 'No ICP data available for comparison',
          alignment: 'neutral', // Will be refined by evaluator
          recommendation: `Color preference "${color}" noted for design direction`,
        });
      }
    }

    // Analyze reference URLs
    if (input.referenceUrls) {
      for (const url of input.referenceUrls) {
        findings.push({
          category: 'style',
          userPreference: `Reference: ${url}`,
          icpExpectation: 'To be evaluated against ICP alignment',
          alignment: 'neutral',
          recommendation: `Reference design will be analyzed for visual patterns`,
        });
      }
    }

    // Analyze structural preferences
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

    const userPrefs: string[] = [];
    if (input.colorPreferences?.liked) userPrefs.push(`Colors liked: ${input.colorPreferences.liked.join(', ')}`);
    if (input.colorPreferences?.disliked) userPrefs.push(`Colors disliked: ${input.colorPreferences.disliked.join(', ')}`);
    if (input.fontPreferences?.liked) userPrefs.push(`Fonts liked: ${input.fontPreferences.liked.join(', ')}`);
    if (input.structuralPreferences) userPrefs.push(`Layout: ${input.structuralPreferences.join(', ')}`);
    if (input.additionalContext) userPrefs.push(`Context: ${input.additionalContext}`);

    if (userPrefs.length > 0) contextParts.push(`User Preferences:\n${userPrefs.join('\n')}`);

    const instructions = `You are the Design Direction Evaluator. Assess whether the user's design preferences align with their ICP and product goals.

${contextParts.join('\n\n---\n\n')}

EVALUATE:
1. Do the user's color/font/style preferences match what their ICP would expect?
2. Do the structural preferences suit the product type?
3. Are there conflicts between what the user wants and what would work?
4. What competitive differentiators can we exploit visually?

RESPOND with:
- Alignment score (0-100)
- Verdict: "proceed" (70-100), "proceed_with_adjustments" (40-69), or "reconsider" (0-39)
- Rationale for the verdict
- Specific color direction (primary hex if determinable, palette direction, colors to avoid)
- Typography direction (heading/body style, specific fonts if determinable)
- Layout direction (patterns to use, patterns to avoid)
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

    // Parse verdict
    let verdict: DesignDirectionAssessment['verdict'] = 'proceed_with_adjustments';
    if (alignmentScore >= 70) verdict = 'proceed';
    else if (alignmentScore < 40) verdict = 'reconsider';

    // Parse constraints
    const extractedConstraints: ExtractedDesignConstraints = {
      colorDirection: {
        rationale: this.extractSectionFromText(text, 'color') ?? 'See analysis',
      },
      typographyDirection: {
        pairingSuggestions: this.extractListFromText(text, 'font'),
        rationale: this.extractSectionFromText(text, 'typography') ?? 'See analysis',
      },
      layoutDirection: {
        patterns: input.structuralPreferences ?? [],
        avoidPatterns: this.extractListFromText(text, 'avoid'),
        rationale: this.extractSectionFromText(text, 'layout') ?? 'See analysis',
      },
      competitiveDifferentiators: competitive?.gaps ?? [],
    };

    const prefsProvided: string[] = [];
    if (input.colorPreferences) prefsProvided.push('colors');
    if (input.fontPreferences) prefsProvided.push('fonts');
    if (input.structuralPreferences) prefsProvided.push('layout');
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

    // Extracted constraints
    const ec = assessment.extractedConstraints;
    lines.push('## Design Constraints (for Design Agent)');
    lines.push(`**Color direction:** ${ec.colorDirection.rationale}`);
    lines.push(`**Typography direction:** ${ec.typographyDirection.rationale}`);
    lines.push(`**Layout direction:** ${ec.layoutDirection.rationale}`);
    if (ec.competitiveDifferentiators.length > 0) {
      lines.push(`**Differentiators:** ${ec.competitiveDifferentiators.join(', ')}`);
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
