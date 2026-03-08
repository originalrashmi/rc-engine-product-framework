import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

export class TaskAgent extends BaseAgent {
  /** Generate task list from approved PRD (Phase 4: Sequence) */
  async run(state: ProjectState): Promise<AgentResult> {
    // Load the active PRD for context
    const prdFiles = state.artifacts.filter((a) => a.includes('/prds/PRD-'));
    if (prdFiles.length === 0) {
      return {
        text: 'Error: No PRD found. Run rc_define first to generate a PRD before creating tasks.',
      };
    }

    // Load all PRDs as context
    let prdContext = '';
    for (const prdFile of prdFiles) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, prdFile);
        prdContext += `\n\n--- ${prdFile} ---\n\n${content}`;
      } catch {
        console.error(`Warning: Could not load PRD ${prdFile}`);
      }
    }

    const hasUxPrd = prdFiles.some((f) => f.includes('-ux.md'));

    // Check for Pre-RC task list
    let preRcTaskContext = '';
    if (state.preRcSource) {
      const preRcDir = path.join(state.projectPath, 'pre-rc-research');
      try {
        const preRcFiles = fs.readdirSync(preRcDir);
        const taskFile = preRcFiles.find((f) => f.startsWith('tasks-') && f.endsWith('.md'));
        if (taskFile) {
          const taskContent = this.contextLoader.loadProjectFile(
            state.projectPath,
            path.join('pre-rc-research', taskFile),
          );
          preRcTaskContext = `\n\n--- Pre-RC Task List (use as starting point) ---\n\n${taskContent}`;
        }
      } catch {
        // Non-critical - Pre-RC tasks are optional context
      }
    }

    const preRcTaskNote = preRcTaskContext
      ? "- A Pre-RC task list exists below. Use it as a STARTING POINT - preserve its module organization and task structure. Add test criteria, UX subsections, dependency chains, and file paths that Pre-RC didn't include."
      : '';

    const instructions = `You are the RC Method Task Agent. Transform the approved PRD into actionable, sequenced task lists.

RULES:
- Follow the exact template in the knowledge file
- Every task maps to a PRD acceptance criterion
- Every task has an acceptance test
- File paths must be explicit
- Dependencies must be explicit
- [UI] tasks MUST include: loading/empty/error/success states, hover/focus/active/disabled states, keyboard navigation basics, accessibility minimum, and UX spec reference
${hasUxPrd ? '- A UX child PRD exists - reference it for UI task requirements' : '- No UX child PRD exists - use rc-ux-core.md core rules for UI task requirements'}
${preRcTaskNote}
- **Test Criteria Required:** Every [UI], [API], and [INTEGRATION] task MUST include a "Test criteria" section with: happy path scenario, error path scenario, and edge case scenario. These feed into automatic user test script generation during Forge phase. [SETUP], [DATA], [CONFIG], and [TEST] tasks do NOT need test criteria.
- Target 8-10 tasks per session
- The project is "${state.projectName}"`;

    const text = await this.execute(
      ['skills/rc-task-generator.md'],
      instructions,
      'Generate the complete task list from the approved PRDs below.',
      prdContext + preRcTaskContext,
    );

    // Save task list
    const taskFilename = `TASKS-${this.sanitizeName(state.projectName)}-master.md`;
    const taskPath = path.join(state.projectPath, 'rc-method', 'tasks', taskFilename);
    fs.writeFileSync(taskPath, text, 'utf-8');

    const artifactRef = `rc-method/tasks/${taskFilename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text,
      artifacts: [artifactRef],
      gateReady: true,
    };
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
