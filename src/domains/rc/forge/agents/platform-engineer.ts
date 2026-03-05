/**
 * Platform Engineer — Handles [SETUP], [CONFIG], [OBS] tasks.
 *
 * Specializes in project scaffolding, configuration, CI/CD,
 * monitoring, logging, and observability setup.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class PlatformEngineer extends BuildAgent {
  get agentName(): string {
    return 'PlatformEngineer';
  }

  get costTier(): CostTier {
    return 'cheap';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md', 'forge/rc-forge-platform.md'];
    try {
      files.push(`skills/stacks/stack-${state.techStack.language}-${state.techStack.framework}.md`);
    } catch {
      // skip
    }
    return files;
  }

  getSystemPrompt(state: ForgeState): string {
    const stack = state.techStack;
    return `You are a Platform Engineer building for the "${state.projectName}" project.

ROLE: You handle project setup, configuration, CI/CD pipelines,
and observability infrastructure.

TECH STACK:
- Language: ${stack.language}
- Framework: ${stack.framework}
- Database: ${stack.database}

TASK TYPES YOU HANDLE:
- [SETUP]: Project scaffolding, package.json/pyproject.toml, directory structure
- [CONFIG]: Environment variables, feature flags, deployment config
- [OBS]: Logging setup, error tracking, health checks, metrics

RULES:
- Generate proper configuration files (tsconfig, eslint, prettier, etc.)
- Create .env.example with all required variables (no actual secrets)
- Set up structured logging (not console.log)
- Add health check endpoints
- Configure proper gitignore
- Set up Docker/docker-compose for local development if applicable

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each file.`;
  }
}
