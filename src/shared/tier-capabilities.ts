/**
 * Tier Capabilities -- Resolves what a user's tier CAN do within a tool.
 *
 * This is distinct from tier-guard.ts which answers "can the user ACCESS this tool?"
 * TierCapabilities answers "what quality level does the user get WITHIN the tool?"
 *
 * Architecture principle: resolve once, thread through, annotate output.
 * No silent degradation -- if Pro features are absent, the output says so.
 *
 * Usage:
 *   const caps = resolveTierCapabilities(projectPath);
 *   // Pass caps to agents so they know what knowledge is available
 *   // Append caps.outputAnnotation to results so users know their tier's coverage
 */

import { readTier } from './tier-guard.js';
import type { TierId } from '../core/pricing/tiers.js';
import { getTier } from '../core/pricing/tiers.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TierCapabilities {
  /** The resolved tier ID */
  tierId: TierId;

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
   * Annotation to append to tool output so the user knows their coverage level.
   * Empty string if Pro (no annotation needed -- they have everything).
   */
  outputAnnotation: string;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the full capability set for a project's tier.
 * Call this ONCE at the start of a tool handler, then thread it through.
 */
export function resolveTierCapabilities(projectPath: string): TierCapabilities {
  const tierId = readTier(projectPath);
  const tier = getTier(tierId);
  const features = tier.features;

  const hasProKnowledge = features.customKnowledge;
  const uxDepth = hasProKnowledge ? 'full' as const : 'core' as const;
  const uxRuleCount = hasProKnowledge ? 42 : 12;

  const annotation = buildAnnotation(tierId, uxDepth, uxRuleCount, features.designOptions);

  return {
    tierId,
    tierName: tier.name,
    hasProKnowledge,
    uxDepth,
    uxRuleCount,
    designOptions: features.designOptions,
    priorityRouting: features.priorityRouting,
    customKnowledge: features.customKnowledge,
    traceability: features.traceability,
    stressTest: features.stressTest,
    outputAnnotation: annotation,
  };
}

// ── Annotation Builder ──────────────────────────────────────────────────────

function buildAnnotation(
  tierId: TierId,
  uxDepth: 'core' | 'full',
  uxRuleCount: number,
  designOptions: number,
): string {
  // Pro and Enterprise users get everything -- no annotation needed
  if (tierId === 'pro' || tierId === 'enterprise') return '';

  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push(`*Analysis run on ${getTier(tierId).name} tier.*`);

  if (uxDepth === 'core') {
    lines.push(`*UX analysis used ${uxRuleCount} community rules. Upgrade to Pro for the full 42-rule system with 8 specialist modules.*`);
  }

  if (designOptions === 0) {
    lines.push('*Design options not available on this tier. Upgrade to Starter+ for design generation.*');
  } else if (designOptions === 1) {
    lines.push('*1 design option generated. Upgrade to Pro for 3 design options per project.*');
  }

  return lines.join('\n');
}

// ── Convenience Checks ──────────────────────────────────────────────────────

/** Check if UX specialist modules should be loaded (Pro knowledge available) */
export function shouldLoadSpecialists(caps: TierCapabilities): boolean {
  return caps.hasProKnowledge;
}

/** Get the UX depth label for display */
export function getUxDepthLabel(caps: TierCapabilities): string {
  return caps.uxDepth === 'full'
    ? `Full analysis (${caps.uxRuleCount} rules, 8 specialist modules)`
    : `Community analysis (${caps.uxRuleCount} core rules)`;
}
