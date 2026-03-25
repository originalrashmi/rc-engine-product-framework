import { z } from 'zod';

// ── VOC Phrase Bank ─────────────────────────────────────────────────────────

export const VocPhraseBankSchema = z.object({
  painPhrases: z.array(
    z.object({
      phrase: z.string(),
      source: z.string().optional(),
      frequency: z.number().optional().describe('How many times this phrase appeared'),
    }),
  ),
  outcomePhrases: z.array(
    z.object({
      phrase: z.string(),
      source: z.string().optional(),
      frequency: z.number().optional(),
    }),
  ),
  objectionPhrases: z.array(
    z.object({
      phrase: z.string(),
      source: z.string().optional(),
      frequency: z.number().optional(),
    }),
  ),
  decisionTriggers: z.array(
    z.object({
      phrase: z.string(),
      source: z.string().optional(),
      frequency: z.number().optional(),
    }),
  ),
});

export type VocPhraseBank = z.infer<typeof VocPhraseBankSchema>;

// ── Awareness Mapping ───────────────────────────────────────────────────────

export const AwarenessLevel = z.enum(['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware']);

export type AwarenessLevel = z.infer<typeof AwarenessLevel>;

export const AwarenessMapEntrySchema = z.object({
  screen: z.string(),
  level: AwarenessLevel,
  copyStrategy: z.string(),
  primaryTrafficSource: z.string().optional(),
});

export type AwarenessMapEntry = z.infer<typeof AwarenessMapEntrySchema>;

// ── JTBD ────────────────────────────────────────────────────────────────────

export const JtbdStatementSchema = z.object({
  situation: z.string().describe('When I am...'),
  motivation: z.string().describe('I want to...'),
  outcome: z.string().describe('So I can...'),
  dimension: z.enum(['functional', 'emotional', 'social']),
  priority: z.number().min(1).max(10).optional(),
});

export type JtbdStatement = z.infer<typeof JtbdStatementSchema>;

export const MessagingHierarchySchema = z.object({
  positioningStatement: z.string().describe('One sentence: primary job + emotional payoff'),
  primaryClaim: z.string().describe('Headline-level promise'),
  supportingClaims: z.array(z.string()).min(3).max(5),
  proofPoints: z.array(
    z.object({
      claim: z.string(),
      proof: z.string(),
      type: z.enum(['testimonial', 'metric', 'case_study', 'logo', 'certification']),
    }),
  ),
  riskReversal: z.string().describe('What removes the last objection'),
});

export type MessagingHierarchy = z.infer<typeof MessagingHierarchySchema>;

// ── Objection Mapping ───────────────────────────────────────────────────────

export const ObjectionMapEntrySchema = z.object({
  category: z.enum(['price', 'trust', 'timing', 'need', 'complexity', 'authority', 'switching']),
  icpPhrasing: z.string().describe('How the ICP states this objection'),
  copyCountermeasure: z.string(),
  placement: z.string().describe('Where on the page to address this'),
  priority: z.number().min(1).max(7).optional(),
});

export type ObjectionMapEntry = z.infer<typeof ObjectionMapEntrySchema>;

// ── Persuasion Framework ────────────────────────────────────────────────────

export const PersuasionFramework = z.enum(['AIDA', 'PAS', 'BAB', '4Ps', 'PASTOR']);
export type PersuasionFramework = z.infer<typeof PersuasionFramework>;

export const FrameworkSelectionSchema = z.object({
  primary: PersuasionFramework,
  primaryRationale: z.string(),
  secondary: PersuasionFramework.optional(),
  secondaryRationale: z.string().optional(),
});

export type FrameworkSelection = z.infer<typeof FrameworkSelectionSchema>;

// ── Competitive Copy Audit ──────────────────────────────────────────────────

export const CompetitorCopyAnalysisSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  headlinePromise: z.string(),
  proofType: z.string(),
  ctaText: z.string(),
  tone: z.string(),
  objectionsAddressed: z.array(z.string()),
  objectionsIgnored: z.array(z.string()),
  awarenessLevel: AwarenessLevel,
  weaknesses: z.array(z.string()),
});

export type CompetitorCopyAnalysis = z.infer<typeof CompetitorCopyAnalysisSchema>;

// ── Copy Research Brief (Phase 1 Output) ────────────────────────────────────

export const CopyResearchBriefSchema = z.object({
  projectName: z.string(),
  generatedAt: z.string(),

  vocPhraseBank: VocPhraseBankSchema,
  awarenessMap: z.array(AwarenessMapEntrySchema),
  jtbdStatements: z.array(JtbdStatementSchema),
  messagingHierarchy: MessagingHierarchySchema,
  objectionMap: z.array(ObjectionMapEntrySchema),
  competitiveCopyAudit: z.array(CompetitorCopyAnalysisSchema),
  frameworkSelection: FrameworkSelectionSchema,
});

export type CopyResearchBrief = z.infer<typeof CopyResearchBriefSchema>;

