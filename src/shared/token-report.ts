/**
 * Token Usage Report -- User-facing visibility into where tokens are being consumed.
 *
 * Aggregates data from TokenTracker (counts), CostTracker (USD costs),
 * and cache stats (savings) into a single, human-readable report that
 * surfaces in tool responses and status commands.
 *
 * Design principle: Users should never wonder "where did my tokens go?"
 * Every LLM call is attributable to a domain, tool, and provider.
 */

import { tokenTracker } from './token-tracker.js';
import { getCostTracker } from './cost-tracker.js';
import type { CostSummary } from '../core/budget/cost-tracker.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TokenReport {
  /** Total tokens consumed this session. */
  totalTokens: number;
  /** Breakdown: input vs output. */
  inputTokens: number;
  outputTokens: number;
  /** Total LLM calls made. */
  totalCalls: number;
  /** Total estimated cost in USD. */
  totalCostUsd: number;
  /** Prompt cache stats. */
  cache: {
    /** Tokens written to cache (first-time system prompt). */
    created: number;
    /** Tokens read from cache (saved on repeat calls). */
    read: number;
    /** Percentage of input tokens served from cache. */
    hitRate: number;
    /** Estimated USD saved by caching (cache reads at 10% of input cost). */
    estimatedSavingsUsd: number;
  };
  /** Per-domain breakdown. */
  byDomain: Record<string, { calls: number; tokens: number; costUsd: number }>;
  /** Per-provider breakdown. */
  byProvider: Record<string, { calls: number; tokens: number; costUsd: number }>;
  /** Optimization warnings. */
  warnings: string[];
}

// ── Report Builder ──────────────────────────────────────────────────────────

/** Build a comprehensive token report from all tracking sources. */
export function buildTokenReport(): TokenReport {
  const total = tokenTracker.getTotalTokens();
  const byDomain = tokenTracker.getTokensByDomain();
  const byProvider = tokenTracker.getTokensByProvider();
  const calls = tokenTracker.getCallsByDomain();
  const cache = tokenTracker.getCacheStats();

  let costSummary: CostSummary | null = null;
  try {
    const tracker = getCostTracker();
    costSummary = tracker.getSummary();
  } catch {
    // CostTracker may not be initialized
  }

  // Estimate cache savings: cached tokens cost 10% of normal input rate.
  // Average input cost ~$3/MTok, so saving = cacheRead * ($3 - $0.30) / 1M = cacheRead * $2.70/MTok
  const estimatedSavingsUsd = (cache.read / 1_000_000) * 2.7;

  const warnings: string[] = [];

  // Warn if no caching is happening after multiple calls
  const totalCalls = costSummary?.totalCalls ?? 0;
  if (totalCalls > 3 && cache.read === 0 && cache.created === 0) {
    warnings.push('Prompt caching inactive — system prompts are being recomputed on every call. Check claude-client.ts.');
  }

  // Warn if output tokens dominate (possible maxTokens over-allocation)
  const inputTokens = costSummary?.totalInputTokens ?? 0;
  const outputTokens = costSummary?.totalOutputTokens ?? 0;
  if (outputTokens > 0 && inputTokens > 0 && outputTokens > inputTokens * 2) {
    warnings.push(
      `Output tokens (${outputTokens.toLocaleString()}) are ${Math.round(outputTokens / inputTokens)}x input tokens — ` +
      `consider if maxTokens limits are appropriately sized.`,
    );
  }

  // Warn if a single domain consumes >60% of total
  for (const [domain, tokens] of Object.entries(byDomain)) {
    if (total > 0 && tokens / total > 0.6 && totalCalls > 5) {
      warnings.push(
        `Domain "${domain}" accounts for ${Math.round((tokens / total) * 100)}% of total tokens — review if all calls are necessary.`,
      );
    }
  }

  // Build domain breakdown with cost data
  const domainReport: Record<string, { calls: number; tokens: number; costUsd: number }> = {};
  for (const [domain, tokens] of Object.entries(byDomain)) {
    domainReport[domain] = {
      calls: calls[domain] ?? 0,
      tokens,
      costUsd: costSummary?.byDomain[domain]?.costUsd ?? 0,
    };
  }

  // Build provider breakdown with cost data
  const providerReport: Record<string, { calls: number; tokens: number; costUsd: number }> = {};
  for (const [provider, tokens] of Object.entries(byProvider)) {
    providerReport[provider] = {
      calls: costSummary?.byProvider[provider]?.calls ?? 0,
      tokens,
      costUsd: costSummary?.byProvider[provider]?.costUsd ?? 0,
    };
  }

  return {
    totalTokens: total,
    inputTokens: costSummary?.totalInputTokens ?? 0,
    outputTokens: costSummary?.totalOutputTokens ?? 0,
    totalCalls: costSummary?.totalCalls ?? totalCalls,
    totalCostUsd: costSummary?.totalCostUsd ?? 0,
    cache: {
      created: cache.created,
      read: cache.read,
      hitRate: cache.savedPercent,
      estimatedSavingsUsd,
    },
    byDomain: domainReport,
    byProvider: providerReport,
    warnings,
  };
}

// ── Formatter ───────────────────────────────────────────────────────────────

/** Format a token report as a human-readable string for tool output. */
export function formatTokenReport(report?: TokenReport): string {
  const r = report ?? buildTokenReport();

  if (r.totalCalls === 0) {
    return '';
  }

  const lines: string[] = [
    '',
    '  TOKEN USAGE:',
    `    Total:    ${r.totalTokens.toLocaleString()} tokens ($${r.totalCostUsd.toFixed(4)})`,
    `    Input:    ${r.inputTokens.toLocaleString()} tokens`,
    `    Output:   ${r.outputTokens.toLocaleString()} tokens`,
    `    Calls:    ${r.totalCalls}`,
  ];

  // Cache section
  if (r.cache.created > 0 || r.cache.read > 0) {
    lines.push(
      '    Cache:',
      `      Hit rate: ${r.cache.hitRate}% of input from cache`,
      `      Saved:   ~$${r.cache.estimatedSavingsUsd.toFixed(4)} (${r.cache.read.toLocaleString()} cached tokens)`,
    );
  }

  // Domain breakdown
  const domains = Object.entries(r.byDomain);
  if (domains.length > 1) {
    lines.push('    By domain:');
    for (const [domain, d] of domains) {
      const pct = r.totalTokens > 0 ? Math.round((d.tokens / r.totalTokens) * 100) : 0;
      lines.push(`      ${domain}: ${d.tokens.toLocaleString()} (${pct}%, ${d.calls} calls, $${d.costUsd.toFixed(4)})`);
    }
  }

  // Provider breakdown
  const providers = Object.entries(r.byProvider);
  if (providers.length > 1) {
    lines.push('    By provider:');
    for (const [provider, p] of providers) {
      lines.push(`      ${provider}: ${p.tokens.toLocaleString()} (${p.calls} calls, $${p.costUsd.toFixed(4)})`);
    }
  }

  // Warnings
  if (r.warnings.length > 0) {
    lines.push('    Optimization warnings:');
    for (const w of r.warnings) {
      lines.push(`      ⚠ ${w}`);
    }
  }

  return lines.join('\n');
}
