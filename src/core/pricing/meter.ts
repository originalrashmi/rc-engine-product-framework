/**
 * Usage Meter -- Tracks per-user project consumption for billing.
 *
 * Records:
 *   - Projects created per billing period
 *   - Tool calls per project (for analytics)
 *   - AI cost passthrough per project
 *
 * Storage: SQLite via the checkpoint store pattern.
 */

import type { TierId } from './tiers.js';
import { getTier } from './tiers.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface UsageRecord {
  userId: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  toolCalls: number;
  aiCostUsd: number;
  completed: boolean;
}

export interface UsageSummary {
  userId: string;
  tierId: TierId;
  periodStart: string;
  periodEnd: string;
  projectsUsed: number;
  projectsAllowed: number;
  overageProjects: number;
  overageCostUsd: number;
  totalAiCostUsd: number;
  totalToolCalls: number;
  projects: UsageRecord[];
}

export interface UsageLimitCheck {
  allowed: boolean;
  reason?: string;
  projectsRemaining: number;
  overageCostUsd: number;
}

// ── Meter ───────────────────────────────────────────────────────────────────

export class UsageMeter {
  private records: Map<string, UsageRecord[]> = new Map();
  private userTiers: Map<string, TierId> = new Map();

  /** Set the tier for a user. */
  setUserTier(userId: string, tierId: TierId): void {
    this.userTiers.set(userId, tierId);
  }

  /** Get the tier for a user (defaults to 'free'). */
  getUserTier(userId: string): TierId {
    return this.userTiers.get(userId) ?? 'free';
  }

  /**
   * Check if a user can create a new project.
   */
  checkLimit(userId: string): UsageLimitCheck {
    const tierId = this.getUserTier(userId);
    const tier = getTier(tierId);
    const records = this.getCurrentPeriodRecords(userId);

    // Unlimited projects
    if (tier.projectsPerMonth === 0) {
      return { allowed: true, projectsRemaining: Infinity, overageCostUsd: 0 };
    }

    const used = records.length;
    const remaining = Math.max(0, tier.projectsPerMonth - used);

    // Free tier: hard limit, no overage
    if (tierId === 'free' && remaining === 0) {
      return {
        allowed: false,
        reason: 'Free tier limit reached (1 project/month). Upgrade to Starter for more.',
        projectsRemaining: 0,
        overageCostUsd: 0,
      };
    }

    // Paid tiers: allow overage
    if (remaining === 0 && tier.overagePerProjectUsd > 0) {
      const overageCount = used - tier.projectsPerMonth + 1;
      return {
        allowed: true,
        reason: `This project exceeds your ${tier.name} plan limit. Overage: $${tier.overagePerProjectUsd}/project.`,
        projectsRemaining: 0,
        overageCostUsd: overageCount * tier.overagePerProjectUsd,
      };
    }

    return { allowed: true, projectsRemaining: remaining, overageCostUsd: 0 };
  }

  /**
   * Record a new project creation.
   */
  recordProject(userId: string, projectId: string, projectName: string): void {
    if (!this.records.has(userId)) {
      this.records.set(userId, []);
    }

    this.records.get(userId)!.push({
      userId,
      projectId,
      projectName,
      createdAt: new Date().toISOString(),
      toolCalls: 0,
      aiCostUsd: 0,
      completed: false,
    });
  }

  /**
   * Increment tool call count for a project.
   */
  recordToolCall(userId: string, projectId: string, costUsd: number = 0): void {
    const records = this.records.get(userId);
    if (!records) return;

    const record = records.find((r) => r.projectId === projectId);
    if (record) {
      record.toolCalls += 1;
      record.aiCostUsd += costUsd;
    }
  }

  /**
   * Mark a project as completed.
   */
  markComplete(userId: string, projectId: string): void {
    const records = this.records.get(userId);
    if (!records) return;

    const record = records.find((r) => r.projectId === projectId);
    if (record) {
      record.completed = true;
    }
  }

  /**
   * Get usage summary for a user's current billing period.
   */
  getSummary(userId: string): UsageSummary {
    const tierId = this.getUserTier(userId);
    const tier = getTier(tierId);
    const records = this.getCurrentPeriodRecords(userId);

    const projectsAllowed = tier.projectsPerMonth === 0 ? Infinity : tier.projectsPerMonth;
    const overageProjects = Math.max(0, records.length - (tier.projectsPerMonth || Infinity));
    const overageCostUsd = overageProjects * tier.overagePerProjectUsd;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    return {
      userId,
      tierId,
      periodStart,
      periodEnd,
      projectsUsed: records.length,
      projectsAllowed,
      overageProjects,
      overageCostUsd,
      totalAiCostUsd: records.reduce((sum, r) => sum + r.aiCostUsd, 0),
      totalToolCalls: records.reduce((sum, r) => sum + r.toolCalls, 0),
      projects: records,
    };
  }

  /**
   * Reset all records (for testing).
   */
  reset(): void {
    this.records.clear();
    this.userTiers.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getCurrentPeriodRecords(userId: string): UsageRecord[] {
    const records = this.records.get(userId) ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return records.filter((r) => new Date(r.createdAt) >= monthStart);
  }
}
