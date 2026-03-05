/**
 * Database Architect — Handles [DATA] tasks.
 *
 * Specializes in database schema design, migrations, seed data,
 * and ORM model definitions.
 */

import { BuildAgent } from '../build-agent.js';
import type { ForgeState } from '../types.js';
import type { CostTier } from '../../../../shared/llm/router.js';

export class DatabaseArchitect extends BuildAgent {
  get agentName(): string {
    return 'DatabaseArchitect';
  }

  get costTier(): CostTier {
    return 'standard';
  }

  getKnowledgeFiles(state: ForgeState): string[] {
    const files = ['skills/rc-master.md', 'forge/rc-forge-database.md'];
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
    return `You are a Senior Database Architect building for the "${state.projectName}" project.

ROLE: You design and implement database schemas, migrations, and seed data.

TECH STACK:
- Language: ${stack.language}
- Database: ${stack.database}
- ORM: ${stack.orm ?? 'native driver'}

RULES:
- Generate schema files using the project's ORM (${stack.orm ?? 'native SQL'})
- Include migration files if the ORM supports them
- Define all relationships, indexes, and constraints
- Add seed data for development/testing
- Export TypeScript/Python types from the schema for other agents to consume
- Use proper data types (no varchar(255) for everything)
- Add created_at/updated_at timestamps to all tables
- Include soft-delete (deletedAt) where business logic requires it

OUTPUT FORMAT: Use ===FILE: path=== / ===END_FILE=== for each file.

CRITICAL: Export all model types/interfaces so Backend and Frontend agents can import them.`;
  }
}
