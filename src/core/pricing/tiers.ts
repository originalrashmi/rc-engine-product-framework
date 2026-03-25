/**
 * RC Engine - Community Edition (Open Source)
 *
 * All features are enabled. No tier gating, no payment required.
 * Users provide their own API keys (BYOK model).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type TierId = 'community';

export interface TierDefinition {
  id: TierId;
  name: string;
  projectsPerMonth: number; // 0 = unlimited
  features: TierFeatures;
  description: string;
}

export interface TierFeatures {
  fullPipeline: boolean;
  designOptions: number;
  diagrams: boolean;
  playbook: boolean;
  pdfExport: boolean;
  securityScan: boolean;
  traceability: boolean;
  priorityRouting: boolean;
  customKnowledge: boolean;
  teamSeats: number;
  apiAccess: boolean;
  webhooks: boolean;
  stressTest: boolean;
}

// ── Single Edition ──────────────────────────────────────────────────────────

export const TIERS: Record<TierId, TierDefinition> = {
  community: {
    id: 'community',
    name: 'Community',
    projectsPerMonth: 0, // Unlimited
    description: 'RC Engine Community Edition -- all features enabled.',
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

/** Get the community tier definition. Accepts any string for backwards compat. */
export function getTier(_id?: string): TierDefinition {
  return TIERS.community;
}

/** All features are always available. */
export function hasFeature(_tierId: string, _feature: keyof TierFeatures): boolean {
  return true;
}

/** Always returns 'Free (Open Source)'. */
export function formatTierPrice(): string {
  return 'Free (Open Source)';
}

/** Single edition. */
export function getTierOrder(): TierId[] {
  return ['community'];
}
