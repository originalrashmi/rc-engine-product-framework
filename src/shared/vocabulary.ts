/**
 * User-Facing Vocabulary -- Single Source of Truth
 *
 * Internal code can use whatever names it wants (gate, persona, forge, etc).
 * But all user-facing strings MUST go through this module.
 *
 * Why: Users are non-technical. "Gate" means nothing to them. "Checkpoint" does.
 *
 * Rules:
 * 1. Tool descriptions, return messages, and generated documents import from here
 * 2. Internal variable names, types, and log messages can use internal terms
 * 3. The BANNED_IN_USER_OUTPUT list is enforced by tests/vocabulary.test.ts in CI
 */

// ── Term Mapping ──────────────────────────────────────────────────────────────

/** Maps internal terms to their user-facing equivalents. */
export const TERMS = {
  gate: 'checkpoint',
  Gate: 'Checkpoint',
  persona: 'research specialist',
  Persona: 'Research specialist',
  phase: 'step',
  Phase: 'Step',
  prd: 'requirements document',
  PRD: 'Requirements Document',
  artifact: 'deliverable',
  Artifact: 'Deliverable',
  forge: 'build',
  Forge: 'Build',
  illuminate: 'discovery',
  Illuminate: 'Discovery',
  compound: 'production hardening',
  Compound: 'Production Hardening',
  token: 'AI usage',
  tokens: 'AI usage',
  Tokens: 'AI Usage',
  passthrough: 'manual',
  'passthrough mode': 'manual mode',
  'Passthrough Mode': 'Manual Mode',
  'Passthrough mode': 'Manual mode',
  autonomous: 'automatic',
  Autonomous: 'Automatic',
  'autonomous mode': 'automatic mode',
  'Autonomous mode': 'Automatic mode',
} as const;

// ── Phase Labels ──────────────────────────────────────────────────────────────

/** User-facing labels for RC Method phases. Internal ID -> display name. */
export const PHASE_LABELS: Record<string, string> = {
  illuminate: 'Step 1: Discovery',
  define: 'Step 2: Requirements',
  architect: 'Step 3: Architecture',
  sequence: 'Step 4: Task Planning',
  validate: 'Step 5: Quality Checks',
  forge: 'Step 6: Build',
  connect: 'Step 7: Integration',
  compound: 'Step 8: Production Hardening',
};

/** Get the user-facing label for a phase, with fallback. */
export function phaseLabel(internalId: string): string {
  return PHASE_LABELS[internalId] || internalId;
}

// ── Cost Labels ──────────────────────────────────────────────────────────────

/** Format a token count as user-facing cost text. */
export function formatUsage(tokenCount: number): string {
  return `${tokenCount.toLocaleString()} AI units`;
}

/** Format a usage table header (replaces "Tokens" column). */
export function usageColumnHeader(): string {
  return 'AI Usage';
}

// ── Mode Labels ──────────────────────────────────────────────────────────────

/** User-facing label for execution modes. */
export function modeLabel(internal: 'passthrough' | 'autonomous'): string {
  return internal === 'passthrough' ? 'Manual Mode' : 'Automatic Mode';
}

// ── Enforcement ──────────────────────────────────────────────────────────────

/**
 * Terms that MUST NOT appear in user-facing output strings.
 * Checked by tests/vocabulary.test.ts against all tool return content.
 *
 * Note: These are checked as whole-word matches to avoid false positives
 * (e.g., "authenticate" contains "gate" but is fine).
 */
export const BANNED_TERMS_IN_USER_OUTPUT: Array<{
  pattern: RegExp;
  replacement: string;
  description: string;
}> = [
  {
    pattern: /\bPassthrough [Mm]ode\b/,
    replacement: 'Manual mode',
    description: '"Passthrough mode" -> "Manual mode"',
  },
  {
    pattern: /\bAutonomous(?:\s+mode)?\b(?!.*(?:personas|research))/,
    replacement: 'Automatic (mode)',
    description: '"Autonomous" -> "Automatic" in mode context',
  },
  {
    pattern: /\bresearch personas?\b/i,
    replacement: 'research specialist(s)',
    description: '"research persona" -> "research specialist"',
  },
  {
    pattern: /\|\s*Tokens\s*\|/,
    replacement: '| AI Usage |',
    description: '"Tokens" column header -> "AI Usage"',
  },
  {
    pattern: /\d[\d,]*\s+tokens\b/,
    replacement: 'N AI units',
    description: '"N tokens" -> "N AI units"',
  },
  {
    pattern: /\bPhase \d+:\s*Illuminate\b/,
    replacement: 'Step 1: Discovery',
    description: '"Phase N: Illuminate" -> "Step N: Discovery"',
  },
  {
    pattern: /\bPhase \d+:\s*Forge\b/,
    replacement: 'Step 6: Build',
    description: '"Phase N: Forge" -> "Step N: Build"',
  },
  {
    pattern: /\bFINAL GATE\b/i,
    replacement: 'Final checkpoint',
    description: '"FINAL GATE" -> "Final checkpoint"',
  },
  {
    pattern: /\bgate decision\b/i,
    replacement: 'checkpoint decision',
    description: '"gate decision" -> "checkpoint decision"',
  },
];
