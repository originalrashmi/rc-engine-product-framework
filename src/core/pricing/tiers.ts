/**
 * Pricing Tiers - Hybrid pricing model for RC Engine.
 *
 * Free tier hooks users with limited projects, then paid tiers
 * add capacity and features. Usage-based overage on top.
 *
 * Model:
 *   - Free: 1 project/month, research only, community support
 *   - Pro: $79/mo, unlimited projects, full pipeline, priority routing, design options, playbook
 *   - Enterprise: Custom pricing, team seats, SSO, SLA, dedicated support
 *
 * Overage: $0.50 per additional project beyond tier limit.
 * AI passthrough: Users provide their own API keys (no markup on LLM costs).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type TierId = 'free' | 'pro' | 'enterprise';

export interface TierDefinition {
  id: TierId;
  name: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number; // per month when billed annually
  projectsPerMonth: number; // 0 = unlimited
  features: TierFeatures;
  overagePerProjectUsd: number;
  description: string;
  highlight?: string; // Badge text like "Most Popular"
}

export interface TierFeatures {
  /** Full pipeline (research + design + build + validate). */
  fullPipeline: boolean;
  /** Number of design options per project (0 = none). */
  designOptions: number;
  /** Architecture diagram generation. */
  diagrams: boolean;
  /** Playbook / ARD export. */
  playbook: boolean;
  /** PDF export of deliverables. */
  pdfExport: boolean;
  /** Security scanning. */
  securityScan: boolean;
  /** Traceability mapping. */
  traceability: boolean;
  /** Priority LLM routing (faster models). */
  priorityRouting: boolean;
  /** Custom knowledge files. */
  customKnowledge: boolean;
  /** Team collaboration (multiple seats). */
  teamSeats: number; // 0 = no team, 1 = solo
  /** API access for CI/CD integration. */
  apiAccess: boolean;
  /** Webhook notifications. */
  webhooks: boolean;
  /** Idea Stress Test (viability analysis after PRD synthesis). */
  stressTest: boolean;
}

// ── Tier Definitions ────────────────────────────────────────────────────────

export const TIERS: Record<TierId, TierDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    projectsPerMonth: 1,
    overagePerProjectUsd: 0, // No overage on free - hard limit
    description: 'Try RC Engine with one project per month.',
    features: {
      fullPipeline: true, // Community: full pipeline (research + build + validate)
      designOptions: 0,
      diagrams: false,
      playbook: false,
      pdfExport: false,
      securityScan: true, // Community: security scanning included
      traceability: true, // Community: traceability included
      priorityRouting: false,
      customKnowledge: false,
      teamSeats: 1,
      apiAccess: false,
      webhooks: false,
      stressTest: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 79,
    annualPriceUsd: 66, // ~16% discount
    projectsPerMonth: 0, // Unlimited
    overagePerProjectUsd: 0,
    description: 'Everything you need for serious product development.',
    highlight: 'Most Popular',
    features: {
      fullPipeline: true,
      designOptions: 3,
      diagrams: true,
      playbook: true,
      pdfExport: true,
      securityScan: true,
      traceability: true,
      priorityRouting: true,
      customKnowledge: true,
      teamSeats: 1,
      apiAccess: true,
      webhooks: false,
      stressTest: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: 0, // Custom pricing
    annualPriceUsd: 0,
    projectsPerMonth: 0, // Unlimited
    overagePerProjectUsd: 0,
    description: 'Custom deployment for teams and organizations.',
    features: {
      fullPipeline: true,
      designOptions: 3,
      diagrams: true,
      playbook: true,
      pdfExport: true,
      securityScan: true,
      traceability: true,
      priorityRouting: true,
      customKnowledge: true,
      teamSeats: 0, // Unlimited
      apiAccess: true,
      webhooks: true,
      stressTest: true,
    },
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get a tier definition by ID. */
export function getTier(id: TierId): TierDefinition {
  const tier = TIERS[id];
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

/** Check if a feature is available on a given tier. */
export function hasFeature(tierId: TierId, feature: keyof TierFeatures): boolean {
  const tier = getTier(tierId);
  const value = tier.features[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return false;
}

/** Get the display price string for a tier. */
export function formatTierPrice(tier: TierDefinition, annual: boolean = false): string {
  if (tier.id === 'enterprise') return 'Custom';
  if (tier.monthlyPriceUsd === 0) return 'Free';
  const price = annual ? tier.annualPriceUsd : tier.monthlyPriceUsd;
  return `$${price}/mo`;
}

/** Get all tier IDs in display order. */
export function getTierOrder(): TierId[] {
  return ['free', 'pro', 'enterprise'];
}
