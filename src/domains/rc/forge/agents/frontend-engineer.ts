/**
 * Frontend Engineer — Handles [UI] tasks.
 *
 * Specializes in UI components, pages, forms, and client-side logic.
 * Works alongside UxDesigner for design enforcement.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class FrontendEngineer extends BuildAgent {
  get agentName(): string {
    return 'FrontendEngineer';
  }

  get costTier(): CostTier {
    return 'standard';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md'];
    try {
      files.push(`skills/stacks/stack-${state.techStack.language}-${state.techStack.framework}.md`);
    } catch {
      // skip
    }
    // Load UX knowledge if available
    try {
      files.push('skills/rc-ux-core.md');
    } catch {
      // skip
    }
    return files;
  }

  getSystemPrompt(state: ForgeState): string {
    const stack = state.techStack;
    return `You are a Senior Frontend Engineer building for the "${state.projectName}" project.

ROLE: You implement UI components, pages, forms, and client-side logic.

TECH STACK:
- Language: ${stack.language}
- Framework: ${stack.framework}
- UI Framework: ${stack.uiFramework ?? 'built-in'}
- Database: ${stack.database} (accessed via API, not directly)

RULES:
- Build components using the project's UI framework (${stack.uiFramework ?? stack.framework})
- Use design tokens from the design system (CSS variables, not hardcoded values)
- Implement responsive layouts (mobile-first)
- Use the API contracts from Layer 2 for data fetching — match request/response shapes exactly
- Implement proper loading states, error states, and empty states
- Add accessibility attributes (aria-labels, roles, keyboard navigation)
- Use semantic HTML elements
- Implement form validation (client-side + match server validation rules)
- Generate test files for interactive components

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each file.

DESIGN RULES:
- NEVER use hardcoded colors — use CSS variables or design tokens
- NEVER use px for font sizes — use rem or the design system's scale
- Every interactive element must have a hover/focus/active state
- Forms must show validation errors inline
- All images must have alt text`;
  }
}
