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
import { bridgeGraphToEventBus } from '../../../shared/graph-bridge.js';

/**
 * Create an RcCoordinator with real handlers that delegate to the Orchestrator.
 */
export function createRcCoordinator(orchestrator: Orchestrator): RcCoordinator {
  const handlers: RcNodeHandlers = {
    illuminate: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.illuminate(state.projectPath, state._pendingInput);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    define: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.define(state.projectPath, state._pendingInput);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    architect: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.architect(state.projectPath, state._pendingInput);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    sequence: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.sequence(state.projectPath);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    validate: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.validate(state.projectPath);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    forge: async (state: ProjectState) => {
      if (!state._forgeTaskId) return { state };
      const result = await orchestrator.forgeTask(state.projectPath, state._forgeTaskId);
      return { state: { ...state, _lastOutput: result.text, _forgeTaskId: undefined } };
    },

    connect: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.connect(state.projectPath);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },

    compound: async (state: ProjectState) => {
      if (!state._pendingInput) return { state };
      const result = await orchestrator.compound(state.projectPath, state._pendingInput);
      return { state: { ...state, _lastOutput: result.text, _pendingInput: undefined } };
    },
  };

  const coordinator = new RcCoordinator(handlers);
  bridgeGraphToEventBus(coordinator.graphRunner, 'rc');
  return coordinator;
}
