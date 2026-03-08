import type { GateDecision, ResearchState } from '../types.js';
import { GateStatus } from '../types.js';
import type { StatePersistence } from '../state/state-persistence.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { audit } from '../../../shared/audit.js';
import { recordGateOutcome } from '../../../shared/learning.js';
import { createPreRcCoordinator } from './prc-coordinator-factory.js';
import type { GateResume } from '../../../core/graph/types.js';
import type { PreRcDependencies } from './prc-coordinator-factory.js';

export async function prcGate(
  persistence: StatePersistence,
  projectPath: string,
  decision: string,
  feedback: string | undefined,
  deps: PreRcDependencies,
): Promise<string> {
  const stateManager = await persistence.load(projectPath);
  if (!stateManager) {
    throw new Error('Research not initialized. Run prc_start first.');
  }

  tokenTracker.setProjectPath(projectPath);

  const pendingGate = stateManager.getNextPendingGate();
  if (!pendingGate) {
    return 'No checkpoint is currently pending. Check the current progress for details.';
  }

  // Parse decision
  const decisionLower = decision.toLowerCase().trim();
  let status: GateStatus;
  let feedbackText = feedback || '';

  if (decisionLower.startsWith('approve')) {
    status = GateStatus.Approved;
    feedbackText = feedbackText || 'Approved';
  } else if (decisionLower.startsWith('reject')) {
    status = GateStatus.Rejected;
    feedbackText = feedbackText || decisionLower.replace('reject', '').trim() || 'Rejected without reason';
  } else if (decisionLower.startsWith('question')) {
    const questionText = decisionLower.replace('question', '').trim() || feedbackText;
    return `**Checkpoint ${pendingGate} - Question Received**

**Question:** ${questionText}

Please provide the answer and I'll continue with the checkpoint.`;
  } else {
    return `I didn't understand "${decision}". Please approve, reject (with a reason), or ask a question.`;
  }

  // Record the gate decision in state
  const gateDecision: GateDecision = {
    gateNumber: pendingGate,
    status,
    feedback: feedbackText,
    timestamp: new Date().toISOString(),
  };

  stateManager.addGateDecision(gateDecision);
  await persistence.save(stateManager.getState());
  audit(
    status === GateStatus.Approved ? 'gate.approve' : 'gate.reject',
    'pre-rc',
    projectPath,
    { gateNumber: pendingGate, feedback: feedbackText },
    `gate-${pendingGate}`,
  );
  recordGateOutcome({
    projectId: projectPath,
    projectName: projectPath,
    domain: 'pre-rc',
    phase: `gate-${pendingGate}`,
    gateNumber: pendingGate,
    decision: status === GateStatus.Approved ? 'approved' : 'rejected',
    feedback: feedbackText,
  });

  // Save gate record artifact
  const gateRecord = buildGateRecord(gateDecision);
  await persistence.writeArtifact(projectPath, `gates/gate-${pendingGate}.md`, gateRecord);

  // Resume the graph coordinator to advance past the gate.
  // On approve: the graph continues executing stage nodes (with real handlers
  // that run persona agents in parallel) until the next gate interrupt.
  // On reject: the graph records the rejection and stops.
  const graphDecision: GateResume['decision'] = status === GateStatus.Approved ? 'approve' : 'reject';
  const resumeResult = await resumeCoordinator(projectPath, { decision: graphDecision, feedback: feedbackText }, deps);

  if (status === GateStatus.Approved) {
    // If the coordinator ran stages, persist the updated state
    if (resumeResult) {
      await persistence.save(resumeResult);
    }
    return buildApprovalMessage(pendingGate, resumeResult);
  } else {
    return `**Checkpoint ${pendingGate} - Changes Requested**

**Feedback:** ${feedbackText}

I'll address this feedback and re-run the relevant research. You'll review again at the next checkpoint.`;
  }
}

function buildGateRecord(gate: GateDecision): string {
  return `# Gate ${gate.gateNumber} Decision Record

**Status:** ${gate.status}
**Timestamp:** ${gate.timestamp}
**Feedback:** ${gate.feedback}
`;
}

function buildApprovalMessage(gateNumber: 1 | 2 | 3, resultState: ResearchState | null): string {
  // Count completed stages and artifacts for progress context
  let stageReport = '';
  if (resultState) {
    const completedStages = Object.entries(resultState.stageStatus).filter(([_, status]) => status === 'completed');
    const artifactCount = resultState.artifacts.length;
    if (completedStages.length > 0) {
      stageReport = ` ${completedStages.length} research stages completed, ${artifactCount} specialist reports generated.`;
    }
  }

  const nextSteps: Record<number, string> = {
    1: `Approved. Running research specialists now.${stageReport}

I'll pause at the next checkpoint when this batch of research is done so you can review the findings.`,

    2: `Approved. Running the remaining research stages.${stageReport}

I'll pause at the final checkpoint when all research is complete.`,

    3: `Approved. ${resultState?._synthesisOutput ? 'Research synthesis is complete.' : 'Generating your requirements document from all the research...'}${stageReport}

${resultState?._synthesisOutput ? 'Your requirements document is ready for review.' : 'This combines all specialist findings into a comprehensive requirements document.'}`,
  };

  return `**Checkpoint ${gateNumber} - Approved**

${nextSteps[gateNumber]}`;
}

/**
 * Resume the graph coordinator to advance past the current gate.
 * Returns the updated state if stages were executed, null otherwise.
 */
async function resumeCoordinator(
  projectPath: string,
  gateResume: GateResume,
  deps: PreRcDependencies,
): Promise<ResearchState | null> {
  try {
    const coordinator = createPreRcCoordinator(deps);
    const interrupt = coordinator.loadPendingInterrupt(projectPath);
    if (interrupt) {
      const result = await coordinator.resume(projectPath, gateResume);
      return result.state;
    }
  } catch (err) {
    console.error(`[prc_gate] Coordinator resume failed: ${(err as Error).message}`);
  }
  return null;
}
