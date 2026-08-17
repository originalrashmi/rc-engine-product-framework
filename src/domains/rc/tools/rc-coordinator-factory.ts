/**
 * Factory for creating RC coordinators with real handlers.
 *
 * Each handler wraps the Orchestrator's phase method so the graph coordinator
 * IS the execution path. The graph drives gate lifecycle; the Orchestrator
 * (via StateManager) is the SOLE writer of the shared rc:state record - the
 * coordinator runs with domainOwnsState=true and never saves it (ADR-1,
 * 2026-08-17). Handler return values therefore only carry the transient
 * fields (_lastOutput) back to the caller in memory; they are never persisted
 * as the shared state, which is what previously allowed a stale pre-run copy
 * to wipe state.artifacts.
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
  const done = (state: ProjectState, lastOutput: string): { state: ProjectState } => ({
    state: { ...state, _lastOutput: lastOutput, _pendingInput: undefined, _forgeTaskId: undefined },
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
