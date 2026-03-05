/**
 * Forge Orchestrator — The EM (Engineering Manager) brain.
 *
 * Parses task list → groups by layer → dispatches to specialized agents
 * in parallel within each layer → collects contracts → gates between layers.
 *
 * Architecture: Amazon contract-first + Meta layered diffs + Anthropic orchestrator-workers
 */

import type { ContextLoader } from '../context-loader.js';
import { parseTasks, groupByLayer, getLayerOrder } from './task-parser.js';
import { RetroAgent } from './retro-agent.js';
import type { RetroReport } from './retro-agent.js';
import type { BuildTask, TaskBuildResult, ForgeState, ForgeMetrics, TaskTag } from './types.js';
import { BuildLayer } from './types.js';
import { DatabaseArchitect } from './agents/database-architect.js';
import { BackendEngineer } from './agents/backend-engineer.js';
import { FrontendEngineer } from './agents/frontend-engineer.js';
import { IntegrationEngineer } from './agents/integration-engineer.js';
import { PlatformEngineer } from './agents/platform-engineer.js';
import { QAEngineer } from './agents/qa-engineer.js';
import type { BuildAgent } from './build-agent.js';
import { ReviewRouter } from './review-router.js';
import type { TechStack } from '../types.js';

// ── Agent Registry ──────────────────────────────────────────────────────────

/** Map task tags to their specialist agent */
type AgentRegistry = Record<TaskTag, BuildAgent>;

