/**
 * Cost Tracker -- Per-model cost calculation with input/output token split.
 *
 * Replaces the existing TokenTracker which only tracks total token counts
 * with no cost awareness. This module:
 * - Tracks input vs output tokens separately
 * - Calculates costs using per-model rate tables
 * - Enforces per-pipeline budgets with configurable alerts
 * - Persists records to the checkpoint store (when available)
 *
 * Cost rates are in USD per million tokens (MTok).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ModelCostRate {
  /** Cost per million input tokens (USD). */
  inputPerMTok: number;
  /** Cost per million output tokens (USD). */
  outputPerMTok: number;
}

export interface CostRecord {
  /** Pipeline run this call belongs to. */
  pipelineId: string;
  /** Domain that made the call. */
  domain: string;
  /** Tool or agent name. */
  tool: string;
  /** LLM provider used. */
  provider: string;
  /** Model ID used. */
  model: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Calculated cost in USD. */
  costUsd: number;
  /** ISO timestamp. */
  timestamp: string;
}

export interface BudgetConfig {
  /** Maximum spend per pipeline run in USD. */
  maxCostUsd: number;
  /** Percentage at which to emit a warning (0-1). Default: 0.8. */
  warnThreshold?: number;
}

export interface CostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byProvider: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }>;
  byDomain: Record<string, { costUsd: number; calls: number }>;
}

export type BudgetEventType = 'warn' | 'exceeded';

export interface BudgetEvent {
  type: BudgetEventType;
  pipelineId: string;
  currentCostUsd: number;
  budgetUsd: number;
  percentUsed: number;
  message: string;
}

export type BudgetListener = (event: BudgetEvent) => void;

// ── Cost Rates ──────────────────────────────────────────────────────────────

/**
 * Per-model cost rates (USD per million tokens).
 * Updated: 2025-05. Override at construction time for newer pricing.
 */
