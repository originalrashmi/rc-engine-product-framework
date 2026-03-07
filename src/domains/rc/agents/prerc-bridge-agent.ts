import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import type { PreRcDetectionResult } from '../context-loader.js';

export class PreRcBridgeAgent extends BaseAgent {
  /**
   * Import Pre-RC research and convert 19-section PRD to 11-section RC format.
   * Skips Illuminate + Define phases, advancing directly to Architect.
   */
  async run(state: ProjectState, preRcDetection: PreRcDetectionResult): Promise<AgentResult> {
    if (!preRcDetection.prdPath) {
      return {
        text: 'Error: No Pre-RC PRD found. Run Pre-RC Method Agent first (prc_synthesize).',
      };
    }

    if (!preRcDetection.isComplete) {
      return {
        text: 'Error: Pre-RC research is not complete (Gate 3 not approved). Complete all Pre-RC gates before importing.',
      };
    }

    // Load the Pre-RC PRD
    const preRcPrd = this.contextLoader.loadProjectFile(state.projectPath, preRcDetection.prdPath);

    // Load Pre-RC task list if available
    let preRcTasks = '';
    if (preRcDetection.taskListPath) {
      try {
        preRcTasks = this.contextLoader.loadProjectFile(state.projectPath, preRcDetection.taskListPath);
      } catch {
        // Non-critical - tasks are optional context
      }
    }

    const instructions = `You are the RC Method Pre-RC Bridge Agent. Your job is to TRANSFORM a Pre-RC 19-section research PRD into the RC Method 11-section format.

CRITICAL RULES:
- TRANSFORM, do not regenerate. Preserve ALL requirements, user stories, and functional requirements from the Pre-RC PRD.
- Do NOT compress or lose detail. If Pre-RC has 80 functional requirements, they must all appear in the output.
- Do NOT invent new content. Only restructure what exists.
- Tag imported sections with [Pre-RC] source markers for traceability.

SECTION MAPPING (Pre-RC 19 -> RC 11):
1. Problem Statement <- Pre-RC Sections 1 (Problem Statement)
2. Target User <- Pre-RC Section 2 (Target User & ICP) - preserve full ICP table and persona
3. Solution Overview <- Pre-RC Section 3 (Solution Overview)
4. Features <- Pre-RC Sections 4 (Goals), 5 (User Stories), 6 (Features), 7 (Functional Requirements)
   - Each feature needs: user story, acceptance criteria, MoSCoW priority, complexity
   - Preserve FR-codes (FR-A1, FR-B2...) and module grouping
   - Preserve ALL user stories with acceptance criteria
5. UX Requirements <- Pre-RC Section 8 (UX & Design Considerations)
   - Add UX Trigger Score placeholder: "Score: [pending - run ux_score]"
   - List key surfaces and critical flows from Pre-RC UX section
6. Non-Functional Requirements <- Pre-RC Section 9 (NFRs)
   - Preserve specific numbers (latency targets, WCAG levels, etc.)
7. Out of Scope <- Pre-RC Section 11 (Non-Goals / Out of Scope)
8. Dependencies & Integrations <- Pre-RC Section 17 (Dependencies)
9. Risks & Assumptions <- Pre-RC Section 16 (Risks & Assumptions)
   - Preserve likelihood, impact, and mitigation for each risk
10. Timeline & Milestones <- Pre-RC Section 15 (Implementation Sequence)
11. RC Method Metadata <- Pre-RC Section 19 (RC Method Metadata)
    - Source: Pre-RC import
    - Imported from: [Pre-RC PRD path]
    - Research artifacts: [count]

SECTIONS FROM PRE-RC TO PRESERVE AS APPENDIX (do NOT discard):
- Section 10 (Technical Architecture) -> Include as "## Technical Architecture Reference [Pre-RC]" appendix
- Section 12 (Go-to-Market) -> Include as appendix if present
- Section 13 (Success Metrics) -> Include as appendix if present
- Section 14 (Open Questions) -> Include as appendix - these need resolution during Architect phase

OUTPUT FORMAT:
Follow the exact rc-prd-master.md template structure. The output must be a valid RC Method PRD.

The project is "${state.projectName}".`;

    const text = await this.execute(
      ['skills/rc-prd-master.md'],
      instructions,
      `Convert this Pre-RC PRD to RC Method format:\n\n${preRcPrd}${preRcTasks ? `\n\n--- Pre-RC Task List (for context) ---\n\n${preRcTasks}` : ''}`,
    );

    // Save the converted PRD
    const prdFilename = `PRD-${this.sanitizeName(state.projectName)}-master.md`;
    const prdPath = path.join(state.projectPath, 'rc-method', 'prds', prdFilename);
    fs.mkdirSync(path.dirname(prdPath), { recursive: true });
    fs.writeFileSync(prdPath, text, 'utf-8');

    const artifactRef = `rc-method/prds/${prdFilename}`;
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
