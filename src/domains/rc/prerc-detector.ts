import fs from 'node:fs';
import path from 'node:path';
import { ProjectFileLoader } from './project-file-loader.js';

/**
 * PreRcDetector — detects and loads Pre-RC Method artifacts from a project.
 *
 * Single responsibility: Pre-RC artifact detection and loading.
 */
export class PreRcDetector {
  private projectFileLoader: ProjectFileLoader;

  constructor(projectFileLoader?: ProjectFileLoader) {
    this.projectFileLoader = projectFileLoader ?? new ProjectFileLoader();
  }

  /** Detect Pre-RC Method artifacts in the project directory */
  detectPreRcArtifacts(projectPath: string): PreRcDetectionResult {
    const preRcDir = path.join(projectPath, 'pre-rc-research');

    if (!fs.existsSync(preRcDir)) {
      return { found: false, prdPath: null, statePath: null, taskListPath: null, artifactPaths: [], isComplete: false };
    }

    const files = fs.readdirSync(preRcDir);
    const prdFile = files.find((f) => f.startsWith('prd-') && f.endsWith('.md'));
    const taskFile = files.find((f) => f.startsWith('tasks-') && f.endsWith('.md'));

    const stateDir = path.join(preRcDir, 'state');
    const hasState = fs.existsSync(path.join(stateDir, 'PRC-STATE.md'));

    let isComplete = false;
    if (hasState) {
      const stateContent = fs.readFileSync(path.join(stateDir, 'PRC-STATE.md'), 'utf-8');
      isComplete = /gate[_\s-]*3.*approved/i.test(stateContent);
    }

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
    return this.projectFileLoader.loadProjectFile(projectPath, detection.prdPath);
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
