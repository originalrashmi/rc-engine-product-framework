import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

/**
 * Phase 7: Connect - Integration Wiring.
 *
 * Loads all forge artifacts plus the architecture doc, then generates
 * an integration report covering API wiring, service boundaries,
 * authentication flows, and cross-component dependencies.
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

    // Load forge outputs, PRDs, and architecture doc
    let projectContext = '';

    for (const artifact of state.artifacts) {
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, artifact);
        projectContext += `\n\n--- ${artifact} ---\n\n${content}`;
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
