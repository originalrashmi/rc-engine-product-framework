import * as fs from 'fs/promises';
import * as path from 'path';
import type { ResearchState } from '../types.js';
import { ResearchStateManager } from './research-state.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { ResearchStateSchema } from './schemas.js';

const STATE_DIR = 'pre-rc-research';
const STATE_FILE = 'state/PRC-STATE.md';

export class StatePersistence {
  /**
   * Create the full directory structure for a new research project.
   */
  async createDirectories(projectPath: string): Promise<void> {
    const base = path.join(projectPath, STATE_DIR);
    const dirs = [
      path.join(base, 'state'),
      path.join(base, 'stage-1-meta'),
      path.join(base, 'stage-2-user-intelligence'),
      path.join(base, 'stage-3-business-market'),
      path.join(base, 'stage-4-technical'),
      path.join(base, 'stage-5-ux'),
      path.join(base, 'stage-6-validation'),
      path.join(base, 'gates'),
    ];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Save research state to CheckpointStore (primary) and markdown export (side-effect).
   */
  async save(state: ResearchState): Promise<void> {
    const { store, pipelineId } = getProjectStore(state.projectPath);
    store.save(pipelineId, NODE_IDS.PRE_RC_STATE, state);
    // Best-effort markdown export for human readability
    void this.writeMarkdownExport(state);
  }

  /**
   * Load research state. Tries CheckpointStore first, falls back to
   * legacy markdown migration. Returns null if no state exists.
   */
  async load(projectPath: string): Promise<ResearchStateManager | null> {
    try {
      const { store, pipelineId } = getProjectStore(projectPath);
      const checkpoint = store.load(pipelineId, NODE_IDS.PRE_RC_STATE, ResearchStateSchema);
      return ResearchStateManager.fromState(checkpoint.state as ResearchState);
    } catch (err) {
      if ((err as Error).message.includes('No checkpoint found')) {
        return this.migrateFromMarkdown(projectPath);
      }
      throw err;
    }
  }

  /**
   * Check if a research project exists at this path.
   */
  async exists(projectPath: string): Promise<boolean> {
    try {
      const { store, pipelineId } = getProjectStore(projectPath);
      store.load(pipelineId, NODE_IDS.PRE_RC_STATE, ResearchStateSchema);
      return true;
    } catch {
      // Fall back to legacy file check during migration transition
      const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Write a file into the research folder.
   */
  async writeArtifact(projectPath: string, relativePath: string, content: string): Promise<string> {
    const fullPath = path.join(projectPath, STATE_DIR, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return fullPath;
  }

  /**
   * Read a file from the research folder.
   */
  async readArtifact(projectPath: string, relativePath: string): Promise<string | null> {
    const fullPath = path.join(projectPath, STATE_DIR, relativePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ── Migration ──────────────────────────────────────────────────────────

  private async migrateFromMarkdown(projectPath: string): Promise<ResearchStateManager | null> {
    const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const state = this.fromMarkdown(content);
      const validated = ResearchStateSchema.parse(state);
      const { store, pipelineId } = getProjectStore(projectPath);
      store.save(pipelineId, NODE_IDS.PRE_RC_STATE, validated);
      return ResearchStateManager.fromState(validated as ResearchState);
    } catch {
      return null;
    }
  }

  // ── Markdown export (write-only) ──────────────────────────────────────

  private async writeMarkdownExport(state: ResearchState): Promise<void> {
    try {
      const filePath = path.join(state.projectPath, STATE_DIR, STATE_FILE);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const markdown = this.toMarkdown(state);
      await fs.writeFile(filePath, markdown, 'utf-8');
    } catch (err) {
      console.error('[pre-rc] Warning: failed to write markdown export:', (err as Error).message);
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────

  private toMarkdown(state: ResearchState): string {
    const lines: string[] = [];

    lines.push(`# Pre-RC Research State: ${state.projectName}\n`);
    lines.push(`**Project:** ${state.projectName}`);
    lines.push(`**Path:** ${state.projectPath}`);
    lines.push(`**Created:** ${state.createdAt}`);
    lines.push(`**Updated:** ${state.updatedAt}\n`);

    if (state.classification) {
      lines.push(`## Complexity Classification\n`);
      lines.push(`- **Domain:** ${state.classification.domain}`);
      lines.push(`- **Confidence:** ${state.classification.confidence}`);
      lines.push(`- **Product Class:** ${state.classification.productClass}`);
      lines.push(`- **Reasoning:** ${state.classification.reasoning}\n`);
    }

    if (state.personaSelection) {
      lines.push(`## Persona Selection\n`);
      lines.push(
        `**Active:** ${state.personaSelection.totalActive} | **Skipped:** ${state.personaSelection.totalSkipped}\n`,
      );
    }

    lines.push(`## Stage Progress\n`);
    lines.push(`| Stage | Status |`);
    lines.push(`|-------|--------|`);
    for (const [stage, status] of Object.entries(state.stageStatus)) {
      const icon =
        status === 'completed'
          ? 'done'
          : status === 'in_progress'
            ? 'running'
            : status === 'skipped'
              ? 'skip'
              : 'pending';
      lines.push(`| ${stage} | ${icon} |`);
    }
    lines.push('');

    if (state.gates.length > 0) {
      lines.push(`## Gates\n`);
      for (const g of state.gates) {
        lines.push(`- **Gate ${g.gateNumber}:** ${g.status} (${g.timestamp})${g.feedback ? ` - ${g.feedback}` : ''}`);
      }
      lines.push('');
    }

    if (state.artifacts.length > 0) {
      lines.push(`## Artifacts (${state.artifacts.length})\n`);
      for (const a of state.artifacts) {
        lines.push(`- \`${a.personaId}\` (${a.llmUsed}) - ${a.tokenCount} tokens - ${a.filePath}`);
      }
      lines.push('');
    }

    lines.push('---\n');
    lines.push('<!-- PRC_STATE_JSON');
    lines.push(JSON.stringify(state, null, 2).replace(/-->/g, '--\\u003e'));
    lines.push('PRC_STATE_JSON_END -->');

    return lines.join('\n');
  }

  // ── Legacy parser (migration only) ────────────────────────────────────

  private fromMarkdown(content: string): ResearchState {
    const match = content.match(/<!-- PRC_STATE_JSON\s*([\s\S]*?)\s*PRC_STATE_JSON_END\s*-->/);
    if (!match) {
      const legacyMatch = content.match(/<!-- PRC_STATE_JSON\s*([\s\S]*)\s*-->\s*$/);
      if (!legacyMatch) {
        throw new Error('Invalid PRC-STATE.md: missing embedded JSON');
      }
      return JSON.parse(legacyMatch[1].replace(/--\\u003e/g, '-->')) as ResearchState;
    }
    return JSON.parse(match[1].replace(/--\\u003e/g, '-->')) as ResearchState;
  }
}
