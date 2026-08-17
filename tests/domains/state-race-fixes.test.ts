/**
 * Regression tests for the state-layer findings (dogfood 2026-08-14, council
 * ruling 2026-08-17):
 *
 * 1. ADR-1 single-writer: the RC graph coordinator must never write the
 *    shared rc:state record. The double-write race (coordinator checkpointing
 *    a stale pre-run copy over the orchestrator's save) wiped state.artifacts
 *    after every phase and hard-blocked Phase 4.
 *
 * 2. ADR-2 CAS tripwire: a save carrying the version it loaded must fail
 *    loudly (StaleStateError) when another writer saved in between, instead
 *    of silently appending a stale copy.
 *
 * 3. rc_init misroute: post-rc hasState() reports false on a fresh directory
 *    with no side effects, and true once real state is persisted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StateManager } from '../../src/domains/rc/state/state-manager.js';
import { RcCoordinator } from '../../src/domains/rc/graph/rc-coordinator.js';
import type { RcNodeHandlers } from '../../src/domains/rc/graph/rc-graph.js';
import { StaleStateError } from '../../src/core/checkpoint/store.js';
import { getProjectStore, closeProjectStore } from '../../src/shared/state/store-factory.js';
import { NODE_IDS } from '../../src/shared/state/pipeline-id.js';
import { ProjectStateSchema } from '../../src/domains/rc/state/schemas.js';
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
    currentPhase: 1,
    gates: {},
    artifacts,
    uxScore: null,
    uxMode: null,
  } as ProjectState;
}

describe('ADR-1: coordinator never writes rc:state (single-writer)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rc-sw-'));
  });
  afterEach(() => {
    closeProjectStore(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a full coordinator run persists no rc:state record', async () => {
    // Stub handlers: the illuminate node "runs" and returns a mutated state.
    // Under the old architecture the coordinator would persist that state
    // (and, in production, overwrite the orchestrator's registrations).
    const noop = async (state: ProjectState) => ({ state });
    const handlers: RcNodeHandlers = {
      illuminate: async (state) => ({ state: { ...state, _lastOutput: 'ran' } }),
      define: noop,
      architect: noop,
      sequence: noop,
      validate: noop,
      forge: noop,
      connect: noop,
      compound: noop,
    };

    const coordinator = new RcCoordinator(handlers);
    const initial = { ...makeState(dir, []), _pendingInput: 'run' };
    const result = await coordinator.run(dir, initial);

    // The run itself worked and transient output is available in memory.
    expect(result.state._lastOutput).toBe('ran');

    // But the shared rc:state record was never written by the coordinator.
    const { store, pipelineId } = getProjectStore(dir);
    expect(() => store.load(pipelineId, NODE_IDS.RC_STATE, ProjectStateSchema)).toThrow(/No checkpoint found/);
  });

  it('state saved by the owner survives a coordinator run untouched', async () => {
    const stateManager = new StateManager();
    const persisted = makeState(dir, ['rc-method/prds/PRD-race-test-master.md']);
    stateManager.save(dir, persisted);

    const noop = async (state: ProjectState) => ({ state });
    const handlers: RcNodeHandlers = {
      // Handler holds a stale copy with no artifacts - the race scenario.
      illuminate: async (state) => ({ state: { ...state, artifacts: [], _lastOutput: 'x' } }),
      define: noop,
      architect: noop,
      sequence: noop,
      validate: noop,
      forge: noop,
      connect: noop,
      compound: noop,
    };
    const coordinator = new RcCoordinator(handlers);
    await coordinator.run(dir, { ...makeState(dir, []), _pendingInput: 'run' });

    // The owner's registration is intact; the stale handler copy went nowhere.
    const reloaded = new StateManager().load(dir);
    expect(reloaded.artifacts).toContain('rc-method/prds/PRD-race-test-master.md');
  });
});

describe('ADR-2: CAS tripwire (StaleStateError on concurrent writes)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rc-cas-'));
  });
  afterEach(() => {
    closeProjectStore(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('store rejects a save whose expectedVersion is stale', () => {
    const { store, pipelineId } = getProjectStore(dir);
    const { version: v1 } = store.save(pipelineId, NODE_IDS.RC_STATE, makeState(dir, []));
    // Save with the right expectation succeeds
    const { version: v2 } = store.save(pipelineId, NODE_IDS.RC_STATE, makeState(dir, ['a.md']), undefined, v1);
    expect(v2).toBe(v1 + 1);
    // Re-using the old expectation fails loudly
    expect(() => store.save(pipelineId, NODE_IDS.RC_STATE, makeState(dir, []), undefined, v1)).toThrow(
      StaleStateError,
    );
  });

  it('a deliberate second writer makes StateManager.save fail loudly', () => {
    const owner = new StateManager();
    owner.save(dir, makeState(dir, []));
    owner.load(dir); // owner now expects the version it just read

    // A second writer sneaks a save in behind the owner's back.
    const { store, pipelineId } = getProjectStore(dir);
    store.save(pipelineId, NODE_IDS.RC_STATE, makeState(dir, ['intruder.md']));

    // The owner's next save must not silently clobber it.
    expect(() => owner.save(dir, makeState(dir, ['owner.md']))).toThrow(StaleStateError);
  });

  it('normal load-mutate-save cycles pass the tripwire', () => {
    const sm = new StateManager();
    sm.save(dir, makeState(dir, []));
    for (let i = 0; i < 3; i++) {
      const state = sm.load(dir);
      state.artifacts.push(`file-${i}.md`);
      sm.save(dir, state);
    }
    expect(sm.load(dir).artifacts).toHaveLength(3);
  });
});

describe('ADR-8: pipeline identity is path-casing-invariant on win32', () => {
  it.runIf(process.platform === 'win32')('same project in different casing gets one pipeline id', async () => {
    const { derivePipelineId } = await import('../../src/shared/state/pipeline-id.js');
    expect(derivePipelineId('C:\\Tmp\\Proj-X')).toBe(derivePipelineId('c:\\tmp\\proj-x'));
    expect(derivePipelineId('C:\\Tmp\\Proj-X')).not.toBe(derivePipelineId('C:\\Tmp\\Proj-Y'));
  });

  it('trailing separators and dot segments do not change identity', async () => {
    const { derivePipelineId } = await import('../../src/shared/state/pipeline-id.js');
    const base = join(tmpdir(), 'pid-proj');
    expect(derivePipelineId(join(base, '.', 'sub', '..'))).toBe(derivePipelineId(base));
  });
});

describe('post-rc hasState (rc_init misroute fix)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rc-init-'));
  });
  afterEach(() => {
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
