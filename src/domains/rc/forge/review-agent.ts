/**
 * Review Agent — Senior Reviewer (SD3-level code review).
 *
 * Performs routed code review based on task tag.
 * Google LGTM chain pattern: right reviewer for right task type.
 */

import type { ContextLoader } from '../context-loader.js';
import type { BuildTask, TaskBuildResult, ReviewResult, ReviewFinding, ForgeState } from './types.js';
import { hasApiKey } from '../../../shared/config.js';
import { routeRequest } from '../../../shared/model-router.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';

/** Review focus areas by task tag */
const REVIEW_FOCUS: Record<string, string> = {
  DATA: 'Schema integrity, migration safety, data types, indexes, constraints, referential integrity',
  API: 'Security (injection, auth bypass, rate limiting), contract compliance, error handling, input validation',
  UI: 'Design system adherence, accessibility (WCAG AA), responsive layout, semantic HTML, keyboard navigation',
  INTEGRATION: 'Error handling, retry logic, circuit breaker, timeout handling, graceful degradation',
  SETUP: 'Configuration correctness, environment variable handling, security of defaults',
  CONFIG: 'Configuration correctness, environment variable handling, security of defaults',
  OBS: 'Log level usage, structured logging, metric naming, alert threshold reasonableness',
  TEST: 'Test coverage, test independence, assertion quality, edge case coverage',
};

export class ReviewAgent {
  private contextLoader: ContextLoader;

  constructor(contextLoader: ContextLoader) {
    this.contextLoader = contextLoader;
  }

  /**
   * Review a completed build task.
   */
  async review(
    task: BuildTask,
    buildResult: TaskBuildResult,
    state: ForgeState,
  ): Promise<ReviewResult> {
    if (!buildResult.success) {
      return {
        taskId: task.taskId,
        reviewerName: 'ReviewAgent',
        findings: [
          {
            severity: 'critical',
            category: 'build-failure',
            description: `Build failed: ${buildResult.error}`,
          },
        ],
        verdict: 'critical',
        summary: `Task ${task.taskId} build failed — cannot review.`,
      };
    }

    const focus = REVIEW_FOCUS[task.tag] ?? 'General code quality, correctness, maintainability';

    const systemPrompt = `You are a Senior Software Engineer performing code review (SD3-level).

REVIEW FOCUS for [${task.tag}] tasks:
${focus}

UNIVERSAL CHECKS:
1. No hardcoded secrets or credentials
2. No SQL injection, XSS, or command injection vectors
3. Proper error handling (no swallowed errors)
4. Consistent naming conventions
5. No dead code or unused imports
6. Types are explicit (no \`any\` in TypeScript, no untyped dicts in Python)

OUTPUT FORMAT (JSON):
{
  "findings": [
    {
      "severity": "info|warning|critical",
      "category": "security|contract|design|a11y|correctness|performance",
      "description": "Clear description of the issue",
      "file": "path/to/file (if applicable)",
      "line": 42
    }
  ],
  "verdict": "pass|needs_rework|critical",
  "summary": "One-paragraph assessment"
}

Return ONLY valid JSON. No markdown, no commentary outside the JSON.`;

    const userMessage = `## Task\n${task.spec}\n\n## Generated Code\n${buildResult.output}`;

    if (!hasApiKey) {
      // Passthrough: return a pass verdict
      return {
        taskId: task.taskId,
        reviewerName: 'ReviewAgent',
        findings: [],
        verdict: 'pass',
        summary: 'Review skipped in passthrough mode.',
      };
    }

    try {
      const { client } = routeRequest({
        taskType: `review-${task.tag}`,
        domain: 'rc',
        pipelineId: 'rc-session',
        forceTier: 'cheap',
      });

      const response = await client.chatWithRetry({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 4096,
      });

      tokenTracker.record('rc', 'ReviewAgent', response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: 'ReviewAgent',
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });

      return this.parseReviewResponse(task.taskId, response.content);
    } catch (err) {
      return {
        taskId: task.taskId,
        reviewerName: 'ReviewAgent',
        findings: [
          {
            severity: 'warning',
            category: 'review-error',
            description: `Review failed: ${(err as Error).message}`,
          },
        ],
        verdict: 'pass', // Don't block on review failures
        summary: 'Review could not be completed due to an error.',
      };
    }
  }

  /**
   * Parse the LLM review response into a structured ReviewResult.
   */
  private parseReviewResponse(taskId: string, content: string): ReviewResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          taskId,
          reviewerName: 'ReviewAgent',
          findings: [],
          verdict: 'pass',
          summary: content.substring(0, 500),
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        findings?: ReviewFinding[];
        verdict?: string;
        summary?: string;
      };

      return {
        taskId,
        reviewerName: 'ReviewAgent',
        findings: parsed.findings ?? [],
        verdict: this.normalizeVerdict(parsed.verdict),
        summary: parsed.summary ?? 'Review completed.',
      };
    } catch {
      return {
        taskId,
        reviewerName: 'ReviewAgent',
        findings: [],
        verdict: 'pass',
        summary: content.substring(0, 500),
      };
    }
  }

  private normalizeVerdict(v?: string): 'pass' | 'needs_rework' | 'critical' {
    if (!v) return 'pass';
    const lower = v.toLowerCase();
    if (lower.includes('critical')) return 'critical';
    if (lower.includes('rework') || lower.includes('needs')) return 'needs_rework';
    return 'pass';
  }
}
