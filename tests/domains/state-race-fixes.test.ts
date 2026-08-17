/**
 * Regression tests for the two critical dogfood findings (2026-08-14):
 *
 * 1. Artifact-registry race: graph node handlers returned a pre-run state
 *    copy which the coordinator checkpointed OVER the orchestrator's save,
 *    wiping state.artifacts after every phase. mergeFreshState() must return
 *    the persisted state layered with transient fields.
 *
 * 2. rc_init misroute: post-rc loadState() falls back to a default state, so
 *    probing a fresh directory "found" Post-RC state and routed every new
 *    project to postrc_status. hasState() must report false on a fresh dir,
 *    with no side effects, and true once real state is persisted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StateManager } from '../../src/domains/rc/state/state-manager.js';
import { closeProjectStore } from '../../src/shared/state/store-factory.js';
import { mergeFreshState } from '../../src/domains/rc/tools/rc-coordinator-factory.js';
import {
  hasState,
  saveState,
  createDefaultState,
} from '../../src/domains/post-rc/state/state-manager.js';
import type { ProjectState } from '../../src/domains/rc/types.js';

function makeState(projectPath: string, artifacts: string[]): ProjectState {
  return {
    projectName: 'Race Test',
    projectPath,
    currentPhase: 2,
    gates: {},
    artifacts,
    uxScore: null,
    uxMode: null,
  } as ProjectState;
}

describe('mergeFreshState (artifact-registry race fix)', () => {
  let dir: string;
  const stateManager = new StateManager();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rc-race-'));
  });
  afterEach(() => {
    // Close the sqlite handle first, else rmSync EPERMs on Windows.
    closeProjectStore(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the persisted state, not the stale in-memory copy', () => {
    // Simulate the orchestrator's save during a phase run: PRD registered.
    const persisted = makeState(dir, ['rc-method/prds/PRD-race-test-master.md']);
    stateManager.save(dir, persisted);

    // The graph handler holds a stale pre-run copy with no artifacts.
    const stale = makeState(dir, []);
    const { state } = mergeFreshState(stateManager, stale, { _lastOutput: 'phase output' });

    // The race wiped this before the fix.
    expect(state.artifacts).toContain('rc-method/prds/PRD-race-test-master.md');
    expect(state._lastOutput).toBe('phase output');
  });

  it('layers transient patch fields over the persisted state', () => {
    stateManager.save(dir, makeState(dir, ['a.md']));
    const stale = { ...makeState(dir, []), _pendingInput: 'input', _forgeTaskId: 'TASK-001' };
    const { state } = mergeFreshState(stateManager, stale, {
      _lastOutput: 'out',
      _pendingInput: undefined,
      _forgeTaskId: undefined,
    });
    expect(state.artifacts).toEqual(['a.md']);
    expect(state._pendingInput).toBeUndefined();
    expect(state._forgeTaskId).toBeUndefined();
  });

  it('falls back to the in-memory state when nothing is persisted', () => {
    const unsavedDir = join(dir, 'never-saved');
    const stale = makeState(unsavedDir, ['in-memory.md']);
    const { state } = mergeFreshState(stateManager, stale, { _lastOutput: 'x' });
    closeProjectStore(unsavedDir); // load() probe opens a store under this path
    expect(state.artifacts).toEqual(['in-memory.md']);
    expect(state._lastOutput).toBe('x');
  });
});

describe('post-rc hasState (rc_init misroute fix)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rc-init-'));
  });
  afterEach(() => {
    // Close the sqlite handle first, else rmSync EPERMs on Windows.
    closeProjectStore(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports false on a brand-new directory', () => {
    expect(hasState(dir)).toBe(false);
  });

  it('has no side effects: probing must not create the state store', () => {
    hasState(dir);
    expect(existsSync(join(dir, '.rc-engine'))).toBe(false);
  });

  it('reports true after real Post-RC state is saved', async () => {
    await saveState(dir, createDefaultState(dir, 'Race Test'));
    expect(hasState(dir)).toBe(true);
  });
});
