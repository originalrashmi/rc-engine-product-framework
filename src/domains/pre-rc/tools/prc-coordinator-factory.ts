/**
 * Factory for creating Pre-RC coordinators with real handlers.
 *
 * Each handler wraps the actual domain logic (classification, persona execution,
 * synthesis) so the graph coordinator IS the execution path, not a shadow system.
 * The graph drives gate lifecycle, state persistence, and node ordering.
 */

import { PreRcCoordinator } from '../graph/pre-rc-coordinator.js';
import type { PreRcNodeHandlers } from '../graph/pre-rc-graph.js';
import type { ComplexityClassifier } from '../complexity-classifier.js';
import type { PersonaSelector } from '../persona-selector.js';
import type { AgentFactory } from '../agents/agent-factory.js';
import type { StatePersistence } from '../state/state-persistence.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';
import type { ResearchState, ResearchArtifact, ResearchStage } from '../types.js';
import { StageStatus } from '../types.js';
import { ResearchStateManager } from '../state/research-state.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import { bridgeGraphToEventBus } from '../../../shared/graph-bridge.js';
import { hasFeature } from '../../../core/pricing/index.js';
import { getUsageMeter } from '../../../shared/usage-meter.js';

export interface PreRcDependencies {
  persistence: StatePersistence;
  classifier: ComplexityClassifier;
  selector: PersonaSelector;
  agentFactory: AgentFactory;
  llmFactory: LLMFactory;
  contextLoader: ContextLoader;
  /** User ID for tier-gated features. Defaults to 'operator' if not set. */
  userId?: string;
}

/**
 * Create the Pre-RC node handlers that wrap domain logic.
 *
 * Exported so both the coordinator and direct tool calls (e.g. prc_run_stage
 * for individual re-runs) use the SAME handler implementation.
 * This eliminates duplicate persona execution logic.
 */
export function createPreRcHandlers(deps: PreRcDependencies): PreRcNodeHandlers {
  return {
    /**
     * Classify handler: runs complexity classification + persona selection.
     * Writes classification artifacts to disk via persistence.
     */
    classify: async (state) => {
      tokenTracker.setProjectPath(state.projectPath);

      const classification = await deps.classifier.classify(state.brief);
      const selection = deps.selector.select(classification);

      const updated: ResearchState = {
        ...state,
        classification,
        personaSelection: selection,
        updatedAt: new Date().toISOString(),
      };

      // Write classification artifacts to disk
      await deps.persistence.writeArtifact(
        state.projectPath,
        'classification.md',
        buildClassificationReport(classification, selection),
      );
      await deps.persistence.writeArtifact(
        state.projectPath,
        'persona-selection.md',
        buildSelectionReport(selection, deps.selector),
      );

      return { state: updated };
    },

    /**
     * Stage handler factory: returns an execute function for each stage.
     * Runs all activated personas for the stage in parallel, collects artifacts.
     */
    runStage: (stage: ResearchStage) => async (state) => {
      tokenTracker.setProjectPath(state.projectPath);

      const stageConfigs = deps.selector.getConfigsByStage(stage);
      const activeIds = state.personaSelection?.activePersonas ?? [];
      const activeConfigs = stageConfigs.filter((c) => c.alwaysRuns || activeIds.includes(c.id));

      if (activeConfigs.length === 0) {
        // Skip stage - no active personas
        return {
          state: {
            ...state,
            stageStatus: { ...state.stageStatus, [stage]: StageStatus.Skipped },
            updatedAt: new Date().toISOString(),
          },
        };
      }

      // Mark stage in progress
      const inProgressState: ResearchState = {
        ...state,
        currentStage: stage,
        stageStatus: { ...state.stageStatus, [stage]: StageStatus.InProgress },
        updatedAt: new Date().toISOString(),
      };

      // Execute personas in parallel
      const stateManager = ResearchStateManager.fromState(inProgressState);
      const context = {
        state: stateManager.getState(),
        previousArtifacts: stateManager.getAllArtifacts(),
      };

      const executions = activeConfigs.map(async (config) => {
        const agent = deps.agentFactory.create(config);
        const result = await agent.execute(context);
        return { config, result };
      });

      const settled = await Promise.allSettled(executions);
      const newArtifacts: ResearchArtifact[] = [];
      let succeededCount = 0;

      for (const outcome of settled) {
        if (outcome.status === 'rejected') continue;

        const { config, result } = outcome.value;

        if (result.tokensUsed > 0) {
          tokenTracker.record('pre-rc', `prc_run_stage:${config.id}`, result.tokensUsed, result.llmUsed);
          recordCost({
            pipelineId: state.projectPath,
            domain: 'pre-rc',
            tool: `prc_run_stage:${config.id}`,
            provider: result.llmUsed,
            model: '',
            inputTokens: 0,
            outputTokens: result.tokensUsed,
          });
          recordModelPerformance({
            provider: result.llmUsed,
            model: '',
            taskType: `prc-persona-${config.id}`,
            tokensUsed: result.tokensUsed,
            success: result.success,
          });
        }

        if (result.success) {
          succeededCount++;
          const artifactPath = `${stage}/${config.id}.md`;
          const artifactContent = `# ${config.name}\n\n**Stage:** ${stage}\n**LLM:** ${result.llmUsed}\n**Mode:** ${result.mode}\n**Tokens:** ${result.tokensUsed}\n**Generated:** ${new Date().toISOString()}\n\n---\n\n${result.content}`;

          const fullPath = await deps.persistence.writeArtifact(state.projectPath, artifactPath, artifactContent);

          newArtifacts.push({
            personaId: config.id,
            personaName: config.name,
            stage,
            content: result.content,
            tokenCount: result.tokensUsed,
            llmUsed: result.llmUsed,
            timestamp: new Date().toISOString(),
            filePath: fullPath,
          });
        }
      }

      // Determine stage status
      const stageStatus = succeededCount > 0 ? StageStatus.Completed : StageStatus.NotStarted;

      return {
        state: {
          ...inProgressState,
          stageStatus: { ...inProgressState.stageStatus, [stage]: stageStatus },
          artifacts: [...inProgressState.artifacts, ...newArtifacts],
          updatedAt: new Date().toISOString(),
        },
      };
    },

    /**
     * Synthesize handler: combines all research into PRD deliverables.
     *
     * Delegates to prcSynthesize (the same logic the tool uses) so the
     * graph is the single execution path. Before calling synthesis, we
     * sync state to StatePersistence so the synthesis function reads
     * current data (including stage-6 results from this graph run).
     *
     * The output text is stored in _synthesisOutput for the tool layer
     * to return to the user.
     */
    synthesize: async (state) => {
      // Lazy import to avoid circular dependency at module load time
      const { prcSynthesize } = await import('./prc-synthesize.js');

      // Sync state to StatePersistence so prcSynthesize reads current data.
      // The graph has been running stages and updating state in memory,
      // but StatePersistence only has the last tool-level save.
      await deps.persistence.save(state);

      try {
        const output = await prcSynthesize(deps.persistence, deps.llmFactory, deps.contextLoader, state.projectPath);
        return {
          state: { ...state, _synthesisOutput: output, updatedAt: new Date().toISOString() },
        };
      } catch (err) {
        // Store error in state but don't crash the graph
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[pre-rc] Synthesis failed in graph handler: ${errMsg}`);
        return {
          state: {
            ...state,
            _synthesisOutput: `Synthesis failed: ${errMsg}. Run prc_synthesize manually to retry.`,
            updatedAt: new Date().toISOString(),
          },
        };
      }
    },

    /**
     * Stress test handler: runs Idea Stress Test after synthesis (Pro/Enterprise only).
     *
     * Checks the user's tier before executing. If the tier does not include the
     * stressTest feature, the handler returns state unchanged (no-op).
     */
    stressTest: async (state) => {
      const userId = deps.userId ?? 'operator';
      const tier = getUsageMeter().getUserTier(userId);

      if (!hasFeature(tier, 'stressTest')) {
        // Non-Pro users: skip silently, graph continues
        return { state };
      }

      const { prcStressTest } = await import('./prc-stress-test.js');
      await deps.persistence.save(state);

      try {
        const output = await prcStressTest(deps.persistence, deps.llmFactory, deps.contextLoader, state.projectPath);
        // Reload state to pick up verdict fields written by prcStressTest
        const stateManager = await deps.persistence.load(state.projectPath);
        const updatedState = stateManager ? stateManager.getState() : state;
        return {
          state: { ...updatedState, _stressTestOutput: output, updatedAt: new Date().toISOString() },
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[pre-rc] Stress test failed in graph handler: ${errMsg}`);
        return { state: { ...state, updatedAt: new Date().toISOString() } };
      }
    },
  };
}

