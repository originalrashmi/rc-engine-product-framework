import { StageStatus } from '../types.js';
import type { StatePersistence } from '../state/state-persistence.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { formatRecentActivity } from '../../../shared/audit.js';
import { formatCostSummary } from '../../../shared/cost-tracker.js';
import { getLearningSummary } from '../../../shared/learning.js';

// Pre-RC phase labels for each research stage
const PHASE_LABELS: Record<string, string> = {
  'stage-1-meta': 'Research',
  'stage-2-user-intelligence': 'Research',
  'stage-3-business-market': 'Research',
  'stage-4-technical': 'Research',
  'stage-5-ux': 'Research',
  'stage-6-validation': 'Analysis',
};

function getPipelineProgress(stageStatus: Record<string, string>): string {
  const stages = Object.entries(stageStatus);
  const researchStages = stages.filter(([k]) => PHASE_LABELS[k] === 'Research');
  const analysisStages = stages.filter(([k]) => PHASE_LABELS[k] === 'Analysis');
  const researchDone = researchStages.every(([, s]) => s === StageStatus.Completed);
  const analysisDone = analysisStages.every(([, s]) => s === StageStatus.Completed);

  if (analysisDone && researchDone) {
    return 'Research complete -- ready to continue to the build phase';
  } else if (researchDone) {
    return 'Research complete -- final analysis in progress';
  } else {
    const researchCompleted = researchStages.filter(([, s]) => s === StageStatus.Completed).length;
    return `Research in progress (${researchCompleted}/${researchStages.length} stages done)`;
  }
}

export async function prcStatus(persistence: StatePersistence, projectPath: string): Promise<string> {
  const stateManager = await persistence.load(projectPath);
  if (!stateManager) {
    return 'No research project found at this path. Start a new project to begin.';
  }

  const state = stateManager.getState();

  const stageIcons: Record<StageStatus, string> = {
    [StageStatus.NotStarted]: 'pending',
    [StageStatus.InProgress]: 'running',
    [StageStatus.Completed]: 'done',
    [StageStatus.Skipped]: 'skip',
  };

  const stageLines = Object.entries(state.stageStatus)
    .map(([stage, status]) => {
      const phase = PHASE_LABELS[stage] || '';
      return `  ${stageIcons[status as StageStatus]}  ${stage}  [${phase}]`;
    })
    .join('\n');

  const gateLines =
    state.gates.length > 0
      ? state.gates.map((g) => `  Gate ${g.gateNumber}: ${g.status} (${g.timestamp})`).join('\n')
      : '  No gates processed yet';

  const pendingGate = stateManager.getNextPendingGate();
  const pendingNotice = pendingGate ? `\n  ** Gate ${pendingGate} is pending - run prc_gate to proceed **` : '';

  const classification = state.classification
    ? `  Domain: ${state.classification.domain}\n  Product Class: ${state.classification.productClass}\n  Confidence: ${(state.classification.confidence * 100).toFixed(0)}%`
    : '  Not yet classified. Run prc_classify.';

  const personaInfo = state.personaSelection
    ? `  Active: ${state.personaSelection.totalActive} | Skipped: ${state.personaSelection.totalSkipped}`
    : '  Not yet selected.';

  const pipelineProgress = getPipelineProgress(state.stageStatus);

  return `
===============================================
  PRE-RC RESEARCH STATUS
===============================================

  Project: ${state.projectName}
  Created: ${state.createdAt}
  Updated: ${state.updatedAt}

  PIPELINE:
  ${pipelineProgress}

  CLASSIFICATION:
${classification}

  PERSONAS:
${personaInfo}

  STAGE PROGRESS:
${stageLines}

  GATES:
${gateLines}${pendingNotice}

  ARTIFACTS: ${state.artifacts.length} generated
  ARTIFACT TOKENS: ${state.artifacts.reduce((sum, a) => sum + a.tokenCount, 0)}
${tokenTracker.getDomainSummary('pre-rc')}${formatCostSummary()}${getLearningSummary()}${formatRecentActivity(projectPath)}
===============================================`;
}
