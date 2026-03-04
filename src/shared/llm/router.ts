/**
 * Model Router -- Intelligent LLM selection based on task type, budget, and quality history.
 *
 * Replaces the simple "fall back to Claude" pattern with:
 * 1. Task-type routing: Use the best historical model for each task type
 * 2. Budget-aware selection: Prefer cheaper models when budget is tight
 * 3. Cascading fallback: Try providers in quality order, not just Claude
 * 4. Cost tier defaults: Classification/formatting -> cheap; architecture/security -> expensive
 */

import type { BaseLLMClient } from './base-client.js';
import type { LLMFactory } from './factory.js';
import type { LearningStore } from '../../core/learning/store.js';
import type { CostTracker } from '../../core/budget/cost-tracker.js';
import { LLMProvider } from '../types.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type CostTier = 'cheap' | 'standard' | 'premium';

export interface RoutingDecision {
  provider: LLMProvider;
  reason: string;
  tier: CostTier;
}

export interface RouteRequest {
  /** The task type for quality-based routing (e.g., 'security-scan', 'prd-generation'). */
  taskType: string;
  /** The domain making the request. */
  domain: string;
  /** Preferred provider, if any (from persona config). */
  preferredProvider?: LLMProvider;
  /** Pipeline ID for budget checking. */
  pipelineId?: string;
  /** Force a specific cost tier. */
  forceTier?: CostTier;
}

// ── Default Task Routing ────────────────────────────────────────────────────

/**
 * Default cost tier assignments by task type.
 * These are used when no historical data exists.
 */
const DEFAULT_TASK_TIERS: Record<string, CostTier> = {
  // Cheap tier -- simple classification, formatting, extraction
  prc_classify: 'cheap',
  prc_gate: 'cheap',
  rc_gate: 'cheap',
  postrc_gate: 'cheap',
  postrc_configure: 'cheap',
  ux_score: 'cheap',

  // Standard tier -- research, content generation
  prc_run_stage: 'standard',
  prc_synthesize: 'standard',
  rc_illuminate: 'standard',
  rc_define: 'standard',
  rc_sequence: 'standard',
  rc_validate: 'standard',
  ux_generate: 'standard',
  ux_audit: 'standard',

  // Premium tier -- architecture, security, code generation
  rc_architect: 'premium',
  rc_forge_task: 'premium',
  postrc_scan: 'premium',
};

/**
 * Provider preferences by cost tier.
 * Ordered by preference (first = try first).
 */
const TIER_PROVIDERS: Record<CostTier, LLMProvider[]> = {
  cheap: [LLMProvider.Gemini, LLMProvider.OpenAI, LLMProvider.Claude],
  standard: [LLMProvider.Claude, LLMProvider.OpenAI, LLMProvider.Gemini],
  premium: [LLMProvider.Claude, LLMProvider.OpenAI, LLMProvider.Perplexity],
};

// ── Router ──────────────────────────────────────────────────────────────────

export class ModelRouter {
  private factory: LLMFactory;
  private learningStore: LearningStore | null;
  private costTracker: CostTracker | null;

  constructor(factory: LLMFactory, learningStore?: LearningStore | null, costTracker?: CostTracker | null) {
    this.factory = factory;
    this.learningStore = learningStore ?? null;
    this.costTracker = costTracker ?? null;
  }