function createAgentRegistry(contextLoader: ContextLoader): AgentRegistry {
  const db = new DatabaseArchitect(contextLoader);
  const be = new BackendEngineer(contextLoader);
  const fe = new FrontendEngineer(contextLoader);
  const ie = new IntegrationEngineer(contextLoader);
  const pe = new PlatformEngineer(contextLoader);
  const qa = new QAEngineer(contextLoader);

  return {
    SETUP: pe,
    CONFIG: pe,
    DATA: db,
    API: be,
    UI: fe,
    INTEGRATION: ie,
    OBS: pe,
    TEST: qa,
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export class ForgeOrchestrator {
  private contextLoader: ContextLoader;
  private agents: AgentRegistry;
  private reviewRouter: ReviewRouter;

  constructor(contextLoader: ContextLoader) {
    this.contextLoader = contextLoader;
    this.agents = createAgentRegistry(contextLoader);
    this.reviewRouter = new ReviewRouter(contextLoader);
  }

  /**
   * Execute all forge tasks in parallel layers.
   *
   * @param taskListContent - Raw content of the TASKS-*.md file
   * @param projectName - Project name for context
   * @param projectPath - Project path for file operations
   * @param techStack - Tech stack for generated code
   * @param prdContent - Optional PRD content for additional context
   * @returns Forge metrics and all task results
   */
  async forgeAll(
    taskListContent: string,
    projectName: string,
    projectPath: string,
    techStack: TechStack,
    _prdContent?: string,
  ): Promise<{ metrics: ForgeMetrics; results: TaskBuildResult[]; state: ForgeState; retro?: RetroReport }> {
    const totalStartMs = Date.now();

    // Parse tasks
    const tasks = parseTasks(taskListContent);
    if (tasks.length === 0) {
      throw new Error('No tasks found in the task list. Ensure tasks use the format: ### TASK-001: [TAG] Title');
    }

    // Group by layer
    const layers = groupByLayer(tasks);
    const layerOrder = getLayerOrder();

    // Initialize forge state
    const forgeState: ForgeState = {
      contracts: { schemas: '', apiRoutes: '', componentInterfaces: '' },
      taskResults: {},
      reviews: {},
      techStack,
      projectName,
      projectPath,
    };

    const allResults: TaskBuildResult[] = [];
    let reworkCount = 0;
    const layerTimings: Record<BuildLayer, number> = {
      [BuildLayer.Foundation]: 0,
      [BuildLayer.Backend]: 0,
      [BuildLayer.Frontend]: 0,
      [BuildLayer.Integration]: 0,
      [BuildLayer.QA]: 0,
    };

    // Execute layers sequentially, tasks within each layer in parallel
    for (const layer of layerOrder) {
      const layerTasks = layers.get(layer);
      if (!layerTasks || layerTasks.length === 0) continue;

      const layerStartMs = Date.now();

      // Dispatch all tasks in this layer in parallel
      const results = await Promise.allSettled(layerTasks.map((task) => this.buildTask(task, forgeState)));

      // Collect results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const buildResult = result.value;
          allResults.push(buildResult);
          forgeState.taskResults[buildResult.taskId] = buildResult;
        } else {
          // Promise rejection — create a failed result
          allResults.push({
            taskId: 'unknown',
            agentName: 'ForgeOrchestrator',
            output: '',
            generatedFiles: [],
            tokensUsed: 0,
            costUsd: 0,
            durationMs: 0,
            success: false,
            error: result.reason?.message ?? 'Unknown error',
          });
        }
      }

      // Extract contracts from this layer's output
      this.updateContracts(forgeState, layer, allResults);

      // Run routed reviews on completed tasks in this layer
      const layerSuccesses = allResults
        .filter((r) => r.success)
        .filter((r) => layerTasks.some((t) => t.taskId === r.taskId));

      if (layerSuccesses.length > 0) {
        const reviewResults = await Promise.allSettled(
          layerTasks
            .filter((t) => layerSuccesses.some((r) => r.taskId === t.taskId))
            .map(async (task) => {
              const buildResult = forgeState.taskResults[task.taskId];
              if (!buildResult) return [];
              return this.reviewRouter.reviewTask(task, buildResult, forgeState);
            }),
        );

        for (const reviewResult of reviewResults) {
          if (reviewResult.status === 'fulfilled') {
            for (const review of reviewResult.value) {
              forgeState.reviews[review.taskId] = review;
            }
          }
        }
      }

      // Rework loop: tasks with needs_rework get one rework pass
      const reworkTasks = layerTasks.filter((task) => {
        const review = forgeState.reviews[task.taskId];
        return review && review.verdict === 'needs_rework';
      });

      if (reworkTasks.length > 0) {
        reworkCount += reworkTasks.length;

        const reworkResults = await Promise.allSettled(reworkTasks.map((task) => this.reworkTask(task, forgeState)));

        for (const result of reworkResults) {
          if (result.status === 'fulfilled') {
            const reworkResult = result.value;
            // Replace the original result
            const idx = allResults.findIndex((r) => r.taskId === reworkResult.taskId);
            if (idx >= 0) allResults[idx] = reworkResult;
            forgeState.taskResults[reworkResult.taskId] = reworkResult;
          }
        }

        // Re-review reworked tasks
        const reworkReviewResults = await Promise.allSettled(
          reworkTasks.map(async (task) => {
            const buildResult = forgeState.taskResults[task.taskId];
            if (!buildResult?.success) return [];
            return this.reviewRouter.reviewTask(task, buildResult, forgeState);
          }),
        );

        for (const reviewResult of reworkReviewResults) {
          if (reviewResult.status === 'fulfilled') {
            for (const review of reviewResult.value) {
              forgeState.reviews[review.taskId] = review;
            }
          }
        }

        // Update contracts after rework
        this.updateContracts(forgeState, layer, allResults);
      }

      layerTimings[layer] = Date.now() - layerStartMs;
    }

    // Compute metrics
    const completedTasks = allResults.filter((r) => r.success).length;
    const failedTasks = allResults.filter((r) => !r.success).length;
    const totalTokens = allResults.reduce((sum, r) => sum + r.tokensUsed, 0);
    const totalCost = allResults.reduce((sum, r) => sum + r.costUsd, 0);

    const metrics: ForgeMetrics = {
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      totalDurationMs: Date.now() - totalStartMs,
      totalCostUsd: totalCost,
      totalTokens,
      reviewPassRate: this.computeReviewPassRate(forgeState),
      reworkCount,
      layerTimings,
    };

    // Run retrospective analysis
    let retro: RetroReport | undefined;
    try {
      const retroAgent = new RetroAgent();
      retro = await retroAgent.analyze(forgeState, metrics);

      // Persist to LearningStore
      try {
        const { getLearningStore } = await import('../../../core/learning/store.js');
        const store = getLearningStore();
        store.recordRetrospective({
          projectId: forgeState.projectPath,
          projectName: forgeState.projectName,
          totalTasks: metrics.totalTasks,
          completedTasks: metrics.completedTasks,
          failedTasks: metrics.failedTasks,
          reviewPassRate: metrics.reviewPassRate,
          reworkCount: metrics.reworkCount,
          totalDurationMs: metrics.totalDurationMs,
          totalCostUsd: metrics.totalCostUsd,
          totalTokens: metrics.totalTokens,
          successes: retro.successes,
          failures: retro.failures,
          patterns: retro.patterns,
          recommendations: retro.recommendations,
          summary: retro.summary,
        });
      } catch {
        // LearningStore may not be initialized — non-fatal
      }
    } catch {
      // Retro is non-fatal — don't fail the forge
    }

    return { metrics, results: allResults, state: forgeState, retro };
  }

  /**
   * Build a single task using the appropriate specialized agent.
   */
  private async buildTask(task: BuildTask, state: ForgeState): Promise<TaskBuildResult> {
    const agent = this.agents[task.tag];
    return agent.build(task, state);
  }

  /**
   * Rework a task by re-running the build agent with review feedback injected.
   * Capped at 1 rework pass per task (no infinite loops).
   */
  private async reworkTask(task: BuildTask, state: ForgeState): Promise<TaskBuildResult> {
    const review = state.reviews[task.taskId];
    const findings = review?.findings ?? [];
    const feedbackSummary = findings.map((f) => `[${f.severity}] ${f.category}: ${f.description}`).join('\n');

    // Create a modified task with review feedback appended to the spec
    const reworkTask: BuildTask = {
      ...task,
      spec: `${task.spec}\n\n## REWORK INSTRUCTIONS (from code review)\nThe previous implementation had the following issues. Fix ALL of them:\n${feedbackSummary}\n\nReview summary: ${review?.summary ?? 'No summary'}`,
    };

    const agent = this.agents[task.tag];
    return agent.build(reworkTask, state);
  }

  /**
   * Compute the review pass rate from completed reviews.
   */
  private computeReviewPassRate(state: ForgeState): number {
    const reviews = Object.values(state.reviews);
    if (reviews.length === 0) return 1.0;
    const passed = reviews.filter((r) => r.verdict === 'pass').length;
    return passed / reviews.length;
  }

  /**
   * Extract contracts from layer output and update ForgeState.
   * This is how later layers know what earlier layers produced.
   */
  private updateContracts(state: ForgeState, layer: BuildLayer, results: TaskBuildResult[]): void {
    const layerResults = results.filter((r) => r.success);

    switch (layer) {
      case BuildLayer.Foundation: {
        // Extract schema definitions from [DATA] task outputs
        const schemaOutput = layerResults
          .filter((r) => r.agentName === 'DatabaseArchitect')
          .map((r) => this.extractContracts(r.output, ['schema', 'model', 'type', 'interface']))
          .join('\n\n');
        if (schemaOutput) state.contracts.schemas = schemaOutput;
        break;
      }

      case BuildLayer.Backend: {
        // Extract API route definitions from [API] task outputs
        const apiOutput = layerResults
          .filter((r) => r.agentName === 'BackendEngineer')
          .map((r) => this.extractContracts(r.output, ['route', 'endpoint', 'api', 'handler']))
          .join('\n\n');
        if (apiOutput) state.contracts.apiRoutes = apiOutput;
        break;
      }

      case BuildLayer.Frontend: {
        // Extract component interfaces from [UI] task outputs
        const uiOutput = layerResults
          .filter((r) => r.agentName === 'FrontendEngineer')
          .map((r) => this.extractContracts(r.output, ['props', 'component', 'interface', 'type']))
          .join('\n\n');
        if (uiOutput) state.contracts.componentInterfaces = uiOutput;
        break;
      }

      // Integration and QA layers don't produce contracts
      default:
        break;
    }
  }

  /**
   * Extract contract-relevant sections from build output.
   * Looks for type definitions, interfaces, and schema blocks.
   */
  private extractContracts(output: string, keywords: string[]): string {
    const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
    const contractParts: string[] = [];
    let match;

    while ((match = fileRegex.exec(output)) !== null) {
      const filePath = match[1].trim().toLowerCase();
      const content = match[2];

      // Include files that contain contract-relevant content
      const isContractFile = keywords.some((kw) => filePath.includes(kw) || filePath.endsWith('.d.ts'));

      if (isContractFile) {
        contractParts.push(`// From: ${match[1].trim()}\n${content}`);
      }
    }

    return contractParts.join('\n\n');
  }
}