/**
 * Create a PreRcCoordinator with real handlers that wrap domain logic.
 *
 * The handlers modify ResearchState directly - the coordinator persists
 * state through CheckpointStore after each node completes (via onNodeComplete).
 */
export function createPreRcCoordinator(deps: PreRcDependencies): PreRcCoordinator {
  const coordinator = new PreRcCoordinator(createPreRcHandlers(deps));
  // Bridge graph events to the global EventBus for observability
  bridgeGraphToEventBus(coordinator.graphRunner, 'pre-rc');
  return coordinator;
}

// ── Artifact formatters ─────────────────────────────────────────────────────

function buildClassificationReport(
  c: ResearchState['classification'],
  selection: ResearchState['personaSelection'],
): string {
  if (!c || !selection) return '';
  return `# Complexity Classification Report

**Domain:** ${c.domain}
**Confidence:** ${(c.confidence * 100).toFixed(0)}%
**Product Class:** ${c.productClass}

## Reasoning

${c.reasoning}

## Complexity Factors

${c.complexityFactors.map((f: string) => `- ${f}`).join('\n')}

## Persona Impact

- **Personas activated:** ${selection.totalActive}
- **Personas skipped:** ${selection.totalSkipped}
`;
}

function buildSelectionReport(selection: ResearchState['personaSelection'], selector: PersonaSelector): string {
  if (!selection) return '';
  const lines: string[] = ['# Persona Selection Report\n'];

  lines.push(`**Total Active:** ${selection.totalActive}`);
  lines.push(`**Total Skipped:** ${selection.totalSkipped}\n`);

  lines.push('## Active Personas\n');
  for (const id of selection.activePersonas) {
    const config = selector.getConfig(id);
    if (config) {
      lines.push(`- **${config.name}** (${config.stage}) - LLM: ${config.llmProvider}`);
    }
  }

  if (selection.skippedPersonas.length > 0) {
    lines.push('\n## Skipped Personas\n');
    for (const skip of selection.skippedPersonas) {
      const config = selector.getConfig(skip.id);
      lines.push(`- **${config?.name || skip.id}** - ${skip.reason}`);
    }
  }

  return lines.join('\n');
}
