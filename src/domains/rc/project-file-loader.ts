import fs from 'node:fs';
import path from 'node:path';

/**
 * ProjectFileLoader — reads project artifacts (PRDs, task lists, design specs)
 * from the project directory.
 *
 * Single responsibility: project file I/O.
 */
export class ProjectFileLoader {
  /** Read a project artifact file from the project directory */
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
}
