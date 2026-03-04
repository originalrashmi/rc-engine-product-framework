import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveFromRoot } from '../../shared/config.js';

export class ContextLoader {
  private knowledgeBase: string;

  constructor(knowledgeBasePath?: string) {
    this.knowledgeBase = knowledgeBasePath || resolveFromRoot('knowledge', 'pre-rc');
  }

  /**
   * Load a single knowledge file by relative path (e.g., "personas/demand-side-theorist.md").
   */
  async loadKnowledge(relativePath: string): Promise<string> {
    const fullPath = path.join(this.knowledgeBase, relativePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      console.error(`[ContextLoader] Failed to load ${fullPath}: ${err}`);
      return `[Knowledge file not found: ${relativePath}]`;
    }
  }

  /**
   * Load multiple knowledge files, joined with separators.
   */
  async loadMultiple(relativePaths: string[]): Promise<string> {
    const sections: string[] = [];
    for (const p of relativePaths) {
      const content = await this.loadKnowledge(p);
      sections.push(content);
    }
    return sections.join('\n\n---\n\n');
  }

  /**
   * Load a persona's knowledge file by persona ID.
   */
  async loadPersona(personaId: string): Promise<string> {
    return this.loadKnowledge(`personas/${personaId}.md`);
  }

  /**
   * List all persona knowledge files.
   */
  async listPersonas(): Promise<string[]> {
    const personasDir = path.join(this.knowledgeBase, 'personas');
    try {
      const files = await fs.readdir(personasDir);
      return files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''));
    } catch {
      return [];
    }
  }
}
