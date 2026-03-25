import { describe, it, expect, beforeEach } from 'vitest';
import { TIERS, getTier, hasFeature, formatTierPrice, getTierOrder } from '../../src/core/pricing/tiers.js';
import { UsageMeter } from '../../src/core/pricing/meter.js';

// ── Community Edition Tiers ─────────────────────────────────────────────────

describe('Pricing Tiers', () => {
  it('should define 1 tier (community)', () => {
    expect(Object.keys(TIERS)).toHaveLength(1);
    expect(getTierOrder()).toEqual(['community']);
  });

  it('community tier has all features enabled', () => {
    const community = getTier('community');
    expect(community.projectsPerMonth).toBe(0); // unlimited
    expect(community.features.fullPipeline).toBe(true);
    expect(community.features.designOptions).toBe(3);
    expect(community.features.securityScan).toBe(true);
    expect(community.features.traceability).toBe(true);
    expect(community.features.stressTest).toBe(true);
    expect(community.features.playbook).toBe(true);
    expect(community.features.pdfExport).toBe(true);
    expect(community.features.diagrams).toBe(true);
    expect(community.features.webhooks).toBe(true);
    expect(community.features.apiAccess).toBe(true);
  });

  it('getTier returns community for any input', () => {
    expect(getTier('community').name).toBe('Community');
    expect(getTier('free').name).toBe('Community');
    expect(getTier('pro').name).toBe('Community');
    expect(getTier('enterprise').name).toBe('Community');
  });

  it('hasFeature always returns true', () => {
    expect(hasFeature('community', 'fullPipeline')).toBe(true);
    expect(hasFeature('community', 'designOptions')).toBe(true);
    expect(hasFeature('community', 'stressTest')).toBe(true);
    expect(hasFeature('free', 'fullPipeline')).toBe(true);
    expect(hasFeature('pro', 'designOptions')).toBe(true);
  });

  it('formatTierPrice returns free', () => {
    expect(formatTierPrice()).toBe('Free (Open Source)');
  });
});

// ── Usage Metering ──────────────────────────────────────────────────────────

describe('UsageMeter', () => {
  let meter: UsageMeter;

  beforeEach(() => {
    meter = new UsageMeter();
  });

  it('defaults to community tier', () => {
    expect(meter.getUserTier('user-1')).toBe('community');
  });

  it('always allows projects (no limits)', () => {
    const check = meter.checkLimit('user-1');
    expect(check.allowed).toBe(true);
    expect(check.projectsRemaining).toBe(Infinity);
    expect(check.overageCostUsd).toBe(0);
  });

  it('allows unlimited projects', () => {
    for (let i = 0; i < 100; i++) {
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

  it('getSummary shows correct values', () => {
    for (let i = 0; i < 7; i++) {
      meter.recordProject('user-1', `proj-${i}`, `Project ${i}`);
    }

    const summary = meter.getSummary('user-1');
    expect(summary.projectsUsed).toBe(7);
    expect(summary.projectsAllowed).toBe(Infinity);
    expect(summary.overageProjects).toBe(0);
    expect(summary.overageCostUsd).toBe(0);
    expect(summary.tierId).toBe('community');
  });

  it('reset clears all data', () => {
    meter.recordProject('user-1', 'proj-1', 'Test');
    meter.reset();

    expect(meter.getUserTier('user-1')).toBe('community');
    const summary = meter.getSummary('user-1');
    expect(summary.projectsUsed).toBe(0);
  });
});
