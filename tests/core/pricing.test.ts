import { describe, it, expect, beforeEach } from 'vitest';
import { TIERS, getTier, hasFeature, formatTierPrice, getTierOrder } from '../../src/core/pricing/tiers.js';
import { UsageMeter } from '../../src/core/pricing/meter.js';

// ── Tier Definitions ────────────────────────────────────────────────────────

describe('Pricing Tiers', () => {
  it('should define 3 tiers', () => {
    expect(Object.keys(TIERS)).toHaveLength(3);
    expect(getTierOrder()).toEqual(['free', 'pro', 'enterprise']);
  });

  it('free tier has correct limits', () => {
    const free = getTier('free');
    expect(free.monthlyPriceUsd).toBe(0);
    expect(free.projectsPerMonth).toBe(1);
    expect(free.features.fullPipeline).toBe(false);
    expect(free.features.designOptions).toBe(0);
    expect(free.features.securityScan).toBe(false);
  });

  it('pro tier has unlimited projects and all features', () => {
    const pro = getTier('pro');
    expect(pro.monthlyPriceUsd).toBe(79);
    expect(pro.projectsPerMonth).toBe(0); // unlimited
    expect(pro.features.fullPipeline).toBe(true);
    expect(pro.features.designOptions).toBe(3);
    expect(pro.features.playbook).toBe(true);
    expect(pro.features.traceability).toBe(true);
    expect(pro.features.priorityRouting).toBe(true);
  });

  it('enterprise has team seats and webhooks', () => {
    const enterprise = getTier('enterprise');
    expect(enterprise.features.teamSeats).toBe(0); // unlimited
    expect(enterprise.features.webhooks).toBe(true);
    expect(enterprise.features.apiAccess).toBe(true);
  });

  it('annual price is lower than monthly for pro', () => {
    const pro = getTier('pro');
    expect(pro.annualPriceUsd).toBeLessThan(pro.monthlyPriceUsd);
  });

  it('getTier throws on unknown tier', () => {
    expect(() => getTier('platinum' as never)).toThrow('Unknown tier');
  });

  it('hasFeature checks boolean and numeric features', () => {
    expect(hasFeature('free', 'fullPipeline')).toBe(false);
    expect(hasFeature('pro', 'fullPipeline')).toBe(true);
    expect(hasFeature('free', 'designOptions')).toBe(false); // 0 = false
    expect(hasFeature('pro', 'designOptions')).toBe(true); // 3 = true
  });

  it('formatTierPrice returns correct strings', () => {
    expect(formatTierPrice(getTier('free'))).toBe('Free');
    expect(formatTierPrice(getTier('pro'))).toBe('$79/mo');
    expect(formatTierPrice(getTier('pro'), true)).toBe('$66/mo');
    expect(formatTierPrice(getTier('enterprise'))).toBe('Custom');
  });
});

// ── Usage Metering ──────────────────────────────────────────────────────────

describe('UsageMeter', () => {
  let meter: UsageMeter;

  beforeEach(() => {
    meter = new UsageMeter();
  });

  it('defaults to free tier', () => {
    expect(meter.getUserTier('user-1')).toBe('free');
  });

  it('allows setting user tier', () => {
    meter.setUserTier('user-1', 'pro');
    expect(meter.getUserTier('user-1')).toBe('pro');
  });

  it('free tier allows 1 project', () => {
    const check = meter.checkLimit('user-1');
    expect(check.allowed).toBe(true);
    expect(check.projectsRemaining).toBe(1);
  });

  it('free tier blocks after 1 project', () => {
    meter.recordProject('user-1', 'proj-1', 'Test Project');
    const check = meter.checkLimit('user-1');
    expect(check.allowed).toBe(false);
    expect(check.projectsRemaining).toBe(0);
    expect(check.reason).toContain('Free tier limit');
  });

  it('pro tier has unlimited projects', () => {
    meter.setUserTier('user-1', 'pro');

    for (let i = 0; i < 20; i++) {
      meter.recordProject('user-1', `proj-${i}`, `Project ${i}`);
    }

    const check = meter.checkLimit('user-1');
    expect(check.allowed).toBe(true);
    expect(check.projectsRemaining).toBe(Infinity);
    expect(check.overageCostUsd).toBe(0);
  });

  it('tracks tool calls and AI cost', () => {
    meter.recordProject('user-1', 'proj-1', 'Test');
    meter.recordToolCall('user-1', 'proj-1', 0.05);
    meter.recordToolCall('user-1', 'proj-1', 0.03);

    const summary = meter.getSummary('user-1');
    expect(summary.totalToolCalls).toBe(2);
    expect(summary.totalAiCostUsd).toBeCloseTo(0.08);
  });

  it('marks projects complete', () => {
    meter.recordProject('user-1', 'proj-1', 'Test');
    meter.markComplete('user-1', 'proj-1');

    const summary = meter.getSummary('user-1');
    expect(summary.projects[0].completed).toBe(true);
  });

  it('getSummary shows correct values for pro', () => {
    meter.setUserTier('user-1', 'pro');

    for (let i = 0; i < 7; i++) {
      meter.recordProject('user-1', `proj-${i}`, `Project ${i}`);
    }

    const summary = meter.getSummary('user-1');
    expect(summary.projectsUsed).toBe(7);
    expect(summary.projectsAllowed).toBe(Infinity);
    expect(summary.overageProjects).toBe(0);
    expect(summary.overageCostUsd).toBe(0);
  });

  it('reset clears all data', () => {
    meter.setUserTier('user-1', 'pro');
    meter.recordProject('user-1', 'proj-1', 'Test');
    meter.reset();

    expect(meter.getUserTier('user-1')).toBe('free');
    const summary = meter.getSummary('user-1');
    expect(summary.projectsUsed).toBe(0);
  });
});
