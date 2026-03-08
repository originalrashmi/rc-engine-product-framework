/**
 * Run a single research stage via the shared Pre-RC handler.
 *
 * Delegates to the same handler used by the graph coordinator.
 * This eliminates duplicate persona execution logic - there is ONE
 * implementation of stage execution (in prc-coordinator-factory.ts).
 *
 * Use cases:
 * - Normal flow: gate approval runs stages automatically via coordinator.resume()
 * - Re-run: this tool re-runs a specific stage outside the graph lifecycle.
 */

import type { ResearchArtifact } from '../types.js';
import { ResearchStage } from '../types.js';
import { StageStatus } from '../types.js';
import type { PreRcDependencies } from './prc-coordinator-factory.js';
import { createPreRcHandlers } from './prc-coordinator-factory.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { formatCostSummary } from '../../../shared/cost-tracker.js';
import { audit } from '../../../shared/audit.js';

// Plain-language stage names (vocabulary mapping per conversation-ux.md)
const STAGE_LABELS: Record<string, string> = {
  'stage-1-meta': 'Project Strategy',
  'stage-2-user-intelligence': 'User Research',
  'stage-3-market-business': 'Market & Business Analysis',
  'stage-4-technical': 'Technical Feasibility',
  'stage-5-ux-cognitive': 'UX & Design Analysis',
  'stage-6-validation': 'Quality Validation',
};

export async function prcRunStage(deps: PreRcDependencies, projectPath: string, stageInput: string): Promise<string> {
  const stateManager = await deps.persistence.load(projectPath);
  if (!stateManager) {
    throw new Error('Research not initialized. Run prc_start first.');
  }

  const state = stateManager.getState();
  tokenTracker.setProjectPath(projectPath);

  // Validate stage
  const stage = stageInput as ResearchStage;
  const validStages = Object.values(ResearchStage);
  if (!validStages.includes(stage)) {
    return `Invalid stage: "${stageInput}". Valid stages:\n${validStages.map((s) => `  - ${s}`).join('\n')}`;
  }

  // Check prerequisites
  if (!state.classification) {
    throw new Error(
      'Complexity classification is required first. Analyze the project complexity before running research.',
    );
  }

  if (!state.personaSelection) {
    throw new Error(
      'Research specialist selection is required first. Analyze the project complexity before running research.',
    );
  }

  // Check gate requirements
  if (stage !== ResearchStage.MetaOrchestration && !stateManager.isGateApproved(1)) {
    throw new Error('Checkpoint 1 must be approved before running research stages.');
  }

  if (stage === ResearchStage.UXCognitive && !stateManager.isGateApproved(2)) {
    throw new Error('Checkpoint 2 must be approved before running UX research.');
  }

  if (stage === ResearchStage.Validation && !stateManager.isGateApproved(2)) {
    throw new Error('Checkpoint 2 must be approved before running validation.');
  }

  // Snapshot state before execution for diff
  const artifactsBefore = state.artifacts.length;

  // Execute through the SAME handler used by the graph coordinator.
  // This is the single source of truth for stage execution logic.
  const handlers = createPreRcHandlers(deps);
  const stageHandler = handlers.runStage(stage);
  const result = await stageHandler(state);
  const updatedState = result.state;

  // Persist the updated state
  await deps.persistence.save(updatedState);
  audit(
    'phase.complete',
    'pre-rc',
    projectPath,
    { stage, personasRun: updatedState.artifacts.length - artifactsBefore },
    stage,
  );

  // Build output from the state diff
  const newArtifacts = updatedState.artifacts.slice(artifactsBefore);
  const stageStatus = updatedState.stageStatus[stage];
  const stageLabel = STAGE_LABELS[stage] || stage;

  // Count completed stages for progress indicator
  const completedStages = Object.values(updatedState.stageStatus).filter((s) => s === 'completed').length;
  const totalStages = Object.keys(updatedState.stageStatus).length;

  if (stageStatus === StageStatus.Skipped) {
    return `**${stageLabel} - Skipped**\n\nNo active specialists for this area based on your project's complexity.`;
  }

  // Check for failed personas by comparing expected vs actual
  const stageConfigs = deps.selector.getConfigsByStage(stage);
  const activeIds = state.personaSelection?.activePersonas ?? [];
  const activeConfigs = stageConfigs.filter((c) => c.alwaysRuns || activeIds.includes(c.id));
  const expectedCount = activeConfigs.length;
  const succeededCount = newArtifacts.length;
  const failedCount = expectedCount - succeededCount;

  // Format specialist results in plain language
  const specialistResults = newArtifacts.map((a: ResearchArtifact) => `- ${a.personaName} - completed`);

  const failureWarning =
    failedCount > 0
      ? `\n\nNote: ${failedCount} specialist(s) could not complete their analysis. Their areas may have gaps in the research.`
      : '';

  // Check if a gate is now pending
  const updatedManager = await deps.persistence.load(projectPath);
  const pendingGate = updatedManager?.getNextPendingGate();
  const gateNotice = pendingGate
    ? `\n\n**Checkpoint ${pendingGate} is ready.** Review the results so far before continuing.`
    : '\n\nMoving to the next stage...';

  // Cost summary
  const costInfo = formatCostSummary();
  const costLine = costInfo ? `\n\nRunning total: ${costInfo.match(/Total: (\$[\d.]+)/)?.[1] || 'tracking'}` : '';

  return `**${stageLabel} research complete** (${completedStages} of ${totalStages} stages done)

${succeededCount} specialist${succeededCount !== 1 ? 's' : ''} contributed:
${specialistResults.join('\n')}${failureWarning}${costLine}${gateNotice}`;
}
