/**
 * Usage Meter - Tracks per-user project consumption for analytics.
 *
 * Community Edition: no limits, no overage. All features available.
 */

import type { TierId } from './tiers.js';

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

  /** Set the tier for a user (no-op in community edition). */
  setUserTier(_userId: string, _tierId: TierId): void {
    // Community edition - single tier, nothing to set
  }

  /** Get the tier for a user (always community). */
  getUserTier(_userId: string): TierId {
    return 'community';
  }

  /** Always allowed - no limits in community edition. */
  checkLimit(_userId: string): UsageLimitCheck {
    return { allowed: true, projectsRemaining: Infinity, overageCostUsd: 0 };
  }

  /** Record a new project creation. */
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

  /** Increment tool call count for a project. */
  recordToolCall(userId: string, projectId: string, costUsd: number = 0): void {
    const records = this.records.get(userId);
    if (!records) return;

    const record = records.find((r) => r.projectId === projectId);
    if (record) {
      record.toolCalls += 1;
      record.aiCostUsd += costUsd;
    }
  }

  /** Mark a project as completed. */
  markComplete(userId: string, projectId: string): void {
    const records = this.records.get(userId);
    if (!records) return;

    const record = records.find((r) => r.projectId === projectId);
    if (record) {
      record.completed = true;
    }
  }

  /** Get usage summary for a user's current billing period. */
  getSummary(userId: string): UsageSummary {
    const records = this.getCurrentPeriodRecords(userId);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    return {
      userId,
      tierId: 'community',
      periodStart,
      periodEnd,
      projectsUsed: records.length,
      projectsAllowed: Infinity,
      overageProjects: 0,
      overageCostUsd: 0,
      totalAiCostUsd: records.reduce((sum, r) => sum + r.aiCostUsd, 0),
      totalToolCalls: records.reduce((sum, r) => sum + r.toolCalls, 0),
      projects: records,
    };
  }

  /** Reset all records (for testing). */
  reset(): void {
    this.records.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getCurrentPeriodRecords(userId: string): UsageRecord[] {
    const records = this.records.get(userId) ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return records.filter((r) => new Date(r.createdAt) >= monthStart);
  }
}
