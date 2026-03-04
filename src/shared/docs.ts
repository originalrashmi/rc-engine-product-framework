/**
 * Thin wrapper for auto-generated documentation.
 *
 * Changelog from git history + project docs from pipeline artifacts.
 */

import { generateChangelog } from '../core/docs/changelog.js';
import type { ChangelogOptions } from '../core/docs/changelog.js';
import { generateProjectDocs, writeProjectDocs } from '../core/docs/project-docs.js';
import type { ProjectDoc } from '../core/docs/project-docs.js';

/** Generate changelog from git history. Returns '' on error. */
export function getChangelog(projectPath: string, options?: ChangelogOptions): string {
  try {
    return generateChangelog(projectPath, options);
  } catch {
    return '';
  }
}

/** Generate project documentation from pipeline artifacts. Returns [] on error. */
export function getProjectDocs(projectPath: string, projectName?: string): ProjectDoc[] {
  try {
    return generateProjectDocs({ projectPath, projectName });
  } catch {
    return [];
  }
}

/** Write project docs to output directory. Returns empty result on error. */
export function writeProjectDocsToDir(projectPath: string, docs: ProjectDoc[], outDir?: string): { written: string[] } {
  try {
    return writeProjectDocs(projectPath, docs, outDir);
  } catch {
    return { written: [] };
  }
}
