import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

/** Maximum PRD length before truncation (characters). */
const PRD_TRUNCATE_THRESHOLD = 5000;

/**
 * Phase 7: Connect - Integration Wiring.
 *
 * Loads forge artifacts, architecture doc, and a PRD summary, then generates
 * an integration report covering API wiring, service boundaries,
 * authentication flows, and cross-component dependencies.
 *
 * Token optimization: only loads relevant artifacts instead of everything.
 */
export class ConnectAgent extends BaseAgent {
  async run(state: ProjectState): Promise<AgentResult> {
    const forgeDir = 'rc-method/forge/';
    const forgeArtifacts = state.artifacts.filter((a) => a.startsWith(forgeDir));

    if (forgeArtifacts.length === 0) {
      return {
        text: 'Error: Connect phase requires completed Forge tasks. Run rc_forge_task for each task first.',
      };
    }

    // Token optimization: only load forge outputs, architecture, and PRD summary
    // instead of ALL project artifacts.
    const relevantArtifacts = state.artifacts.filter(
      (a) =>
        a.startsWith('rc-method/forge/') ||
        a.startsWith('rc-method/artifacts/') ||
        a.includes('architecture') ||
        a.includes('architect'),
    );

    let projectContext = '';

    for (const artifact of relevantArtifacts) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, artifact);
        projectContext += `\n\n--- ${artifact} ---\n\n${content}`;
      } catch {
        // skip missing files
      }
    }

    // Load PRD with truncation for large documents
    const prdArtifacts = state.artifacts.filter((a) => a.includes('/prds/PRD-') && !a.includes('-ux.md'));
    for (const prd of prdArtifacts) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, prd);
        if (content.length > PRD_TRUNCATE_THRESHOLD) {
          projectContext += `\n\n--- ${prd} (summary) ---\n\n${content.slice(0, 2000)}\n\n... [truncated, ${content.length} chars total]`;
        } else {
          projectContext += `\n\n--- ${prd} ---\n\n${content}`;
        }
      } catch {
        // skip missing files
      }
    }

    const instructions = `You are the RC Method orchestrator in Phase 7: Connect. Your job is to verify that all built components integrate correctly and document the integration points.

RULES:
- Review every forge output for integration points (API calls, shared state, event handlers)
- Verify that cross-component dependencies declared in the architecture are wired correctly
- Check authentication and authorization flows end-to-end
- Verify data flows match the data model from the architecture doc
- Identify any missing integration tests or contract tests
- Flag any integration gaps: components that reference APIs or services not yet built
- Write in plain business language
- The project is "${state.projectName}"

OUTPUT FORMAT:
# Integration Report

## Integration Points
[List every cross-component connection with status: wired/missing/partial]

## Authentication Flow
[End-to-end auth flow verification]

## Data Flow Verification
[Verify data model matches implementation]

## Integration Gaps
[Any missing connections or mismatches]

## Recommended Integration Tests
[List of integration tests needed]

## Assessment
[Overall integration readiness: READY / NEEDS WORK / BLOCKED]`;

    const text = await this.execute(
      ['skills/rc-master.md'],
      instructions,
      'Generate the integration report.',
      projectContext,
    );

    return {
      text,
      gateReady: true,
    };
  }
}
