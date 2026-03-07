import { z } from 'zod';

// ── Challenge Lens Ratings ──────────────────────────────────────────────────

export const IcpAlignmentRating = z.enum(['ALIGNED', 'DRIFTED', 'DISCONNECTED']);
export const CopyRating = z.enum(['SHARP', 'SOFT', 'HOLLOW']);
export const DesignDecisionRating = z.enum(['JUSTIFIED', 'FASHIONABLE', 'DECORATIVE']);
export const ConversionRating = z.enum(['CONVERTING', 'LEAKING', 'BROKEN']);
export const AccessibilityRating = z.enum(['INCLUSIVE', 'EXCLUDING', 'HOSTILE']);

export const ChallengeVerdict = z.enum(['READY', 'NOT_READY', 'CRITICAL_FAILURES']);

// ── Challenge Finding ───────────────────────────────────────────────────────

export const ChallengeFindingSchema = z.object({
  id: z.string().describe('Finding ID: C1, C2... for critical, H1, H2... for high, R1... for recommendations'),
  lens: z.string().describe('Which challenge lens caught this'),
  element: z.string().describe('Specific screen, component, or section'),
  problem: z.string().describe('What is wrong — direct, specific'),
  evidence: z.string().optional().describe('Why this matters — data, principle, or user impact'),
  fix: z.string().describe('Specific, actionable recommendation'),
  severity: z.enum(['critical', 'high', 'recommendation']),
});

// ── Challenge Lens Result ───────────────────────────────────────────────────

export const ChallengeLensResultSchema = z.object({
  lens: z.string().describe('Lens name'),
  rating: z.string().describe('Lens-specific rating'),
  criticalCount: z.number().describe('Number of critical issues found'),
  findings: z.array(ChallengeFindingSchema),
});

// ── Full Challenge Report ───────────────────────────────────────────────────

export const ChallengeReportSchema = z.object({
  projectName: z.string(),
  verdict: ChallengeVerdict,
  lenses: z.array(ChallengeLensResultSchema),
  criticalIssues: z.array(ChallengeFindingSchema).describe('All critical findings across lenses'),
  highPriorityIssues: z.array(ChallengeFindingSchema).describe('High-priority findings'),
  recommendations: z.array(ChallengeFindingSchema).describe('Nice-to-have improvements'),
  survivors: z.array(z.string()).describe('Design decisions that survived the challenge — earned praise'),
});

// ── TypeScript Types ────────────────────────────────────────────────────────

export type ChallengeFinding = z.infer<typeof ChallengeFindingSchema>;
export type ChallengeLensResult = z.infer<typeof ChallengeLensResultSchema>;
export type ChallengeReport = z.infer<typeof ChallengeReportSchema>;

// ── Challenge Input ─────────────────────────────────────────────────────────

export interface ChallengeInput {
  projectPath: string;
  prdContext: string;
  icpData?: string;
  designSpecPath?: string; // Path to DESIGN-SPEC.json
  copySystemPath?: string; // Path to COPY-SYSTEM.md
  wireframeHtml?: string; // HTML wireframe content to review
  screenDescriptions?: string; // Text descriptions of screens if no wireframes
}

// ── Sub-Agent Lens Names ────────────────────────────────────────────────────

export const CHALLENGER_LENSES = [
  'icp_alignment',
  'copy',
  'design_decisions',
  'conversion_path',
  'accessibility',
] as const;

export type ChallengerLens = (typeof CHALLENGER_LENSES)[number];

/** Community tier only runs 3 lenses; Pro runs all 5 */
export const COMMUNITY_LENSES: ChallengerLens[] = ['icp_alignment', 'copy', 'design_decisions'];
export const PRO_LENSES: ChallengerLens[] = [...CHALLENGER_LENSES];
