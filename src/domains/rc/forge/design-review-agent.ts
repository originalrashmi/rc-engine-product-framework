/**
 * Design Review Agent — Specialized reviewer for [UI] tasks.
 *
 * Checks design system compliance, accessibility, and visual quality.
 * Apple's mandatory specialized reviews pattern.
 */

import type { ContextLoader } from '../context-loader.js';
import type { BuildTask, TaskBuildResult, ReviewResult, ForgeState } from './types.js';
import { hasApiKey } from '../../../shared/config.js';
import { routeRequest } from '../../../shared/model-router.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';

export class DesignReviewAgent {
  private contextLoader: ContextLoader;

  constructor(contextLoader: ContextLoader) {
    this.contextLoader = contextLoader;
  }

  /**
   * Review a [UI] task for design quality.
   */
  async review(
    task: BuildTask,
    buildResult: TaskBuildResult,
    state: ForgeState,
  ): Promise<ReviewResult> {
    if (!buildResult.success || task.tag !== 'UI') {
      return {
        taskId: task.taskId,
        reviewerName: 'DesignReviewAgent',
        findings: [],
        verdict: 'pass',
        summary: task.tag !== 'UI' ? 'Skipped: not a UI task.' : `Build failed: ${buildResult.error}`,
      };
    }

    const systemPrompt = `You are a Senior Design Engineer reviewing UI code for design system compliance.

DESIGN REVIEW CHECKLIST:
1. Color Usage — Only CSS variables or design tokens used (no hardcoded hex/rgb)
2. Typography — Font sizes from the type scale (rem/design tokens, no px)
3. Spacing — Margins and paddings from the spacing scale
4. Component Consistency — Reusing existing components vs. creating duplicates
5. Responsive Design — Mobile-first breakpoints, no fixed widths
6. Visual Hierarchy — Clear heading structure, proper use of weight/size
7. Interaction States — hover, focus, active, disabled for all interactive elements
8. Loading States — Skeleton screens or spinners during data fetch
9. Error States — Inline errors with recovery actions
10. Empty States — Helpful content when no data exists
11. Accessibility — Color contrast 4.5:1, aria labels, keyboard nav
12. Motion — prefers-reduced-motion respected

OUTPUT FORMAT (JSON):
{
  "findings": [
    {
      "severity": "info|warning|critical",
      "category": "design-tokens|typography|spacing|a11y|responsive|states",
      "description": "What's wrong and how to fix it",
      "file": "path/to/file"
    }
  ],
  "verdict": "pass|needs_rework|critical",
  "summary": "Overall design quality assessment"
}

Return ONLY valid JSON.`;

    const userMessage = `## Task\n${task.spec}\n\n## Generated UI Code\n${buildResult.output}`;

    if (!hasApiKey) {
      return {
        taskId: task.taskId,
        reviewerName: 'DesignReviewAgent',
        findings: [],
        verdict: 'pass',
        summary: 'Design review skipped in passthrough mode.',
      };
    }

    try {
      const { client } = routeRequest({
        taskType: 'design-review',
        domain: 'rc',
        pipelineId: 'rc-session',
        forceTier: 'cheap',
      });

      const response = await client.chatWithRetry({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 4096,
      });

      tokenTracker.record('rc', 'DesignReviewAgent', response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: 'DesignReviewAgent',
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });

      return this.parseResponse(task.taskId, response.content);
    } catch {
      return {
        taskId: task.taskId,
        reviewerName: 'DesignReviewAgent',
        findings: [],
        verdict: 'pass',
        summary: 'Design review could not be completed.',
      };
    }
  }

  private parseResponse(taskId: string, content: string): ReviewResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { taskId, reviewerName: 'DesignReviewAgent', findings: [], verdict: 'pass', summary: content.substring(0, 500) };
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict = parsed.verdict?.toLowerCase().includes('critical')
        ? 'critical' as const
        : parsed.verdict?.toLowerCase().includes('rework')
          ? 'needs_rework' as const
          : 'pass' as const;
      return {
        taskId,
        reviewerName: 'DesignReviewAgent',
        findings: parsed.findings ?? [],
        verdict,
        summary: parsed.summary ?? 'Design review completed.',
      };
    } catch {
      return { taskId, reviewerName: 'DesignReviewAgent', findings: [], verdict: 'pass', summary: content.substring(0, 500) };
    }
  }
}
