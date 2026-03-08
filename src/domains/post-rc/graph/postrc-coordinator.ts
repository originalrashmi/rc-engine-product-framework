/**
 * Post-RC Coordinator - wires GraphCoordinator to the Post-RC domain.
 *
 * Thin wrapper that provides the correct node IDs, schema, and store factory.
 * The actual scan logic is injected via PostRcNodeHandlers when building
 * the graph.
 */

import type { PostRCState } from '../types.js';
import { GraphCoordinator } from '../../../core/graph/coordinator.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { PostRCStateSchema } from '../state/schemas.js';
import { buildPostRcGraph } from './postrc-graph.js';
import type { PostRcNodeHandlers } from './postrc-graph.js';
import type { GateResume, GraphDefinition, GraphEvent } from '../../../core/graph/types.js';
import type { RunResult } from '../../../core/graph/runner.js';

export class PostRcCoordinator {
  private coordinator: GraphCoordinator<PostRCState>;
  private graph: GraphDefinition<PostRCState>;

  constructor(handlers: PostRcNodeHandlers) {
    this.coordinator = new GraphCoordinator<PostRCState>(
      getProjectStore,
      NODE_IDS.POST_RC_STATE,
      NODE_IDS.POST_RC_INTERRUPT,
      PostRCStateSchema,
    );
    this.graph = buildPostRcGraph(handlers);
  }

  /** Run the validation pipeline. Stops at ship gate. */
  async run(projectPath: string, initialState: PostRCState): Promise<RunResult<PostRCState>> {
    return this.coordinator.run(projectPath, this.graph, initialState);
  }

  /** Resume from the ship gate with a decision. */
  async resume(projectPath: string, gateResume: GateResume): Promise<RunResult<PostRCState>> {
    return this.coordinator.resume(projectPath, this.graph, gateResume);
  }

  /** Stream the validation pipeline, yielding events in real time. */
  async *stream(
    projectPath: string,
    initialState: PostRCState,
  ): AsyncGenerator<GraphEvent<PostRCState>, RunResult<PostRCState>> {
    return yield* this.coordinator.stream(projectPath, this.graph, initialState);
  }

  /** Check if there's a pending ship gate. */
  loadPendingInterrupt(projectPath: string) {
    return this.coordinator.loadPendingInterrupt(projectPath);
  }

  /** Load the current Post-RC state. */
  loadState(projectPath: string): PostRCState {
    return this.coordinator.loadState(projectPath);
  }

  /** Access the graph runner for event subscriptions. */
  get graphRunner() {
    return this.coordinator.graphRunner;
  }
}
