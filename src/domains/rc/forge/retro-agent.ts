/**
 * Retro Agent — Retrospective analysis after forge completion.
 *
 * Analyzes what went well, what went wrong, and produces actionable
 * recommendations for improving future builds.
 */

import type { ForgeState, ForgeMetrics } from './types.js';
import { hasApiKey } from '../../../shared/config.js';
import { routeRequest } from '../../../shared/model-router.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';

export interface RetroReport {
  projectName: string;
  /** What went well */
  successes: string[];
  /** What went wrong */
  failures: string[];
  /** Recurring patterns across agents */
  patterns: string[];
  /** Actionable recommendations for next build */
  recommendations: string[];
  /** Summary text */
  summary: string;
  /** Metrics snapshot */
  metrics: ForgeMetrics;
}

export class RetroAgent {
  /**
   * Run retrospective analysis on completed forge results.
   */
  async analyze(state: ForgeState, metrics: ForgeMetrics): Promise<RetroReport> {
    // Gather data for the retro
    const successes: string[] = [];
    const failures: string[] = [];
    const patterns: string[] = [];

    // Analyze task results
    for (const [taskId, result] of Object.entries(state.taskResults)) {
      if (result.success) {
        successes.push(
          `${taskId} (${result.agentName}): completed in ${(result.durationMs / 1000).toFixed(1)}s, ${result.generatedFiles.length} files`,
        );
      } else {
        failures.push(`${taskId} (${result.agentName}): FAILED — ${result.error}`);
      }
    }

    // Analyze reviews
    const reviews = Object.values(state.reviews);
    const criticalReviews = reviews.filter((r) => r.verdict === 'critical');
    const reworkReviews = reviews.filter((r) => r.verdict === 'needs_rework');

    if (criticalReviews.length > 0) {
      failures.push(`${criticalReviews.length} tasks received critical review findings`);
    }
    if (reworkReviews.length > 0) {
      patterns.push(`${reworkReviews.length} tasks needed rework`);
    }

    // Detect patterns in review findings
    const allFindings = reviews.flatMap((r) => r.findings);
    const categoryCount: Record<string, number> = {};
    for (const finding of allFindings) {
      categoryCount[finding.category] = (categoryCount[finding.category] ?? 0) + 1;
    }
    for (const [category, count] of Object.entries(categoryCount)) {
      if (count >= 2) {
        patterns.push(`Recurring ${category} issues (${count} findings across tasks)`);
      }
    }

    // Generate recommendations via LLM (if available)
    let recommendations: string[];
    let summary: string;

    if (hasApiKey && (failures.length > 0 || patterns.length > 0)) {
      const retroAnalysis = await this.generateRetroAnalysis(state, metrics, successes, failures, patterns);
      recommendations = retroAnalysis.recommendations;
      summary = retroAnalysis.summary;
    } else {
      summary = this.generateLocalSummary(metrics, successes, failures, patterns);
      recommendations = this.generateLocalRecommendations(patterns, failures);
    }

    return {
      projectName: state.projectName,
      successes,
      failures,
      patterns,
      recommendations,
      summary,
      metrics,
    };
  }

  /**
   * Use LLM to generate deeper retrospective analysis.
   */
  private async generateRetroAnalysis(
    state: ForgeState,
    metrics: ForgeMetrics,
    successes: string[],
    failures: string[],
    patterns: string[],
  ): Promise<{ recommendations: string[]; summary: string }> {
    try {
      const { client } = routeRequest({
        taskType: 'retro-analysis',
        domain: 'rc',
        pipelineId: 'rc-session',
        forceTier: 'cheap',
      });

      const prompt = `Analyze this build retrospective and provide actionable recommendations.

## Metrics
- Tasks: ${metrics.completedTasks}/${metrics.totalTasks} completed, ${metrics.failedTasks} failed
- Duration: ${(metrics.totalDurationMs / 1000).toFixed(1)}s
- Cost: $${metrics.totalCostUsd.toFixed(4)}
- Review pass rate: ${(metrics.reviewPassRate * 100).toFixed(0)}%

## Successes
${successes.map((s) => `- ${s}`).join('\n')}

## Failures
${failures.map((f) => `- ${f}`).join('\n')}

## Patterns
${patterns.map((p) => `- ${p}`).join('\n')}

Output JSON:
{
  "recommendations": ["Actionable improvement 1", "Actionable improvement 2"],
  "summary": "One paragraph summary of the build quality and key takeaways"
}`;

      const response = await client.chatWithRetry({
        systemPrompt: 'You are a build quality analyst. Return ONLY valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2048,
      });

      tokenTracker.record('rc', 'RetroAgent', response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: 'RetroAgent',
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          recommendations: parsed.recommendations ?? [],
          summary: parsed.summary ?? '',
        };
      }
    } catch {
      // Fall through to local generation
    }

    return {
      recommendations: this.generateLocalRecommendations(patterns, failures),
      summary: this.generateLocalSummary(metrics, successes, failures, patterns),
    };
  }

  private generateLocalSummary(
    metrics: ForgeMetrics,
    successes: string[],
    failures: string[],
    patterns: string[],
  ): string {
    const passRate = metrics.totalTasks > 0 ? ((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(0) : '0';
    return `Build completed: ${metrics.completedTasks}/${metrics.totalTasks} tasks (${passRate}% success rate), ${failures.length} failures, ${patterns.length} recurring patterns detected. Review pass rate: ${(metrics.reviewPassRate * 100).toFixed(0)}%.`;
  }

  private generateLocalRecommendations(patterns: string[], failures: string[]): string[] {
    const recs: string[] = [];
    if (failures.length > 0) {
      recs.push('Investigate failed tasks and fix root causes before next build');
    }
    if (patterns.some((p) => p.includes('security'))) {
      recs.push('Add security-focused system prompt additions to backend agent');
    }
    if (patterns.some((p) => p.includes('a11y') || p.includes('accessibility'))) {
      recs.push('Strengthen accessibility rules in frontend agent system prompt');
    }
    if (patterns.some((p) => p.includes('design'))) {
      recs.push('Review design token usage rules — agents may need stricter enforcement');
    }
    return recs;
  }
}