const DEFAULT_COST_RATES: Record<string, ModelCostRate> = {
  // Claude (Anthropic)
  'claude-sonnet-4-5-20250929': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-20250514': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-haiku-3-5-20241022': { inputPerMTok: 0.8, outputPerMTok: 4.0 },

  // OpenAI
  'gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10.0 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },

  // Google Gemini
  'gemini-2.0-flash': { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  'gemini-2.5-flash': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'gemini-2.5-pro': { inputPerMTok: 1.25, outputPerMTok: 10.0 },

  // Perplexity
  'sonar-pro': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  sonar: { inputPerMTok: 1.0, outputPerMTok: 1.0 },
};

/**
 * Fallback rate for unknown models. Conservative estimate to avoid
 * under-counting costs.
 */
const FALLBACK_RATE: ModelCostRate = { inputPerMTok: 3.0, outputPerMTok: 15.0 };

// ── Tracker ─────────────────────────────────────────────────────────────────

export class CostTracker {
  private records: CostRecord[] = [];
  private budgets: Map<string, BudgetConfig> = new Map();
  private costRates: Record<string, ModelCostRate>;
  private listeners: BudgetListener[] = [];
  private warnedPipelines: Set<string> = new Set();

  /**
   * Create a cost tracker.
   *
   * @param customRates - Override or extend default cost rates.
   */
  constructor(customRates?: Record<string, ModelCostRate>) {
    this.costRates = { ...DEFAULT_COST_RATES, ...customRates };
  }

  /**
   * Record an LLM call and its cost.
   *
   * @returns The calculated cost in USD.
   */
  record(params: {
    pipelineId: string;
    domain: string;
    tool: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): number {
    const rate = this.costRates[params.model] ?? FALLBACK_RATE;
    const costUsd =
      (params.inputTokens / 1_000_000) * rate.inputPerMTok + (params.outputTokens / 1_000_000) * rate.outputPerMTok;

    const record: CostRecord = {
      ...params,
      costUsd,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);
    this.checkBudget(params.pipelineId);

    return costUsd;
  }

  /**
   * Set a budget for a pipeline run.
   */
  setBudget(pipelineId: string, config: BudgetConfig): void {
    this.budgets.set(pipelineId, config);
    this.warnedPipelines.delete(pipelineId);
  }

  /**
   * Subscribe to budget events (warn, exceeded).
   */
  onBudget(listener: BudgetListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get cost summary for a pipeline, or all pipelines if not specified.
   */
  getSummary(pipelineId?: string): CostSummary {
    const filtered = pipelineId ? this.records.filter((r) => r.pipelineId === pipelineId) : this.records;

    const summary: CostSummary = {
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: filtered.length,
      byProvider: {},
      byDomain: {},
    };

    for (const r of filtered) {
      summary.totalCostUsd += r.costUsd;
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;

      // By provider
      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
      }
      summary.byProvider[r.provider].costUsd += r.costUsd;
      summary.byProvider[r.provider].inputTokens += r.inputTokens;
      summary.byProvider[r.provider].outputTokens += r.outputTokens;
      summary.byProvider[r.provider].calls += 1;

      // By domain
      if (!summary.byDomain[r.domain]) {
        summary.byDomain[r.domain] = { costUsd: 0, calls: 0 };
      }
      summary.byDomain[r.domain].costUsd += r.costUsd;
      summary.byDomain[r.domain].calls += 1;
    }

    return summary;
  }

  /**
   * Get all records for a pipeline.
   */
  getRecords(pipelineId?: string): CostRecord[] {
    if (pipelineId) {
      return this.records.filter((r) => r.pipelineId === pipelineId);
    }
    return [...this.records];
  }

  /**
   * Get the remaining budget for a pipeline.
   * Returns null if no budget is set.
   */
  getRemainingBudget(pipelineId: string): number | null {
    const budget = this.budgets.get(pipelineId);
    if (!budget) return null;

    const spent = this.getSummary(pipelineId).totalCostUsd;
    return Math.max(0, budget.maxCostUsd - spent);
  }

  /**
   * Check if a pipeline has exceeded its budget.
   */
  isOverBudget(pipelineId: string): boolean {
    const remaining = this.getRemainingBudget(pipelineId);
    return remaining !== null && remaining <= 0;
  }

  /**
   * Get the cost rate for a model.
   */
  getRate(model: string): ModelCostRate {
    return this.costRates[model] ?? FALLBACK_RATE;
  }

  /**
   * Estimate cost for a planned call (without recording it).
   */
  estimate(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    const rate = this.getRate(model);
    return (
      (estimatedInputTokens / 1_000_000) * rate.inputPerMTok + (estimatedOutputTokens / 1_000_000) * rate.outputPerMTok
    );
  }

  /**
   * Clear all records. Use with caution.
   */
  reset(): void {
    this.records = [];
    this.warnedPipelines.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private checkBudget(pipelineId: string): void {
    const budget = this.budgets.get(pipelineId);
    if (!budget) return;

    const spent = this.getSummary(pipelineId).totalCostUsd;
    const percentUsed = spent / budget.maxCostUsd;
    const warnThreshold = budget.warnThreshold ?? 0.8;

    if (percentUsed >= 1.0) {
      this.emit({
        type: 'exceeded',
        pipelineId,
        currentCostUsd: spent,
        budgetUsd: budget.maxCostUsd,
        percentUsed,
        message: `Pipeline "${pipelineId}" exceeded budget: $${spent.toFixed(4)} / $${budget.maxCostUsd.toFixed(2)}`,
      });
    } else if (percentUsed >= warnThreshold && !this.warnedPipelines.has(pipelineId)) {
      this.warnedPipelines.add(pipelineId);
      this.emit({
        type: 'warn',
        pipelineId,
        currentCostUsd: spent,
        budgetUsd: budget.maxCostUsd,
        percentUsed,
        message: `Pipeline "${pipelineId}" at ${Math.round(percentUsed * 100)}% of budget: $${spent.toFixed(4)} / $${budget.maxCostUsd.toFixed(2)}`,
      });
    }
  }

  private emit(event: BudgetEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not crash the tracker
      }
    }
  }
}
