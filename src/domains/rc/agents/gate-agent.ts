import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState, Phase } from '../types.js';
import { GateStatus, PHASE_NAMES, GATED_PHASES } from '../types.js';

export class GateAgent extends BaseAgent {
  /** Present a gate to the operator after phase work is complete */
  async presentGate(state: ProjectState, phaseOutput: string): Promise<AgentResult> {
    const phase = state.currentPhase;
    const phaseName = PHASE_NAMES[phase];

    const instructions = `You are the RC Method Gate Agent. Your job is to present a gate summary to the non-technical product owner.

RULES:
- Write in plain business language - no technical jargon
- Summarize what was accomplished in this phase
- List key deliverables and any risks
- End with a clear decision question
- Use the exact gate format from the knowledge file

The current phase is ${phase} - ${phaseName}.
The project is "${state.projectName}".`;

    const text = await this.execute(
      ['skills/rc-owner-gate.md'],
      instructions,
      `Present the gate for Phase ${phase} (${phaseName}). Here is the phase output to summarize:\n\n${phaseOutput}`,
    );

    return { text, gateReady: true };
  }

  /** Process a gate decision (approve/reject/question) */
  async processDecision(state: ProjectState, decision: string, feedback?: string): Promise<AgentResult> {
    const phase = state.currentPhase;
    const phaseName = PHASE_NAMES[phase];

    // Plain-language step names (vocabulary: "Step" not "Phase")
    const STEP_LABELS: Record<number, string> = {
      1: 'Discovery',
      2: 'Requirements',
      3: 'Architecture',
      4: 'Task Planning',
      5: 'Quality Checks',
      6: 'Building',
      7: 'Integration',
      8: 'Production Hardening',
    };
    const stepLabel = STEP_LABELS[phase] || phaseName;

    if (!GATED_PHASES.includes(phase)) {
      return {
        text: `Step ${phase} (${stepLabel}) does not require a checkpoint. Continuing automatically.`,
      };
    }

    const normalizedDecision = decision.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];

    if (normalizedDecision === 'approve') {
      state.gates[phase] = {
        status: GateStatus.Approved,
        date: today,
        feedback: feedback ?? 'Approved',
      };

      // Advance to next phase
      if (phase < 8) {
        state.currentPhase = (phase + 1) as Phase;
      }

      const nextStepLabel = phase < 8 ? STEP_LABELS[(phase + 1) as Phase] || PHASE_NAMES[(phase + 1) as Phase] : '';

      // Phase 8 (Compound) is the final RC phase - bridge to Post-RC validation
      if (phase === 8) {
        return {
          text: `**Checkpoint ${phase} (${stepLabel}) - Approved**

All 8 build steps are complete!

**What happens next:**
I'll run a security and monitoring scan to verify your project is ready to ship. This checks for common vulnerabilities, missing error handling, and monitoring gaps.

Ready to run the security scan?
- **Yes** - Start the scan
- **Not yet** - I want to review the deliverables first`,
          phaseComplete: true,
        };
      }

      return {
        text: `**Checkpoint ${phase} (${stepLabel}) - Approved**

Moving to Step ${phase + 1}: ${nextStepLabel}.`,
        phaseComplete: true,
      };
    }

    if (normalizedDecision.startsWith('reject')) {
      state.gates[phase] = {
        status: GateStatus.Rejected,
        date: today,
        feedback: feedback ?? normalizedDecision,
      };

      return {
        text: `**Checkpoint ${phase} (${stepLabel}) - Changes Requested**

Feedback: ${feedback ?? 'No reason given.'}

I'll address the feedback and present this checkpoint again when ready.`,
      };
    }

    if (normalizedDecision.startsWith('question')) {
      return {
        text: `**Question about Step ${phase} (${stepLabel}):** ${feedback ?? decision}

The checkpoint remains open. Once the question is answered, I'll present it again for your decision.`,
      };
    }

    return {
      text: `I didn't understand "${decision}". Please approve, reject (with a reason), or ask a question.`,
    };
  }

  // Required by BaseAgent but routing happens through presentGate/processDecision
  async run(): Promise<AgentResult> {
    return { text: 'Gate agent requires calling presentGate() or processDecision() directly.' };
  }
}