// ── Voice & Tone System ─────────────────────────────────────────────────────

export const VoiceToneSystemSchema = z.object({
  voiceAttributes: z.array(z.string()).min(3).max(5).describe('e.g. Confident, Clear, Warm'),
  nngroupDimensions: z.object({
    funny_serious: z.number().min(1).max(7),
    formal_casual: z.number().min(1).max(7),
    respectful_irreverent: z.number().min(1).max(7),
    enthusiastic_matter_of_fact: z.number().min(1).max(7),
  }),
  voiceChart: z.array(
    z.object({
      attribute: z.string(),
      doThis: z.string(),
      notThis: z.string(),
    }),
  ),
  voiceDonts: z.array(z.string()),
  toneAdaptations: z.array(
    z.object({
      context: z.string(),
      toneShift: z.string(),
      example: z.string(),
    }),
  ),
  vocabulary: z
    .object({
      preferred: z.record(z.string()).optional().describe('action → preferred word'),
      prohibited: z.array(z.string()).optional(),
    })
    .optional(),
});

export type VoiceToneSystem = z.infer<typeof VoiceToneSystemSchema>;

// ── Page Copy ───────────────────────────────────────────────────────────────

export const CopyVariantSchema = z.object({
  text: z.string(),
  hypothesis: z.string().optional().describe('What persuasion angle this tests'),
});

export const PageCopySchema = z.object({
  screen: z.string(),
  awarenessLevel: AwarenessLevel,
  framework: PersuasionFramework,
  primaryCtaGoal: z.string(),

  headline: z.object({
    primary: z.string(),
    variants: z.array(CopyVariantSchema).optional(),
  }),
  subheadline: z.string(),

  bodySections: z.array(
    z.object({
      frameworkStage: z.string(),
      copy: z.string(),
      supportingElement: z.string().optional(),
    }),
  ),

  cta: z.object({
    primary: z.string(),
    supportingCopy: z.string().optional(),
    variants: z.array(CopyVariantSchema).optional(),
  }),

  objectionsAddressed: z
    .array(
      z.object({
        objection: z.string(),
        countermeasure: z.string(),
        location: z.string(),
      }),
    )
    .optional(),

  seo: z
    .object({
      targetKeyword: z.string(),
      semanticKeywords: z.array(z.string()),
      metaTitle: z.string(),
      metaDescription: z.string(),
      schemaType: z.string().optional(),
    })
    .optional(),
});

export type PageCopy = z.infer<typeof PageCopySchema>;

// ── Microcopy Library ───────────────────────────────────────────────────────

