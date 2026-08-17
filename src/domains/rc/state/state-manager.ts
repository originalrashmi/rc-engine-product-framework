import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { Phase, GateRecord, ProjectState, UxMode } from '../types.js';
import { GateStatus, PHASE_NAMES } from '../types.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { ProjectStateSchema } from './schemas.js';

const STATE_DIR = 'rc-method/state';
const STATE_FILE = 'RC-STATE.md';

export class StateManager {
  /**
   * Version each pipeline's rc:state was at when this instance last loaded it.
   * save() asserts against it (CAS tripwire, ADR-2): if another writer saved
   * in between, CheckpointStore throws StaleStateError instead of silently
   * appending a stale copy. Unset (e.g. first create) means unconditional save.
   */
  private loadedVersions = new Map<string, number>();

  /**
   * Build a fresh in-memory project state WITHOUT persisting anything.
   * Callers run the fallible part of project startup (LLM call, Pre-RC
   * bridge) first and only then persist(), so a failed start leaves no ghost
   * "project already exists" state behind.
   */
  buildState(projectPath: string, projectName: string): ProjectState {
    return {
      projectName,
      projectPath,
      currentPhase: 1,
      gates: {},
      artifacts: [],
      uxScore: null,
      uxMode: null,
    };
  }

  /** Create project directories and persist the state (the durable half of create). */
  persist(projectPath: string, state: ProjectState): void {
    fs.mkdirSync(path.join(projectPath, STATE_DIR), { recursive: true });
    for (const dir of ['prds', 'tasks', 'gates', 'logs']) {
      fs.mkdirSync(path.join(projectPath, 'rc-method', dir), { recursive: true });
    }
    this.save(projectPath, state);
  }

  /** Create a new project state file (build + persist in one step). */
  create(projectPath: string, projectName: string): ProjectState {
    const state = this.buildState(projectPath, projectName);
    this.persist(projectPath, state);
    return state;
  }

  /** Load project state from CheckpointStore, with legacy markdown migration. */
  load(projectPath: string): ProjectState {
    const { store, pipelineId } = getProjectStore(projectPath);
    try {
      const checkpoint = store.load(pipelineId, NODE_IDS.RC_STATE, ProjectStateSchema);
      this.loadedVersions.set(pipelineId, checkpoint.version);
      return checkpoint.state;
    } catch (err) {
      if ((err as Error).message.includes('No checkpoint found')) {
        return this.migrateFromMarkdown(projectPath);
      }
      throw new Error(
        `RC Method state error: ${(err as Error).message}. ` + `Run rc_start or rc_import_prerc to initialize.`,
        { cause: err },
      );
    }
  }

  /** Save project state to CheckpointStore (primary) + async markdown export (non-blocking). */
  save(projectPath: string, state: ProjectState): void {
    const { store, pipelineId } = getProjectStore(projectPath);
    const { version } = store.save(
      pipelineId,
      NODE_IDS.RC_STATE,
      state,
      undefined,
      this.loadedVersions.get(pipelineId),
    );
    this.loadedVersions.set(pipelineId, version);
    // NOTE: no markdown side effect here (ADR-6). The fire-and-forget export
    // raced its own rename on rapid saves (stale RC-STATE.md, orphaned .tmp
    // files on OneDrive-synced filesystems). RC-STATE.md is now an on-demand
    // export - see exportMarkdown(), called from rc_status.
  }

  /** Check if a project state exists */
  exists(projectPath: string): boolean {
    const { store, pipelineId } = getProjectStore(projectPath);
    try {
      store.load(pipelineId, NODE_IDS.RC_STATE, ProjectStateSchema);
      return true;
    } catch {
      // Fall back to legacy file check during migration transition
      return fs.existsSync(path.join(projectPath, STATE_DIR, STATE_FILE));
    }
  }

  // ── On-demand markdown export (ADR-6) ──────────────────────────────────

