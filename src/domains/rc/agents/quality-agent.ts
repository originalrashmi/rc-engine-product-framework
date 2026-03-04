import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

export class QualityAgent extends BaseAgent {
  /** Run the full quality gate (Phase 5: Validate) */
  async run(state: ProjectState): Promise<AgentResult> {
    // Gather all PRDs and task lists as context
    const prdFiles = state.artifacts.filter((a) => a.includes('/prds/PRD-'));
    const taskFiles = state.artifacts.filter((a) => a.includes('/tasks/TASKS-'));

    if (prdFiles.length === 0 || taskFiles.length === 0) {
      return {
        text: 'Error: Quality gate requires both PRDs and task lists. Run rc_define and rc_sequence first.',
      };
    }

    let projectContext = '';

    // Load all PRDs
    for (const file of prdFiles) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, file);
        projectContext += `\n\n--- ${file} ---\n\n${content}`;
      } catch {
        console.error(`Warning: Could not load ${file}`);
      }
    }

    // Load all task lists
    for (const file of taskFiles) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, file);
        projectContext += `\n\n--- ${file} ---\n\n${content}`;
      } catch {
        console.error(`Warning: Could not load ${file}`);
      }
    }

    // Determine if UX scan is needed (check for [UI] tasks or UX PRD)
    const hasUxPrd = prdFiles.some((f) => f.includes('-ux.md'));
    const uxScoreInfo =
      state.uxScore !== null ? `UX Trigger Score: ${state.uxScore}, Mode: ${state.uxMode}` : 'No UX scoring done yet';

    // Determine which checks to run based on Pre-RC import status
    const isPreRcImport = !!state.preRcSource;
    const checksToRun = isPreRcImport
      ? 'Run 2 checks (Pre-RC project - anti-pattern and token checks already passed during Pre-RC gates):\n- Check #3 (Scope Drift Detection): verify every task maps to a PRD criterion and vice versa\n- Check #4 (UX Quality Scan): scan [UI] tasks against rc-ux-core.md 42 core rules'
      : 'Run ALL 4 checks: Anti-Pattern Scan, Token Budget Audit, Scope Drift Detection, UX Quality Scan\n- For Check #1 (Anti-Pattern): scan each task for security/architectural anti-patterns\n- For Check #2 (Token Budget): estimate token counts for each artifact and flag violations\n- For Check #3 (Scope Drift): verify every task maps to a PRD criterion and vice versa\n- For Check #4 (UX Scan): scan [UI] tasks against rc-ux-core.md 42 core rules';

    const preRcNote = isPreRcImport
      ? `\n- NOTE: This project was imported from Pre-RC research (${state.preRcSource!.artifactCount} artifacts, ${state.preRcSource!.personaCount} personas). Anti-pattern and token budget checks were already passed during Pre-RC Gate 3. Only running scope drift and UX quality checks.`
      : '';

    const instructions = `You are the RC Method Quality Agent. ${isPreRcImport ? 'Run targeted quality checks (Pre-RC import - some checks already passed).' : 'Run ALL four quality checks and present a combined report.'}

RULES:
- Follow the exact output formats from the knowledge file
- ${checksToRun}${hasUxPrd ? '\n- A UX child PRD exists, verify coverage' : ''}
- Present findings in severity order: Critical > High > Medium
- End with the Combined Quality Report format
- ${uxScoreInfo}${preRcNote}
- The project is "${state.projectName}"`;

    // Load quality gate knowledge; only include UX core if project has UI
    const hasUi = (state.uxScore !== null && state.uxScore > 0) || hasUxPrd;
    const knowledgeFiles = hasUi
      ? ['skills/rc-quality-gate.md', 'skills/rc-ux-core.md']
      : ['skills/rc-quality-gate.md'];

    const text = await this.execute(
      knowledgeFiles,
      instructions,
      'Run the full quality gate on the PRDs and task lists below.',
      projectContext,
    );

    return {
      text,
      gateReady: true,
    };
  }
}
