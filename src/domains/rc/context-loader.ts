import fs from 'node:fs';
import path from 'node:path';
import { resolveFromRoot } from '../../shared/config.js';
import { UX_ROUTING_TABLE } from './types.js';

export class ContextLoader {
  private basePath: string;
  private proBasePath: string | null;

  constructor() {
    // Community knowledge base at <package-root>/knowledge/rc/
    this.basePath = resolveFromRoot('knowledge', 'rc');
    // Pro knowledge overlay: RC_KNOWLEDGE_PATH env, or knowledge-pro/ directory
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
    // Try Pro path first (overlay)
    if (this.proBasePath) {
      const proFullPath = path.join(this.proBasePath, relativePath);
      if (fs.existsSync(proFullPath)) {
        return fs.readFileSync(proFullPath, 'utf-8');
      }
    }
    // Fall back to community path
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

  /** Load multiple knowledge files, joined with separators. Skips missing files gracefully. */
  loadFiles(relativePaths: string[]): string {
    return relativePaths
      .map((p) => this.tryLoadFile(p))
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  /** Load UX core rules + dynamically selected specialist modules */
  loadUxContext(taskType: string): string {
    const core = this.loadFile('skills/rc-ux-core.md');
    const specialists = this.getSpecialistsForTask(taskType);

    if (specialists.length === 0) {
      return core;
    }

    const specialistContent = specialists
      .map((s) => {
        try {
          return this.loadFile(`ux/specialists/${s}.md`);
        } catch {
          console.error(`Warning: specialist module ${s}.md not found`);
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

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

  /** Load design skill files for a specific phase */
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

    return (files[phase] ?? [])
      .map((f) => {
        try {
          return this.loadFile(f);
        } catch {
          console.error(`Warning: design skill file ${f} not found`);
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  /** Load copy skill files for a specific phase */
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

    return (files[phase] ?? [])
      .map((f) => {
        try {
          return this.loadFile(f);
        } catch {
          console.error(`Warning: copy skill file ${f} not found`);
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  /** Read a project artifact file (PRD, task list, etc.) from the project directory */
  loadProjectFile(projectPath: string, relativePath: string): string {
    const fullPath = path.join(projectPath, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Project file not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /** Check if a project file exists */
  projectFileExists(projectPath: string, relativePath: string): boolean {
    return fs.existsSync(path.join(projectPath, relativePath));
  }

  /** Detect Pre-RC Method artifacts in the project directory */
  detectPreRcArtifacts(projectPath: string): PreRcDetectionResult {
    const preRcDir = path.join(projectPath, 'pre-rc-research');

    if (!fs.existsSync(preRcDir)) {
      return { found: false, prdPath: null, statePath: null, taskListPath: null, artifactPaths: [], isComplete: false };
    }

    // Find PRD markdown (prd-*.md) and task list (tasks-*.md)
    const files = fs.readdirSync(preRcDir);
    const prdFile = files.find((f) => f.startsWith('prd-') && f.endsWith('.md'));
    const taskFile = files.find((f) => f.startsWith('tasks-') && f.endsWith('.md'));

    // Check state directory for PRC-STATE.md
    const stateDir = path.join(preRcDir, 'state');
    const hasState = fs.existsSync(path.join(stateDir, 'PRC-STATE.md'));

    // Check Gate 3 approval in state file
    let isComplete = false;
    if (hasState) {
      const stateContent = fs.readFileSync(path.join(stateDir, 'PRC-STATE.md'), 'utf-8');
      isComplete = /gate[_\s-]*3.*approved/i.test(stateContent);
    }

    // Collect research artifact paths from stage directories
    const artifactPaths: string[] = [];
    const stageDirs = [
      'stage-1-meta',
      'stage-2-user-intelligence',
      'stage-3-business-market',
      'stage-4-technical',
      'stage-5-ux',
      'stage-6-validation',
    ];
    for (const dir of stageDirs) {
      const stageDir = path.join(preRcDir, dir);
      if (fs.existsSync(stageDir)) {
        for (const f of fs.readdirSync(stageDir)) {
          if (f.endsWith('.md')) {
            artifactPaths.push(path.join('pre-rc-research', dir, f));
          }
        }
      }
    }

    return {
      found: true,
      prdPath: prdFile ? path.join('pre-rc-research', prdFile) : null,
      statePath: hasState ? 'pre-rc-research/state/PRC-STATE.md' : null,
      taskListPath: taskFile ? path.join('pre-rc-research', taskFile) : null,
      artifactPaths,
      isComplete,
    };
  }

  /** Load the Pre-RC PRD content */
  loadPreRcPrd(projectPath: string): string | null {
    const detection = this.detectPreRcArtifacts(projectPath);
    if (!detection.found || !detection.prdPath) return null;
    return this.loadProjectFile(projectPath, detection.prdPath);
  }
}

export interface PreRcDetectionResult {
  found: boolean;
  prdPath: string | null;
  statePath: string | null;
  taskListPath: string | null;
  artifactPaths: string[];
  isComplete: boolean;
}
