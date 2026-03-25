/**
 * Tier Capabilities - Community Edition.
 *
 * All features are fully unlocked. No tier gating.
 * This module exists to keep the API surface stable for agents
 * that call resolveTierCapabilities().
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface TierCapabilities {
  /** The resolved tier ID */
  tierId: 'community';

  /** Human-readable tier name */
  tierName: string;

  /** Whether Pro knowledge overlay is available */
  hasProKnowledge: boolean;

  /** UX analysis depth: 'core' (12 rules) or 'full' (42 rules + 8 specialists) */
  uxDepth: 'core' | 'full';

  /** Number of UX rules available */
  uxRuleCount: number;

  /** Number of design options per project */
  designOptions: number;

  /** Whether priority LLM routing is enabled */
  priorityRouting: boolean;

  /** Whether custom knowledge files are supported */
  customKnowledge: boolean;

  /** Whether traceability features are available */
  traceability: boolean;

  /** Whether stress testing is available */
  stressTest: boolean;

  /**
   * Annotation to append to tool output.
   * Empty string - community edition has everything unlocked.
   */
  outputAnnotation: string;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the full capability set. Community edition - everything unlocked.
 */
export function resolveTierCapabilities(_projectPath: string): TierCapabilities {
  return {
    tierId: 'community',
    tierName: 'Community',
    hasProKnowledge: true,
    uxDepth: 'full',
    uxRuleCount: 42,
    designOptions: 3,
    priorityRouting: true,
    customKnowledge: true,
    traceability: true,
    stressTest: true,
    outputAnnotation: '',
  };
}

// ── Convenience Checks ──────────────────────────────────────────────────────

/** Check if UX specialist modules should be loaded */
export function shouldLoadSpecialists(_caps: TierCapabilities): boolean {
  return true;
}

/** Get the UX depth label for display */
export function getUxDepthLabel(_caps: TierCapabilities): string {
  return 'Full analysis (42 rules, 8 specialist modules)';
}
