/**
 * Backend Engineer — Handles [API] tasks.
 *
 * Specializes in API endpoints, business logic, authentication,
 * and server-side validation.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class BackendEngineer extends BuildAgent {
  get agentName(): string {
    return 'BackendEngineer';
  }

  get costTier(): CostTier {
    return 'standard';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md', 'forge/rc-forge-backend.md'];
    try {
      const stackFile = `skills/stacks/stack-${state.techStack.language}-${state.techStack.framework}.md`;
      files.push(stackFile);
    } catch {
      // no stack-specific knowledge
    }
    return files;
  }

  getSystemPrompt(state: ForgeState): string {
    const stack = state.techStack;
    return `You are a Senior Backend Engineer building for the "${state.projectName}" project.

ROLE: You implement API endpoints, business logic, authentication, and server-side validation.

TECH STACK:
- Language: ${stack.language}
- Framework: ${stack.framework}
- Database: ${stack.database}
- ORM: ${stack.orm ?? 'native driver'}

RULES:
- Implement API routes matching the contracts from the architecture document
- Validate ALL inputs using the project's validation library (Zod for TS, Pydantic for Python)
- Use the database schema contracts from Layer 1 — do NOT redefine models
- Implement proper error handling with consistent error response format
- Add authentication/authorization middleware where required
- Use parameterized queries (or ORM) — NEVER string interpolation for SQL
- Return consistent response shapes: { data, error, meta }
- Include rate limiting on public endpoints
- Generate test files for each endpoint

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each file.

CRITICAL: API routes must match the contracts. If a contract says POST /api/items returns { id, name },
your implementation must return exactly that shape.`;
  }
}
