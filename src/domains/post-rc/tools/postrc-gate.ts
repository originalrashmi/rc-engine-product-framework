import type { z } from 'zod';
import type { PostRCGateInputSchema } from '../types.js';
import { GateDecision } from '../types.js';
import { loadState, saveState } from '../state/state-manager.js';
import { audit } from '../../../shared/audit.js';
import { recordGateOutcome } from '../../../shared/learning.js';
import { PostRcCoordinator } from '../graph/postrc-coordinator.js';
import type { GateResume } from '../../../core/graph/types.js';

type GateInput = z.infer<typeof PostRCGateInputSchema>;

/**
 * Create a PostRcCoordinator for gate resume operations.
 * Handlers are no-ops because resume after the ship gate
 * has no further nodes to execute.
 */
function createGateCoordinator(): PostRcCoordinator {
  return new PostRcCoordinator({
    scanSecurity: async (state) => ({ state }),
    scanMonitoring: async (state) => ({ state }),
    scanLegalClaims: async (state) => ({ state }),
    scanLegalProduct: async (state) => ({ state }),
    scanEdgeCase: async (state) => ({ state }),
    scanAppSecurity: async (state) => ({ state }),
    mergeScans: (_states, original) => original,
  });
}

export async function postrcGate(args: GateInput): Promise<string> {
  const { project_path, decision, feedback } = args;
  const state = await loadState(project_path);

  if (!state.projectPath) {
    return `No Post-RC configuration found. Run postrc_configure first.`;
  }

  if (!state.lastScan) {
    return `No scan results found. Run postrc_scan before making a checkpoint decision.`;
  }

  const normalizedDecision = decision.toLowerCase().trim();

  if (normalizedDecision === 'approve') {
    if (state.lastScan.gateDecision === GateDecision.Block) {
      const criticals = state.lastScan.summary.critical;
      return `
===============================================
  POST-RC GATE: BLOCKED
===============================================

  Cannot approve - ${criticals} CRITICAL finding(s) remain.
  Critical findings must be fixed or overridden before shipping.

  Options:
    -> Fix the critical findings and run "postrc_scan" again
    -> Use "postrc_override" to override specific findings with justification
    -> Then retry "postrc_gate" with "approve"
===============================================`;
    }

    // Persist the gate approval
    state.gateHistory = state.gateHistory || [];
    state.gateHistory.push({
      decision: 'approved',
      scanId: state.lastScan.id,
      feedback: feedback || undefined,
      timestamp: new Date().toISOString(),
    });
    state.updatedAt = new Date().toISOString();
    await saveState(project_path, state);
    audit(
      'gate.approve',
      'post-rc',
      project_path,
      {
        scanId: state.lastScan.id,
        totalFindings: state.lastScan.summary.totalFindings,
        feedback: feedback || undefined,
      },
      'ship-gate',
    );
    recordGateOutcome({
      projectId: project_path,
      projectName: project_path,
      domain: 'post-rc',
      phase: 'ship-gate',
      gateNumber: 1,
      decision: 'approved',
      feedback: feedback || undefined,
    });

    // Resume the graph coordinator to advance past the ship gate
    await resumeCoordinator(project_path, { decision: 'approve', feedback });

    return `
===============================================
  POST-RC GATE: APPROVED - READY TO SHIP
===============================================

  Scan: ${state.lastScan.id}
  Checkpoint Decision: ${state.lastScan.gateDecision.toUpperCase()}
  Findings: ${state.lastScan.summary.totalFindings} (${state.lastScan.summary.critical} critical, ${state.lastScan.summary.high} high)
  Overrides: ${state.overrides.filter((o) => o.status === 'active').length} active
  ${feedback ? `Feedback: ${feedback}` : ''}

  Automated validation complete. No blocking findings detected.

  NOTICE:
    This approval is based on automated pattern analysis, not a professional
    audit. It does not guarantee security, compliance, or production readiness.
    Deployment decisions and their outcomes are the user's responsibility.
    Consult qualified professionals for security, legal, and compliance
    assurance before production deployment.

  NEXT STEPS:
    -> Deploy to production
    -> Verify monitoring is operational (RC Phase 8: Compound)
    -> Log observability baseline
===============================================`;
  }

  if (normalizedDecision.startsWith('reject')) {
    const reason = normalizedDecision.replace('reject', '').trim() || feedback || 'No reason provided';

    // Persist the gate rejection
    state.gateHistory = state.gateHistory || [];
    state.gateHistory.push({
      decision: 'rejected',
      scanId: state.lastScan.id,
      feedback: reason,
      timestamp: new Date().toISOString(),
    });
    state.updatedAt = new Date().toISOString();
    await saveState(project_path, state);
    audit(
      'gate.reject',
      'post-rc',
      project_path,
      {
        scanId: state.lastScan.id,
        reason,
      },
      'ship-gate',
    );
    recordGateOutcome({
      projectId: project_path,
      projectName: project_path,
      domain: 'post-rc',
      phase: 'ship-gate',
      gateNumber: 1,
      decision: 'rejected',
      feedback: reason,
    });

    // Resume the graph coordinator with rejection
    await resumeCoordinator(project_path, { decision: 'reject', feedback: reason });

    return `
===============================================
  POST-RC GATE: REJECTED
===============================================

  Reason: ${reason}

  The code has been rejected and must be revised before shipping.

  NEXT STEPS:
    -> Address the findings flagged in the scan
    -> Run "postrc_scan" again after fixes
    -> Retry "postrc_gate" with "approve"
===============================================`;
  }

  if (normalizedDecision.startsWith('question')) {
    const question = normalizedDecision.replace('question', '').trim() || feedback || '';

    // Persist the question
    state.gateHistory = state.gateHistory || [];
    state.gateHistory.push({
      decision: 'question',
      scanId: state.lastScan.id,
      feedback: question,
      timestamp: new Date().toISOString(),
    });
    state.updatedAt = new Date().toISOString();
    await saveState(project_path, state);
    audit(
      'gate.question',
      'post-rc',
      project_path,
      {
        scanId: state.lastScan.id,
        question,
      },
      'ship-gate',
    );
    recordGateOutcome({
      projectId: project_path,
      projectName: project_path,
      domain: 'post-rc',
      phase: 'ship-gate',
      gateNumber: 1,
      decision: 'question',
      feedback: question,
    });

    // Resume the graph coordinator with question
    await resumeCoordinator(project_path, { decision: 'question', feedback: question });

    return `
===============================================
  POST-RC GATE: QUESTION NOTED
===============================================

  Question: ${question}

  The checkpoint remains open. Answer the question and re-submit
  your checkpoint decision with "postrc_gate".
===============================================`;
  }

  return `Invalid checkpoint decision. Use "approve", "reject [reason]", or "question [text]".`;
}

/**
 * Resume the graph coordinator to advance past the ship gate.
 * Best-effort - if no interrupt is pending (e.g., scan was run without coordinator),
 * silently skip the resume.
 */
async function resumeCoordinator(projectPath: string, gateResume: GateResume): Promise<void> {
  try {
    const coordinator = createGateCoordinator();
    const interrupt = coordinator.loadPendingInterrupt(projectPath);
    if (interrupt) {
      await coordinator.resume(projectPath, gateResume);
    }
  } catch {
    // Best-effort - gate history is already persisted via state manager
  }
}