export const MicrocopyLibrarySchema = z.object({
  navigation: z
    .object({
      navItems: z.array(z.string()).optional(),
      breadcrumbFormat: z.string().optional(),
      footerLinks: z.record(z.array(z.string())).optional(),
    })
    .optional(),

  forms: z
    .array(
      z.object({
        formName: z.string(),
        fields: z.array(
          z.object({
            name: z.string(),
            label: z.string(),
            placeholder: z.string().optional(),
            helpText: z.string().optional(),
            validation: z.record(z.string()).optional(),
          }),
        ),
        submitButton: z.string(),
        successMessage: z.string().optional(),
      }),
    )
    .optional(),

  emptyStates: z
    .array(
      z.object({
        context: z.string(),
        headline: z.string(),
        body: z.string(),
        cta: z.string().optional(),
      }),
    )
    .optional(),

  errorStates: z
    .object({
      global: z.record(
        z.object({
          headline: z.string(),
          body: z.string(),
          cta: z.string().optional(),
        }),
      ),
      contextual: z.record(z.string()).optional(),
    })
    .optional(),

  successStates: z
    .object({
      toasts: z.record(z.string()).optional(),
      pages: z
        .array(
          z.object({
            action: z.string(),
            headline: z.string(),
            nextStep: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),

  loadingStates: z
    .array(
      z.object({
        context: z.string(),
        message: z.string(),
      }),
    )
    .optional(),

  tooltips: z.record(z.string()).optional(),

  onboarding: z
    .object({
      welcome: z.string(),
      steps: z.array(z.string()),
      completion: z.string(),
    })
    .optional(),

  confirmations: z
    .array(
      z.object({
        action: z.string(),
        headline: z.string(),
        body: z.string(),
        confirmButton: z.string(),
        cancelButton: z.string(),
      }),
    )
    .optional(),
});

export type MicrocopyLibrary = z.infer<typeof MicrocopyLibrarySchema>;

// ── CTA Matrix ──────────────────────────────────────────────────────────────

export const CtaEntrySchema = z.object({
  screen: z.string(),
  primaryCta: z.string(),
  foggPromptType: z.enum(['spark', 'facilitator', 'signal']),
  awarenessLevel: AwarenessLevel,
  cialdiniLever: z.string().optional(),
  variants: z.array(CopyVariantSchema).optional(),
});

export type CtaEntry = z.infer<typeof CtaEntrySchema>;

// ── SEO Content Map ─────────────────────────────────────────────────────────

export const SeoPageEntrySchema = z.object({
  page: z.string(),
  primaryKeyword: z.string(),
  searchIntent: z.enum(['informational', 'navigational', 'commercial', 'transactional']),
  semanticKeywords: z.array(z.string()),
  h1: z.string(),
  h2s: z.array(z.string()),
  metaTitle: z.string(),
  metaDescription: z.string(),
  schemaType: z.string().optional(),
  internalLinks: z
    .array(
      z.object({
        anchorText: z.string(),
        destination: z.string(),
      }),
    )
    .optional(),
});

export type SeoPageEntry = z.infer<typeof SeoPageEntrySchema>;

// ── Content Strategy & Copy System (Phase 2 Output) ─────────────────────────

export const CopySystemSchema = z.object({
  projectName: z.string(),
  generatedAt: z.string(),

  voiceTone: VoiceToneSystemSchema,
  messagingHierarchy: MessagingHierarchySchema,
  pageCopy: z.array(PageCopySchema),
  microcopyLibrary: MicrocopyLibrarySchema,
  ctaMatrix: z.array(CtaEntrySchema),
  seoContentMap: z.array(SeoPageEntrySchema),
});

export type CopySystem = z.infer<typeof CopySystemSchema>;

// ── Copy Critique Result ────────────────────────────────────────────────────

/**
 * Copy critique score weights - used to compute the weightedTotal.
 * Sum to 1.0. Aligned with rc-copy-critique.md heuristics.
 */
export const COPY_CRITIQUE_WEIGHTS: Record<keyof CopyCritiqueScore, number> = {
  clarity: 0.3, // Highest: unclear copy = 0 conversions
  persuasionFramework: 0.2, // Framework adherence (AIDA, PAS, BAB)
  voiceTone: 0.15, // Brand voice consistency
  specificity: 0.15, // Concrete vs vague claims
  microcopy: 0.1, // Error states, labels, tooltips
  behavioralDesign: 0.05, // Nudges, defaults, loss aversion
  seo: 0.05, // On-page keyword alignment
};

/**
 * Compute the weighted total from individual scores.
 * Returns a number between 1 and 5.
 */
export function computeWeightedTotal(scores: CopyCritiqueScore): number {
  let total = 0;
  for (const [key, weight] of Object.entries(COPY_CRITIQUE_WEIGHTS)) {
    total += scores[key as keyof CopyCritiqueScore] * weight;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Derive verdict from weighted total.
 * >= 4.0 = ship, >= 2.5 = revise, < 2.5 = rewrite
 */
export function deriveVerdict(weightedTotal: number): 'ship' | 'revise' | 'rewrite' {
  if (weightedTotal >= 4.0) return 'ship';
  if (weightedTotal >= 2.5) return 'revise';
  return 'rewrite';
}

export const CopyCritiqueScoreSchema = z.object({
  clarity: z.number().min(1).max(5),
  persuasionFramework: z.number().min(1).max(5),
  behavioralDesign: z.number().min(1).max(5),
  voiceTone: z.number().min(1).max(5),
  microcopy: z.number().min(1).max(5),
  specificity: z.number().min(1).max(5),
  seo: z.number().min(1).max(5),
});

export type CopyCritiqueScore = z.infer<typeof CopyCritiqueScoreSchema>;

export interface CopyCritiqueResult {
  screen: string;
  scores: CopyCritiqueScore;
  weightedTotal: number; // 1-5, computed via COPY_CRITIQUE_WEIGHTS
  verdict: 'ship' | 'revise' | 'rewrite';
  strengths: string[];
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    issue: string;
    fix: string;
  }>;
  revisionActions: string[];
}

// ── Copy Generation Input ───────────────────────────────────────────────────

export interface CopyResearchInput {
  projectPath: string;
  prdContext: string;
  icpData?: string;
  competitorData?: string;
  designResearchBrief?: string;
}

export interface CopyGenerateInput {
  projectPath: string;
  copyResearchBrief: CopyResearchBrief;
  designResearchBrief?: string;
  screenInventory: string[];
}

export interface CopyIterateInput {
  projectPath: string;
  feedback: string;
  targetScreens?: string[];
}

// ── Cost Estimation ─────────────────────────────────────────────────────────

export function estimateCopyCost(screenCount: number): {
  calls: number;
  estimatedTokens: number;
  estimatedUsd: number;
} {
  // Phase 1: 1 large research call
  // Phase 2: 1 voice/tone + 1 per screen + 1 microcopy + 1 CTA/SEO
  // Phase 3: 1 critique
  const calls = 1 + 1 + screenCount + 1 + 1 + 1;
  const estimatedTokens = calls * 4000; // ~4K tokens per call avg
  const estimatedUsd = (estimatedTokens / 1000) * 0.015;

  return { calls, estimatedTokens, estimatedUsd };
}
