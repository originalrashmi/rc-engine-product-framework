import type { ProjectState } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Safe file write with directory creation and error handling.
 * Returns true on success, throws with user-friendly message on failure.
 */
export function safeWriteFile(filePath: string, content: string): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const msg =
      (err as NodeJS.ErrnoException).code === 'EACCES'
        ? `Permission denied writing to ${filePath}. Check directory permissions.`
        : `Failed to write ${filePath}: ${(err as Error).message}`;
    throw new Error(msg, { cause: err });
  }
}

/** Check if a PRD exists in the project (rc-method/prds/ or pre-rc-research/) */
export function hasPrd(projectPath: string): boolean {
  const prdDir = path.join(projectPath, 'rc-method', 'prds');
  if (fs.existsSync(prdDir) && fs.readdirSync(prdDir).some((f) => f.endsWith('.md'))) return true;
  const preRcDir = path.join(projectPath, 'pre-rc-research');
  if (fs.existsSync(preRcDir) && fs.readdirSync(preRcDir).some((f) => f.endsWith('.md') && f.includes('prd')))
    return true;
  return false;
}

/** De-duplicate state.artifacts in-place */
export function deduplicateArtifacts(state: ProjectState): void {
  state.artifacts = [...new Set(state.artifacts)];
}

/** Add artifact ref to state without duplicates */
export function addArtifact(state: ProjectState, ref: string): void {
  if (!state.artifacts.includes(ref)) {
    state.artifacts.push(ref);
  }
}
