import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';

/** Maximum PRD length before truncation (characters). */
const PRD_TRUNCATE_THRESHOLD = 5000;

/**
 * Phase 8: Compound - Production Hardening.
 *
 * Cross-domain agent: loads the integration report from Phase 7,
 * forge outputs, architecture, and (optionally) Post-RC scan results
 * to produce a production readiness assessment.
 *
 * Token optimization: only loads relevant artifacts instead of everything.
 */
export class CompoundAgent extends BaseAgent {
  async run(state: ProjectState, codeContext?: string): Promise<AgentResult> {
    // Token optimization: only load forge outputs, architecture, and connect findings
    // instead of ALL project artifacts.
    const relevantArtifacts = state.artifacts.filter(
      (a) =>
        a.startsWith('rc-method/forge/') ||
        a.startsWith('rc-method/artifacts/') ||
        a.includes('architecture') ||
        a.includes('architect') ||
        a.includes('connect/') ||
        a.includes('post-rc/'),
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