  /**
   * Export the current state as human-readable RC-STATE.md, stamped with the
   * checkpoint version and timestamp it was generated from. Called on demand
   * (rc_status), never as a save side effect. Cleans up its .tmp on failure.
   */
  async exportMarkdown(projectPath: string, state?: ProjectState): Promise<void> {
    const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const current = state ?? this.load(projectPath);
      const { pipelineId } = getProjectStore(projectPath);
      const version = this.loadedVersions.get(pipelineId);
      const stamp = `<!-- exported from checkpoint v${version ?? 'unknown'} at ${new Date().toISOString()} - read model only, source of truth is .rc-engine/state.db -->\n`;
      await fsAsync.mkdir(path.dirname(filePath), { recursive: true });
      await fsAsync.writeFile(tmpPath, stamp + this.serialize(current), 'utf-8');
      await fsAsync.rename(tmpPath, filePath);
    } catch (err) {
      console.error('[rc] Warning: failed to write markdown export:', (err as Error).message);
      await fsAsync.rm(tmpPath, { force: true }).catch(() => {});
    }
  }

  // ── Migration ──────────────────────────────────────────────────────────

  private migrateFromMarkdown(projectPath: string): ProjectState {
    const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    if (!fs.existsSync(filePath)) {
      throw new Error(`No RC Method project found at ${projectPath}. Use rc_start to begin a new project.`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    // Guarded migration (ADR-6): this path only runs when NO checkpoint
    // exists in state.db. Log loudly which export stamp is being resurrected
    // so a stale markdown can never silently reintroduce old state.
    const stampMatch = content.match(/<!-- exported from checkpoint (v\S+) at (\S+) /);
    console.error(
      `[rc] MIGRATION: no checkpoint found in .rc-engine/state.db; bootstrapping state from legacy ` +
        `${STATE_FILE}${stampMatch ? ` (export stamp ${stampMatch[1]} @ ${stampMatch[2]})` : ' (no export stamp)'}.`,
    );
    const state = this.parse(content, projectPath);
    // Bootstrap into CheckpointStore
    const { store, pipelineId } = getProjectStore(projectPath);
    store.save(pipelineId, NODE_IDS.RC_STATE, state);
    return state;
  }

  // ── Legacy parsers (migration only) ────────────────────────────────────

  private parse(content: string, projectPath: string): ProjectState {
    const jsonMatch = content.match(/<!-- RC_STATE_JSON\n([\s\S]*?)\nRC_STATE_JSON_END -->/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Omit<ProjectState, 'projectPath'>;
        return { ...parsed, projectPath };
      } catch {
        console.error('[rc] Embedded JSON parse failed, falling back to regex parsing');
      }
    }
    return this.parseLegacy(content, projectPath);
  }

  private parseLegacy(content: string, projectPath: string): ProjectState {
    const state: ProjectState = {
      projectName: '',
      projectPath,
      currentPhase: 1,
      gates: {},
      artifacts: [],
      uxScore: null,
      uxMode: null,
    };

    const nameMatch = content.match(/^# RC Method State: (.+)$/m);
    if (nameMatch) {
      state.projectName = nameMatch[1].trim();
    }

    const phaseMatch = content.match(/Current:\s*(\d)/m);
    if (phaseMatch) {
      state.currentPhase = parseInt(phaseMatch[1], 10) as Phase;
    }

    const gateRegex = /\|\s*(\d)\s*-\s*\w+\s*\|\s*(pending|approved|rejected)\s*\|\s*([\d-]*)\s*\|\s*(.*?)\s*\|/g;
    let gateMatch;
    while ((gateMatch = gateRegex.exec(content)) !== null) {
      const phase = parseInt(gateMatch[1], 10) as Phase;
      const rawStatus = gateMatch[2].trim() as 'pending' | 'approved' | 'rejected';
      const statusMap: Record<string, GateStatus> = {
        pending: GateStatus.Pending,
        approved: GateStatus.Approved,
        rejected: GateStatus.Rejected,
      };
      state.gates[phase] = {
        status: statusMap[rawStatus] ?? GateStatus.Pending,
        date: gateMatch[3].trim() || undefined,
        feedback: gateMatch[4].trim() || undefined,
      };
    }

    const artifactsSection = content.match(/## Artifacts\n([\s\S]*?)(?=\n## |$)/);
    if (artifactsSection) {
      const artifactLines = artifactsSection[1].match(/^- (.+)$/gm);
      if (artifactLines) {
        state.artifacts = artifactLines.map((line) => line.replace(/^- /, ''));
      }
    }

    const uxScoreMatch = content.match(/Score:\s*(\d+)/m);
    if (uxScoreMatch) {
      state.uxScore = parseInt(uxScoreMatch[1], 10);
    }

    const uxModeMatch = content.match(/Mode:\s*(standard|selective|deep_dive)/m);
    if (uxModeMatch) {
      state.uxMode = uxModeMatch[1] as UxMode;
    }

    const preRcSection = content.match(/## Pre-RC Source\n([\s\S]*?)(?=\n## |$)/);
    if (preRcSection) {
      const section = preRcSection[1];
      const prdPathMatch = section.match(/PRD:\s*(.+)/m);
      const statePathMatch = section.match(/State:\s*(.+)/m);
      const importedAtMatch = section.match(/Imported:\s*(.+)/m);
      const artifactCountMatch = section.match(/Artifacts:\s*(\d+)/m);
      const personaCountMatch = section.match(/Personas:\s*(\d+)/m);

      if (prdPathMatch) {
        state.preRcSource = {
          prdPath: prdPathMatch[1].trim(),
          statePath: statePathMatch?.[1]?.trim() ?? '',
          importedAt: importedAtMatch?.[1]?.trim() ?? '',
          artifactCount: artifactCountMatch ? parseInt(artifactCountMatch[1], 10) : 0,
          personaCount: personaCountMatch ? parseInt(personaCountMatch[1], 10) : 0,
        };
      }
    }

    return state;
  }

  // ── Serialization (markdown export only) ───────────────────────────────

  private serialize(state: ProjectState): string {
    const lines: string[] = [
      `# RC Method State: ${state.projectName}`,
      '',
      '## Phase',
      `Current: ${state.currentPhase} - ${PHASE_NAMES[state.currentPhase]}`,
      '',
      '## Gates',
      '| Phase | Status | Date | Feedback |',
      '|---|---|---|---|',
    ];

    for (let i = 1; i <= 8; i++) {
      const phase = i as Phase;
      const gate: GateRecord = state.gates[phase] ?? { status: GateStatus.Pending };
      lines.push(`| ${phase} - ${PHASE_NAMES[phase]} | ${gate.status} | ${gate.date ?? ''} | ${gate.feedback ?? ''} |`);
    }

    lines.push('', '## Artifacts');
    if (state.artifacts.length === 0) {
      lines.push('(none yet)');
    } else {
      for (const artifact of state.artifacts) {
        lines.push(`- ${artifact}`);
      }
    }

    lines.push('', '## UX');
    lines.push(`Score: ${state.uxScore ?? 'not scored'}`);
    lines.push(`Mode: ${state.uxMode ?? 'not set'}`);

    if (state.preRcSource) {
      lines.push('', '## Pre-RC Source');
      lines.push(`PRD: ${state.preRcSource.prdPath}`);
      lines.push(`State: ${state.preRcSource.statePath}`);
      lines.push(`Imported: ${state.preRcSource.importedAt}`);
      lines.push(`Artifacts: ${state.preRcSource.artifactCount}`);
      lines.push(`Personas: ${state.preRcSource.personaCount}`);
    }

    const { projectPath: _omit, ...stateForJson } = state;
    const jsonStr = JSON.stringify(stateForJson, null, 2).replace(/-->/g, '--\\u003e');
    lines.push('');
    lines.push('<!-- RC_STATE_JSON');
    lines.push(jsonStr);
    lines.push('RC_STATE_JSON_END -->');

    return lines.join('\n') + '\n';
  }
}
