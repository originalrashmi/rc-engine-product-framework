import { KnowledgeLoader } from './knowledge-loader.js';
import { ProjectFileLoader } from './project-file-loader.js';
import { PreRcDetector } from './prerc-detector.js';
import type { PreRcDetectionResult } from './prerc-detector.js';

/**
 * ContextLoader — facade that composes KnowledgeLoader, ProjectFileLoader, and PreRcDetector.
 *
 * Preserves the existing public API so all agent imports continue to work unchanged.
 * Internally delegates to the three focused classes.
 */
export class ContextLoader {
  private knowledge: KnowledgeLoader;
  private projectFiles: ProjectFileLoader;
  private preRcDetector: PreRcDetector;

  constructor() {
    this.knowledge = new KnowledgeLoader();
    this.projectFiles = new ProjectFileLoader();
    this.preRcDetector = new PreRcDetector(this.projectFiles);
  }

  // ── Knowledge Loading (delegates to KnowledgeLoader) ───────────────────

  loadFile(relativePath: string): string {
    return this.knowledge.loadFile(relativePath);
  }

  tryLoadFile(relativePath: string): string | null {
    return this.knowledge.tryLoadFile(relativePath);
  }

  isProMode(): boolean {
    return this.knowledge.isProMode();
  }

  loadFiles(relativePaths: string[]): string {
    return this.knowledge.loadFiles(relativePaths);
  }

  loadRequiredFiles(relativePaths: string[]): string {
    return this.knowledge.loadRequiredFiles(relativePaths);
  }

  loadUxContext(taskType: string, loadSpecialists: boolean = false): string {
    return this.knowledge.loadUxContext(taskType, loadSpecialists);
  }

  getSpecialistsForTask(taskType: string): string[] {
    return this.knowledge.getSpecialistsForTask(taskType);
  }

  loadUxTriggers(): string {
    return this.knowledge.loadUxTriggers();
  }

  loadDesignContext(phase: 'research' | 'generate' | 'critique'): string {
    return this.knowledge.loadDesignContext(phase);
  }

  loadCopyContext(phase: 'research' | 'generate' | 'critique'): string {
    return this.knowledge.loadCopyContext(phase);
  }

  // ── Project File Loading (delegates to ProjectFileLoader) ──────────────

  loadProjectFile(projectPath: string, relativePath: string): string {
    return this.projectFiles.loadProjectFile(projectPath, relativePath);
  }

  projectFileExists(projectPath: string, relativePath: string): boolean {
    return this.projectFiles.projectFileExists(projectPath, relativePath);
  }

  // ── Pre-RC Detection (delegates to PreRcDetector) ──────────────────────

  detectPreRcArtifacts(projectPath: string): PreRcDetectionResult {
    return this.preRcDetector.detectPreRcArtifacts(projectPath);
  }

  loadPreRcPrd(projectPath: string): string | null {
    return this.preRcDetector.loadPreRcPrd(projectPath);
  }
}

// Re-export PreRcDetectionResult from the facade module for backward compatibility
export type { PreRcDetectionResult } from './prerc-detector.js';
