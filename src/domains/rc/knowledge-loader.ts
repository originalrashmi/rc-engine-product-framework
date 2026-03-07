import fs from 'node:fs';
import path from 'node:path';
import { resolveFromRoot } from '../../shared/config.js';
import { UX_ROUTING_TABLE } from './types.js';

/**
 * KnowledgeLoader — loads knowledge files from community and Pro overlay directories.
 *
 * Single responsibility: resolve and read knowledge files.
 * Pro files override community files when present (overlay pattern).
 */
export class KnowledgeLoader {
  private basePath: string;
  private proBasePath: string | null;

  constructor() {
    this.basePath = resolveFromRoot('knowledge', 'rc');
    this.proBasePath = this.resolveProPath();
  }

  /** Resolve Pro knowledge path if available */
  private resolveProPath(): string | null {
    const envPath = process.env.RC_KNOWLEDGE_PATH;
    if (envPath) {
      const rcPath = path.join(envPath, 'rc');
      if (fs.existsSync(rcPath)) return rcPath;
      if (fs.existsSync(envPath)) return envPath;
    }
    const proPath = resolveFromRoot('knowledge-pro', 'rc');
    if (fs.existsSync(proPath)) return proPath;
    return null;
  }

  /** Load a single knowledge file by relative path. Pro files override community files. */
  loadFile(relativePath: string): string {
    if (this.proBasePath) {
      const proFullPath = path.join(this.proBasePath, relativePath);
      if (fs.existsSync(proFullPath)) {
        return fs.readFileSync(proFullPath, 'utf-8');
      }
    }
    const fullPath = path.join(this.basePath, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Knowledge file not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /** Try to load a knowledge file, returning null if not found */
  tryLoadFile(relativePath: string): string | null {
    try {
      return this.loadFile(relativePath);
    } catch {
      return null;
    }
  }

  /** Check if Pro knowledge is available */
  isProMode(): boolean {
    return this.proBasePath !== null;
  }

  /**
   * Load multiple knowledge files, joined with separators.
   * Skips missing files. Use for OPTIONAL knowledge only.
   * For required knowledge, use loadRequiredFiles() instead.
   */
  loadFiles(relativePaths: string[]): string {
    return relativePaths
      .map((p) => this.tryLoadFile(p))
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  /**
   * Load multiple knowledge files that are ALL required.
   * Throws with a clear error listing every missing file.
   */
  loadRequiredFiles(relativePaths: string[]): string {
    const missing: string[] = [];
    const loaded: string[] = [];

    for (const p of relativePaths) {
      const content = this.tryLoadFile(p);
      if (content) {
        loaded.push(content);
      } else {
        missing.push(p);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Required knowledge files missing (${missing.length}/${relativePaths.length}):\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\n\nThese files are required for the agent to produce quality output. ` +
        `Create them in knowledge/rc/ or check for path typos.`
      );
    }

    return loaded.join('\n\n---\n\n');
  }

  /**
   * Load UX core rules + dynamically selected specialist modules.
   *
   * Tier-aware: specialist modules only exist in Pro knowledge.
   * If loadSpecialists=false (community tier), loads only core rules.
   * If loadSpecialists=true (Pro tier), loads specialists and THROWS if any are missing.
   */
  loadUxContext(taskType: string, loadSpecialists: boolean = false): string {
    const core = this.loadFile('skills/rc-ux-core.md');
    const specialists = this.getSpecialistsForTask(taskType);

    if (specialists.length === 0 || !loadSpecialists) {
      return core;
    }

    const specialistPaths = specialists.map((s) => `ux/specialists/${s}.md`);
    const specialistContent = this.loadRequiredFiles(specialistPaths);

    return `${core}\n\n---\n\n${specialistContent}`;
  }

  /** Get specialist module names for a task type using the routing table */
  getSpecialistsForTask(taskType: string): string[] {
    const normalized = taskType.toLowerCase().replace(/[\s-]/g, '_');
    return UX_ROUTING_TABLE[normalized] ?? [];
  }

  /** Load UX triggers scoring rubric */
  loadUxTriggers(): string {
    return this.loadFile('ux/UX-TRIGGERS.md');
  }

  /** Load design skill files for a specific phase. Throws if any are missing. */
  loadDesignContext(phase: 'research' | 'generate' | 'critique'): string {
    const files: Record<string, string[]> = {
      research: [
        'skills/design/rc-design-research.md',
        'skills/design/rc-design-cognitive.md',
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-trends-2026.md',
      ],
      generate: [
        'skills/design/rc-design-patterns.md',
        'skills/design/rc-design-emotional.md',
        'skills/design/rc-design-accessibility.md',
        'skills/design/rc-design-trends-2026.md',
        'skills/design/rc-design-typography.md',
      ],
      critique: [
        'skills/design/rc-design-critique.md',
        'skills/design/rc-design-accessibility.md',
      ],
    };

    return this.loadRequiredFiles(files[phase] ?? []);
  }

  /** Load copy skill files for a specific phase. Throws if any are missing. */
  loadCopyContext(phase: 'research' | 'generate' | 'critique'): string {
    const files: Record<string, string[]> = {
      research: [
        'skills/copy/rc-copy-research.md',
        'skills/copy/rc-copy-frameworks.md',
      ],
      generate: [
        'skills/copy/rc-copy-voice-tone.md',
        'skills/copy/rc-copy-microcopy.md',
        'skills/copy/rc-copy-frameworks.md',
        'skills/copy/rc-copy-seo.md',
      ],
      critique: [
        'skills/copy/rc-copy-critique.md',
      ],
    };

    return this.loadRequiredFiles(files[phase] ?? []);
  }
}
