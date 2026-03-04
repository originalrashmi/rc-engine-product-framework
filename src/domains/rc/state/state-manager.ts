import fs from 'node:fs';
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
  /** Create a new project state file */
  create(projectPath: string, projectName: string): ProjectState {
    const stateDir = path.join(projectPath, STATE_DIR);
    fs.mkdirSync(stateDir, { recursive: true });

    for (const dir of ['prds', 'tasks', 'gates', 'logs']) {
      fs.mkdirSync(path.join(projectPath, 'rc-method', dir), { recursive: true });
    }

    const state: ProjectState = {
      projectName,
      projectPath,
      currentPhase: 1,
      gates: {},
      artifacts: [],
      uxScore: null,
      uxMode: null,
    };

    this.save(projectPath, state);
    return state;
  }

  /** Load project state from CheckpointStore, with legacy markdown migration. */
  load(projectPath: string): ProjectState {
    const { store, pipelineId } = getProjectStore(projectPath);
    try {
      const checkpoint = store.load(pipelineId, NODE_IDS.RC_STATE, ProjectStateSchema);
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

  /** Save project state to CheckpointStore (primary) + markdown export (side-effect). */
  save(projectPath: string, state: ProjectState): void {
    const { store, pipelineId } = getProjectStore(projectPath);
    store.save(pipelineId, NODE_IDS.RC_STATE, state);
    // Best-effort markdown export (sync for compatibility with existing sync callers)
    try {
      const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmpPath, this.serialize(state), 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      console.error('[rc] Warning: failed to write markdown export:', (err as Error).message);
    }
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

  // ── Migration ──────────────────────────────────────────────────────────

  private migrateFromMarkdown(projectPath: string): ProjectState {
    const filePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    if (!fs.existsSync(filePath)) {
      throw new Error(`No RC Method project found at ${projectPath}. Use rc_start to begin a new project.`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
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
