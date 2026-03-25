import { z } from 'zod';

// ── Design Intake Input ─────────────────────────────────────────────────────

export const DesignIntakeInputSchema = z.object({
  projectPath: z.string().describe('Project root'),

  // ── Brand Identity ────────────────────────────────────────────────────────
  brandGuidelinesUrl: z.string().optional().describe('URL or path to existing brand guidelines document'),
  brandPersonality: z
    .array(z.string())
    .optional()
    .describe(
      '3-5 brand personality traits: "professional", "playful", "luxurious", "bold", "technical", "warm", "minimal"',
    ),
  existingLogoPath: z.string().optional().describe('Path to existing logo file for context'),

  // ── Color Preferences ─────────────────────────────────────────────────────
  colorPreferences: z
    .object({
      liked: z.array(z.string()).optional().describe('Colors or palettes the user likes (hex or names)'),
      disliked: z.array(z.string()).optional().describe('Colors to avoid'),
      semanticRequirements: z
        .object({
          success: z.string().optional(),
          warning: z.string().optional(),
          error: z.string().optional(),
          info: z.string().optional(),
        })
        .optional()
        .describe('Required semantic colors for the product'),
    })
    .optional(),

  // ── Typography Preferences ────────────────────────────────────────────────
  fontPreferences: z
    .object({
      liked: z.array(z.string()).optional().describe('Specific fonts or style descriptions like "editorial serif"'),
      disliked: z.array(z.string()).optional().describe('Fonts or styles to avoid'),
    })
    .optional(),

  // ── Layout & Structure ────────────────────────────────────────────────────
  structuralPreferences: z
    .array(z.string())
    .optional()
    .describe('Layout preferences: "sidebar navigation", "card grid", "single-page app", "dashboard-heavy"'),
  navigationPattern: z
    .enum(['top-nav', 'sidebar', 'bottom-tabs', 'hamburger', 'hybrid', 'no-preference'])
    .optional()
    .describe('Primary navigation pattern preference'),
  contentDensity: z
    .enum(['minimal', 'balanced', 'dense'])
    .optional()
    .describe('Content density: minimal (Apple-like), balanced, dense (Amazon-like)'),

  // ── Mood & Aesthetic ──────────────────────────────────────────────────────
  moodKeywords: z
    .array(z.string())
    .optional()
    .describe('Design mood: "clean and modern", "warm and approachable", "bold and energetic", "elegant and refined"'),
  aestheticDirection: z
    .enum(['minimal', 'bold', 'organic', 'geometric', 'editorial', 'playful', 'corporate', 'no-preference'])
    .optional()
    .describe('Overall aesthetic direction'),

  // ── Interaction & Motion ──────────────────────────────────────────────────
  animationPreference: z
    .enum(['none', 'subtle', 'moderate', 'expressive', 'no-preference'])
    .optional()
    .describe('Level of animation and micro-interactions'),
  interactionDensity: z
    .enum(['spacious', 'balanced', 'compact'])
    .optional()
    .describe('Spacious (consumer) vs compact (power user) interaction targets'),

  // ── Component & Pattern Preferences ───────────────────────────────────────
  componentPreferences: z
    .object({
      cardStyle: z.enum(['elevated', 'outlined', 'flat', 'no-preference']).optional(),
      formStyle: z.enum(['floating-label', 'outlined', 'filled', 'underlined', 'no-preference']).optional(),
      buttonStyle: z.enum(['rounded', 'pill', 'square', 'no-preference']).optional(),
      modalPreference: z.enum(['modal', 'inline', 'drawer', 'no-preference']).optional(),
    })
    .optional()
    .describe('UI component style preferences'),
  iconStyle: z
    .enum(['outlined', 'filled', 'duotone', 'hand-drawn', 'no-preference'])
    .optional()
    .describe('Icon style preference'),
  imageryStyle: z
    .enum(['photography', 'illustration', 'abstract', 'icons-only', 'mixed', 'no-preference'])
    .optional()
    .describe('Visual imagery approach'),

  // ── Platform & Device ─────────────────────────────────────────────────────
  primaryPlatform: z
    .enum(['web', 'ios', 'android', 'desktop', 'pwa', 'cross-platform'])
    .optional()
    .describe('Primary platform target'),
  devicePriority: z
    .enum(['mobile-first', 'desktop-first', 'responsive-parity', 'no-preference'])
    .optional()
    .describe('Device priority strategy'),
  designSystemFramework: z
    .enum(['tailwind', 'material-ui', 'chakra', 'ant-design', 'custom', 'none', 'no-preference'])
    .optional()
    .describe('Preferred design system or component framework'),

  // ── Accessibility ─────────────────────────────────────────────────────────
  wcagTarget: z.enum(['A', 'AA', 'AAA', 'no-preference']).optional().describe('WCAG compliance target level'),
  accessibilityRequirements: z
    .array(z.string())
    .optional()
    .describe('Specific a11y needs: "screen reader support", "reduced motion", "high contrast", "keyboard navigation"'),

  // ── Competitor Intelligence ───────────────────────────────────────────────
  competitorUrls: z.array(z.string()).optional().describe('URLs of competitor products or sites to analyze'),
  competitorLikes: z.array(z.string()).optional().describe('Specific things the user likes about competitor designs'),
  competitorDislikes: z
    .array(z.string())
    .optional()
    .describe('Specific things the user wants to differentiate from in competitor designs'),

  // ── Reference & Inspiration ───────────────────────────────────────────────
  referenceUrls: z.array(z.string()).optional().describe('Design inspiration: Dribbble, Behance, live sites'),

  // ── Screen Inventory (early capture) ──────────────────────────────────────
  keyScreens: z
    .array(z.string())
    .optional()
    .describe('Key screens/pages: "landing page", "dashboard", "settings", "onboarding"'),
  criticalFlows: z
    .array(z.string())
    .optional()
    .describe('Primary user journeys: "signup -> onboarding -> first value", "search -> compare -> purchase"'),
  priorityScreens: z.array(z.string()).optional().describe('Which screens matter most for design quality (top 3)'),

  // ── Freeform ──────────────────────────────────────────────────────────────
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
  category:
    | 'color'
    | 'typography'
    | 'layout'
    | 'style'
    | 'competitive'
    | 'interaction'
    | 'component'
    | 'platform'
    | 'accessibility'
    | 'mood'
    | 'screen-inventory';
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
    semanticColors?: { success?: string; warning?: string; error?: string; info?: string };
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
    navigationPattern?: string;
    contentDensity?: string;
    rationale: string;
  };
  moodDirection: {
    keywords: string[];
    aesthetic?: string;
    rationale: string;
  };
  interactionDirection: {
    animationLevel?: string;
    interactionDensity?: string;
    rationale: string;
  };
  componentDirection: {
    cardStyle?: string;
    formStyle?: string;
    buttonStyle?: string;
    modalPreference?: string;
    iconStyle?: string;
    imageryStyle?: string;
    rationale: string;
  };
  platformDirection: {
    primaryPlatform?: string;
    devicePriority?: string;
    designSystemFramework?: string;
    rationale: string;
  };
  accessibilityDirection: {
    wcagTarget?: string;
    requirements: string[];
    rationale: string;
  };
  screenInventory: {
    keyScreens: string[];
    criticalFlows: string[];
    priorityScreens: string[];
  };
  competitiveDifferentiators: string[];
  competitorInsights: {
    likes: string[];
    dislikes: string[];
  };
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
