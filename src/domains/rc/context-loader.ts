import fs from 'node:fs';
import path from 'node:path';
import { resolveFromRoot } from '../../shared/config.js';
import type { UxMode } from './types.js';
import { UX_ROUTING_TABLE } from './types.js';

export class ContextLoader {
  private basePath: string;

  constructor() {
    // Knowledge base lives at <package-root>/knowledge/rc/
    this.basePath = resolveFromRoot('knowledge', 'rc');
  }

  /** Load a single knowledge file by relative path */
  loadFile(relativePath: string): string {
    const fullPath = path.join(this.basePath, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Knowledge file not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /** Load multiple knowledge files, joined with separators */
  loadFiles(relativePaths: string[]): string {
    return relativePaths.map((p) => this.loadFile(p)).join('\n\n---\n\n');
  }

  /**
   * Load UX core rules + dynamically selected specialist modules.
   *
   * Token optimization: when uxMode is 'standard', only the core 42 rules
   * are loaded. Specialist modules are only loaded for 'selective' or
   * 'deep_dive' modes, saving significant tokens on simpler projects.
   */
  loadUxContext(taskType: string, uxMode?: UxMode | null): string {
    const core = this.loadFile('skills/rc-ux-core.md');

    // Standard mode: core rules only, skip specialist modules
    if (uxMode === 'standard') {
      return core;
    }

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
