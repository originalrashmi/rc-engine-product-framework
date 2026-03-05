/**
 * Review Router — Pluggable review dispatch.
 *
 * Uses RC-native review agents. In the future, can detect and delegate to
 * Compound Engineering agents when available for enhanced review depth.
 */

import type { ContextLoader } from '../context-loader.js';
import type { BuildTask, TaskBuildResult, ReviewResult, ForgeState } from './types.js';
import { ReviewAgent } from './review-agent.js';
import { DesignReviewAgent } from './design-review-agent.js';

export class ReviewRouter {
  private reviewAgent: ReviewAgent;
  private designReviewAgent: DesignReviewAgent;

  constructor(contextLoader: ContextLoader) {
    this.reviewAgent = new ReviewAgent(contextLoader);
    this.designReviewAgent = new DesignReviewAgent(contextLoader);
  }

  /**
   * Route a task to the appropriate reviewer(s).
   *
   * [UI] tasks get both a code review AND a design review.
   * All other tasks get a code review only.
   */
  async reviewTask(
    task: BuildTask,
    buildResult: TaskBuildResult,
    state: ForgeState,
  ): Promise<ReviewResult[]> {
    const reviews: ReviewResult[] = [];

    // All tasks get a code review
    const codeReview = await this.reviewAgent.review(task, buildResult, state);
    reviews.push(codeReview);

    // [UI] tasks also get a design review
    if (task.tag === 'UI') {
      const designReview = await this.designReviewAgent.review(task, buildResult, state);
      reviews.push(designReview);
    }

    return reviews;
  }

  /**
   * Determine the aggregate verdict from multiple reviews.
   */
  aggregateVerdict(reviews: ReviewResult[]): 'pass' | 'needs_rework' | 'critical' {
    if (reviews.some((r) => r.verdict === 'critical')) return 'critical';
    if (reviews.some((r) => r.verdict === 'needs_rework')) return 'needs_rework';
    return 'pass';
  }
}
