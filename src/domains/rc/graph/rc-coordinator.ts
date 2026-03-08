/**
 * RC Method Coordinator - wires GraphCoordinator to the RC domain.
 *
 * Thin wrapper that provides the correct node IDs, schema, and store factory.
 * The actual domain logic (LLM calls, agents) is injected via RcNodeHandlers
 * when building the graph.
 */

import type { ProjectState } from '../types.js';
import { GraphCoordinator } from '../../../core/graph/coordinator.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { ProjectStateSchema } from '../state/schemas.js';
import { buildRcGraph } from './rc-graph.js';
import type { RcNodeHandlers } from './rc-graph.js';
import type { GateResume, GraphDefinition, GraphEvent } from '../../../core/graph/types.js';
import type { RunResult, RunOptions } from '../../../core/graph/runner.js';

export class RcCoordinator {
  private coordinator: GraphCoordinator<ProjectState>;
  private graph: GraphDefinition<ProjectState>;

  constructor(handlers: RcNodeHandlers) {
    this.coordinator = new GraphCoordinator<ProjectState>(
      getProjectStore,
      NODE_IDS.RC_STATE,
      NODE_IDS.RC_INTERRUPT,
      ProjectStateSchema,
    );
    // RC graph is static - build once
    this.graph = buildRcGraph(handlers);
  }

  /** Start a fresh RC Method pipeline run. Stops at first gate. */
  async run(
    projectPath: string,
    initialState: ProjectState,
    extraOptions?: Partial<RunOptions<ProjectState>>,
  ): Promise<RunResult<ProjectState>> {
    return this.coordinator.run(projectPath, this.graph, initialState, extraOptions);
  }

  /** Resume from a persisted gate interrupt. */
  async resume(projectPath: string, gateResume: GateResume): Promise<RunResult<ProjectState>> {
    return this.coordinator.resume(projectPath, this.graph, gateResume);
  }

  /** Stream the RC pipeline, yielding events in real time. */
  async *stream(
    projectPath: string,
    initialState: ProjectState,
    extraOptions?: Partial<RunOptions<ProjectState>>,
  ): AsyncGenerator<GraphEvent<ProjectState>, RunResult<ProjectState>> {
    return yield* this.coordinator.stream(projectPath, this.graph, initialState, extraOptions);
  }

  /** Check if there's a pending gate interrupt. */
  loadPendingInterrupt(projectPath: string) {
    return this.coordinator.loadPendingInterrupt(projectPath);
  }

  /** Load the current project state. */
  loadState(projectPath: string): ProjectState {
    return this.coordinator.loadState(projectPath);
  }

  /** Access the graph runner for event subscriptions. */
  get graphRunner() {
    return this.coordinator.graphRunner;
  }
}
