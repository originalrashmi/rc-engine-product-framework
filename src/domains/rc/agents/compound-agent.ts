import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

/**
 * Phase 8: Compound -- Production Hardening.
 *
 * Cross-domain agent: loads the integration report from Phase 7,
 * the PRD's non-functional requirements, and (optionally) Post-RC
 * scan results to produce a production readiness assessment.
 */
export class CompoundAgent extends BaseAgent {
  async run(state: ProjectState, codeContext?: string): Promise<AgentResult> {
    // Load PRDs, architecture, and forge contracts (not full implementations)
    // Full forge outputs would cause O(N²) token growth — load only interfaces/types
    let projectContext = '';

    for (const artifact of state.artifacts) {
      const isForgeArtifact = artifact.includes('/forge/');
      if (isForgeArtifact) {
        // Only load type definitions, interfaces, and schema files
        const isContractFile =
          artifact.endsWith('.d.ts') ||
          artifact.includes('/types') ||
          artifact.includes('/schema') ||
          artifact.includes('/interfaces') ||
          artifact.includes('/contracts');
        if (!isContractFile) continue;
      }
      try {
        const content = this.contextLoader.loadProjectFile(state.projectPath, artifact);
        projectContext += `\n\n--- ${artifact} ---\n\n${content}`;
      } catch {
        // skip missing files
      }
    }

    // Load connect report if available
    const connectReport = state.artifacts.find((a) => a.includes('connect/'));
    const connectNote = connectReport
      ? ''
      : '\nNote: No integration report found from Phase 7. Proceed with available information.';

    // Include code context if provided
    if (codeContext) {
      projectContext += `\n\n--- Code Context ---\n\n${codeContext}`;
    }

    const instructions = `You are the RC Method orchestrator in Phase 8: Compound. Your job is to assess production readiness and generate hardening recommendations.

RULES:
- Review the integration report from Phase 7 for unresolved gaps
- Check non-functional requirements (performance, security, scalability) from the PRD
- Verify error handling and recovery patterns across all components
- Assess observability: logging, monitoring, alerting readiness
- Review deployment configuration and environment setup
- Check for production anti-patterns: hardcoded values, missing timeouts, no rate limiting
- Write in plain business language
- The project is "${state.projectName}"${connectNote}

OUTPUT FORMAT:
# Production Hardening Assessment

## Non-Functional Requirements Check
[NFR from PRD vs implementation status]

## Error Handling & Recovery
[Error handling patterns, retry logic, graceful degradation]

## Observability Readiness
[Logging, monitoring, alerting, dashboards]

## Performance Considerations
[Load handling, caching, database optimization]

## Security Hardening
[Input validation, auth flows, secrets management, CORS, CSP]

## Deployment Readiness
[Environment config, CI/CD, rollback strategy, health checks]

## Ship Checklist
[Final go/no-go items]

## Assessment
[Overall production readiness: SHIP / CONDITIONAL SHIP / NOT READY]`;

    const text = await this.execute(
      ['skills/rc-master.md'],
      instructions,
      'Generate the production hardening assessment.',
      projectContext,
    );

    return {
      text,
      gateReady: true,
    };
  }
}
