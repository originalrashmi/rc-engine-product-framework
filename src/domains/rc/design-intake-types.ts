import { z } from 'zod';

// ── Design Intake Input ─────────────────────────────────────────────────────

export const DesignIntakeInputSchema = z.object({
  projectPath: z.string().describe('Project root'),
  competitorUrls: z
    .array(z.string())
    .optional()
    .describe('URLs of competitor products or sites to analyze'),
  referenceUrls: z
    .array(z.string())
    .optional()
    .describe('Design inspiration: Dribbble, Behance, live sites'),
  colorPreferences: z
    .object({
      liked: z.array(z.string()).optional().describe('Colors or palettes the user likes'),
      disliked: z.array(z.string()).optional().describe('Colors to avoid'),
    })
    .optional(),
  fontPreferences: z
    .object({
      liked: z.array(z.string()).optional().describe('Specific fonts or styles'),
      disliked: z.array(z.string()).optional().describe('Fonts or styles to avoid'),
    })
    .optional(),
  structuralPreferences: z
    .array(z.string())
    .optional()
    .describe('Layout preferences: "single-page app", "dashboard-heavy"'),
  additionalContext: z.string().optional().describe('Any other visual direction context'),
  mode: z
    .enum(['guided', 'autonomous'])
    .default('guided')
    .describe('guided = prompt user; autonomous = analyze from PRD/ICP only'),
});

export type DesignIntakeInput = z.infer<typeof DesignIntakeInputSchema>;

// ── Competitive Landscape ───────────────────────────────────────────────────

export interface CompetitiveLandscape {
  competitorsAnalyzed: number;
  commonPatterns: string[];
  gaps: string[];
  differentiators: string[];
  overusedPatterns: string[];
  visualPositioning: string;
}

// ── Design Direction Finding ────────────────────────────────────────────────

export interface DesignDirectionFinding {
  category: 'color' | 'typography' | 'layout' | 'style' | 'competitive';
  userPreference: string;
  icpExpectation: string;
  alignment: 'aligned' | 'neutral' | 'misaligned';
  recommendation: string;
}

// ── Extracted Constraints ───────────────────────────────────────────────────

export interface ExtractedDesignConstraints {
  colorDirection: {
    primary?: string;
    palette?: string[];
    avoid?: string[];
    rationale: string;
  };
  typographyDirection: {
    headingStyle?: string;
    bodyStyle?: string;
    pairingSuggestions: string[];
    rationale: string;
  };
  layoutDirection: {
    patterns: string[];
    avoidPatterns: string[];
    rationale: string;
  };
  competitiveDifferentiators: string[];
}

// ── Design Direction Assessment ─────────────────────────────────────────────

export type DesignVerdict = 'proceed' | 'proceed_with_adjustments' | 'reconsider';

export interface DesignDirectionAssessment {
  inputSummary: {
    competitorsAnalyzed: number;
    referencesAnalyzed: number;
    userPreferencesProvided: string[];
  };

  competitiveLandscape?: CompetitiveLandscape;

  alignmentScore: number; // 0-100
  verdict: DesignVerdict;
  verdictRationale: string;

  findings: DesignDirectionFinding[];
  extractedConstraints: ExtractedDesignConstraints;
  openQuestions: string[];
}

// ── Competitor Analysis Result ──────────────────────────────────────────────

export interface CompetitorAnalysisResult {
  url: string;
  extractedColors: string[];
  extractedFonts: string[];
  layoutPattern: string;
  ctaStyle: string;
  strengths: string[];
  weaknesses: string[];
}

// ── Reference Analysis Result ───────────────────────────────────────────────

export interface ReferenceAnalysisResult {
  url: string;
  visualLanguage: string;
  emotionalTone: string;
  patterns: string[];
  icpMatchScore: number; // 0-100
  icpMatchRationale: string;
}
