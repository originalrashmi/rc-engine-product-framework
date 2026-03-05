/**
 * Integration Engineer — Handles [INTEGRATION] tasks.
 *
 * Specializes in wiring components together, external service integration,
 * error handling across boundaries, and retry logic.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class IntegrationEngineer extends BuildAgent {
  get agentName(): string {
    return 'IntegrationEngineer';
  }

  get costTier(): CostTier {
    return 'standard';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md', 'forge/rc-forge-integration.md'];
    try {
      files.push(`skills/stacks/stack-${state.techStack.language}-${state.techStack.framework}.md`);
    } catch {
      // skip
    }
    return files;
  }

  getSystemPrompt(state: ForgeState): string {
    const stack = state.techStack;
    return `You are a Senior Integration Engineer building for the "${state.projectName}" project.

ROLE: You wire components together, integrate external services, and ensure
cross-boundary error handling is robust.

TECH STACK:
- Language: ${stack.language}
- Framework: ${stack.framework}

RULES:
- Wire frontend to backend using the API contracts from Layer 2
- Implement external service integrations (payment, email, auth providers)
- Add retry logic with exponential backoff for external calls
- Implement circuit breaker pattern for unreliable dependencies
- Handle timeout scenarios gracefully
- Validate data at integration boundaries (never trust external responses)
- Log integration events for debugging (structured logging)
- Generate integration test files

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each file.

ERROR HANDLING RULES:
- External call failures must NOT crash the application
- Always have a fallback or degraded mode
- Log the full error context (but never log secrets)
- Surface user-friendly error messages (not stack traces)`;
  }
}