  /**
   * Select the best LLM client for a given task.
   *
   * Decision priority:
   * 1. If preferred provider is available and has good history -> use it
   * 2. If learning data exists for this task type -> use best historical model
   * 3. If budget is tight -> force cheap tier
   * 4. Fall back to default tier routing
   */
  route(request: RouteRequest): { client: BaseLLMClient; decision: RoutingDecision } {
    const tier = request.forceTier ?? this.determineTier(request);

    // Step 1: Check if preferred provider works
    if (request.preferredProvider) {
      if (this.factory.isNativelyAvailable(request.preferredProvider)) {
        const successRate = this.getSuccessRate(request.preferredProvider, request.taskType);
        if (successRate >= 0.5) {
          return {
            client: this.factory.getClient(request.preferredProvider),
            decision: {
              provider: request.preferredProvider,
              reason: `preferred provider (${Math.round(successRate * 100)}% success rate)`,
              tier,
            },
          };
        }
      }
    }

    // Step 2: Check learning data for best historical model
    if (this.learningStore) {
      const best = this.learningStore.getBestModel(request.taskType);
      if (best) {
        const provider = this.providerFromString(best.provider);
        if (provider && this.factory.isNativelyAvailable(provider)) {
          return {
            client: this.factory.getClient(provider),
            decision: {
              provider,
              reason: `best historical performer for ${request.taskType}`,
              tier,
            },
          };
        }
      }
    }

    // Step 3: Budget-aware tier override
    const effectiveTier = this.applyBudgetConstraint(tier, request.pipelineId);

    // Step 4: Try providers in tier order
    const candidates = TIER_PROVIDERS[effectiveTier];
    for (const provider of candidates) {
      if (this.factory.isNativelyAvailable(provider)) {
        return {
          client: this.factory.getClient(provider),
          decision: {
            provider,
            reason: `${effectiveTier} tier default${effectiveTier !== tier ? ` (downgraded from ${tier} due to budget)` : ''}`,
            tier: effectiveTier,
          },
        };
      }
    }

    // Final fallback: any available provider
    for (const provider of Object.values(LLMProvider)) {
      try {
        const client = this.factory.getClient(provider);
        return {
          client,
          decision: {
            provider,
            reason: 'last-resort fallback',
            tier: effectiveTier,
          },
        };
      } catch {
        continue;
      }
    }

    throw new Error('No LLM provider available. Configure at least ANTHROPIC_API_KEY in .env.');
  }

  /**
   * Get the default cost tier for a task type.
   */
  getTier(taskType: string): CostTier {
    return DEFAULT_TASK_TIERS[taskType] ?? 'standard';
  }

  /**
   * Get routing explanation for debugging/transparency.
   */
  explain(request: RouteRequest): string {
    const { decision } = this.route(request);
    const lines = [
      `Task: ${request.taskType}`,
      `Domain: ${request.domain}`,
      `Selected: ${decision.provider} (${decision.tier} tier)`,
      `Reason: ${decision.reason}`,
    ];

    if (request.preferredProvider) {
      lines.push(
        `Preferred: ${request.preferredProvider} (${this.factory.isNativelyAvailable(request.preferredProvider) ? 'available' : 'unavailable'})`,
      );
    }

    if (this.learningStore) {
      const ranking = this.learningStore.getModelRanking(request.taskType);
      if (ranking.length > 0) {
        lines.push(
          `Historical ranking: ${ranking.map((r) => `${r.provider}/${r.model} (${r.qualityScore})`).join(', ')}`,
        );
      }
    }

    return lines.join('\n');
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private determineTier(request: RouteRequest): CostTier {
    return request.forceTier ?? DEFAULT_TASK_TIERS[request.taskType] ?? 'standard';
  }

  private applyBudgetConstraint(tier: CostTier, pipelineId?: string): CostTier {
    if (!this.costTracker || !pipelineId) return tier;

    const remaining = this.costTracker.getRemainingBudget(pipelineId);
    if (remaining === null) return tier; // No budget set

    // If less than 20% budget remaining, downgrade to cheap
    // (We can't know max budget here, so use absolute thresholds)
    if (remaining < 0.5) return 'cheap';
    if (remaining < 2.0 && tier === 'premium') return 'standard';

    return tier;
  }

  private getSuccessRate(provider: LLMProvider, taskType: string): number {
    if (!this.learningStore) return 1.0;
    return this.learningStore.getProviderSuccessRate(provider, taskType);
  }

  private providerFromString(s: string): LLMProvider | null {
    const map: Record<string, LLMProvider> = {
      claude: LLMProvider.Claude,
      openai: LLMProvider.OpenAI,
      gemini: LLMProvider.Gemini,
      perplexity: LLMProvider.Perplexity,
    };
    return map[s.toLowerCase()] ?? null;
  }
}
