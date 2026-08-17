/**
 * Factory for creating RC coordinators with real handlers.
 *
 * Each handler wraps the Orchestrator's phase method so the graph coordinator
 * IS the execution path. The graph drives gate lifecycle and state persistence.
 *
 * Note: The RC Orchestrator manages its own state internally (loads/saves via
 * StateManager which uses the same CheckpointStore key as the coordinator).
 * Handlers delegate to orchestrator methods, and the coordinator provides
 * additional per-node checkpointing and gate interrupt management.
 *
 * When a handler has no _pendingInput, it returns state unchanged. This allows
 * gate resume to advance the graph cursor past the gate without executing the
 * next phase (which hasn't received its input yet). The next phase tool will
 * set _pendingInput and call the coordinator.
 */

import { RcCoordinator } from '../graph/rc-coordinator.js';
import type { RcNodeHandlers } from '../graph/rc-graph.js';
import type { Orchestrator } from '../orchestrator.js';
import type { ProjectState } from '../types.js';
import { StateManager } from '../state/state-manager.js';
import { bridgeGraphToEventBus } from '../../../shared/graph-bridge.js';

/**
 * Merge the freshly persisted project state with transient graph fields.
 *
 * The orchestrator loads, mutates, and SAVES its own state copy inside each
 * phase method (registering artifacts, ux scores, forge records, etc.). The
 * graph runner then checkpoints whatever the node handler returns. Returning
 * the handler's pre-run `state` here would overwrite the orchestrator's save
 * with a stale copy - that exact race silently wiped `state.artifacts` after
 * every phase (PRD registered at save N, gone at save N+1 in the same second).
 *
 * So: after the orchestrator runs, reload the persisted state and layer the
 * transient fields on top. The graph checkpoint then agrees with the store.
 * Exported for unit testing.
 */
export function mergeFreshState(
  stateManager: StateManager,
  staleState: ProjectState,
  patch: Partial<ProjectState>,
): { state: ProjectState } {
  let base = staleState;
  try {
    base = stateManager.load(staleState.projectPath);
  } catch {
    // Store unreadable (should not happen mid-run) - fall back to in-memory state
  }
  return { state: { ...base, ...patch } };
}

/**
 * Create an RcCoordinator with real handlers that delegate to the Orchestrator.
 */
export function createRcCoordinator(orchestrator: Orchestrator): RcCoordinator {
  const stateManager = new StateManager();
  const done = (state: ProjectState, lastOutput: string): { state: ProjectState } =>
    mergeFreshState(stateManager, state, {
      _lastOutput: lastOutput,
      _pendingInput: undefined,
      _forgeTaskId: undefined,
    });

  const handlers: RcNodeHandlers = {
    illuminate: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.illuminate(state.projectPath, state._pendingInput);
      return done(state, result.text);
    },

    define: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.define(state.projectPath, state._pendingInput);
      return done(state, result.text);
    },

    architect: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.architect(state.projectPath, state._pendingInput);
      return done(state, result.text);
    },

    sequence: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.sequence(state.projectPath);
      return done(state, result.text);
    },

    validate: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.validate(state.projectPath);
      return done(state, result.text);
    },

    forge: async (state: ProjectState) => {
      if (!state._forgeTaskId) return { state };
      const result = await orchestrator.forgeTask(state.projectPath, state._forgeTaskId);
      return done(state, result.text);
    },

    connect: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.connect(state.projectPath);
      return done(state, result.text);
    },

    compound: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.compound(state.projectPath, state._pendingInput);
      return done(state, result.text);
    },
  };

  const coordinator = new RcCoordinator(handlers);
  bridgeGraphToEventBus(coordinator.graphRunner, 'rc');
  return coordinator;
}
