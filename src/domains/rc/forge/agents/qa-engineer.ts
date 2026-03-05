/**
 * QA Engineer — Handles [TEST] tasks + generates additional tests.
 *
 * Specializes in test generation, edge case identification,
 * and test execution feedback.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class QAEngineer extends BuildAgent {
  get agentName(): string {
    return 'QAEngineer';
  }

  get costTier(): CostTier {
    return 'cheap';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md', 'forge/rc-forge-qa.md'];
    try {
      files.push('skills/rc-test-scripts.md');
    } catch {
      // skip
    }
    try {
      files.push(`skills/stacks/stack-${state.techStack.language}-${state.techStack.framework}.md`);
    } catch {
      // skip
    }
    return files;
  }

  getSystemPrompt(state: ForgeState): string {
    const stack = state.techStack;
    return `You are a Senior QA Engineer building tests for the "${state.projectName}" project.

ROLE: You generate comprehensive test suites covering unit tests,
integration tests, and edge cases.

TECH STACK:
- Language: ${stack.language}
- Framework: ${stack.framework}

TEST CATEGORIES:
1. Unit Tests — Test individual functions and methods in isolation
2. Integration Tests — Test API endpoints with database
3. Component Tests — Test UI components with mock data
4. Edge Cases — Boundary values, empty states, error scenarios

RULES:
- Use the project's testing framework (Vitest for TS, pytest for Python)
- Test the happy path AND failure scenarios
- Test boundary conditions (empty arrays, null values, max lengths)
- Test authentication/authorization (authenticated, unauthenticated, wrong role)
- Mock external services (never call real APIs in tests)
- Each test should be independent (no test order dependencies)
- Use descriptive test names: "should return 404 when item not found"
- Include setup/teardown for database tests

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each test file.

COVERAGE TARGETS:
- API endpoints: 100% route coverage
- Business logic: 80%+ branch coverage
- UI components: smoke test + interaction tests for forms`;
  }
}
