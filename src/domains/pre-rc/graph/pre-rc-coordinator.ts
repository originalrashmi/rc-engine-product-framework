/**
 * Pre-RC Coordinator -- wires GraphCoordinator to the Pre-RC domain.
 *
 * Thin wrapper that provides the correct node IDs, schema, and store factory.
 * The actual domain logic (LLM calls, persona agents) is injected via
 * PreRcNodeHandlers when building the graph.
 */

import type { ResearchState } from '../types.js';
import { GraphCoordinator } from '../../../core/graph/coordinator.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { ResearchStateSchema } from '../state/schemas.js';
import { buildPreRcGraph } from './pre-rc-graph.js';
import type { PreRcNodeHandlers } from './pre-rc-graph.js';
import type { GateResume, GraphDefinition, GraphEvent } from '../../../core/graph/types.js';
import type { RunResult } from '../../../core/graph/runner.js';
import type { ZodType } from 'zod';

export class PreRcCoordinator {
  private coordinator: GraphCoordinator<ResearchState>;
  private graph: GraphDefinition<ResearchState> | null = null;

  constructor(private handlers: PreRcNodeHandlers) {
    this.coordinator = new GraphCoordinator<ResearchState>(
      getProjectStore,
      NODE_IDS.PRE_RC_STATE,
      NODE_IDS.PRE_RC_INTERRUPT,
      // z.record() infers Partial<Record> but runtime data is always complete
      ResearchStateSchema as ZodType<ResearchState>,
    );
  }

  /** Build (or return cached) graph definition. */
  private getGraph(): GraphDefinition<ResearchState> {
    if (!this.graph) {
      this.graph = buildPreRcGraph(this.handlers);
    }
    return this.graph;
  }

  /** Start a fresh Pre-RC research run. Stops at first gate. */
  async run(projectPath: string, initialState: ResearchState): Promise<RunResult<ResearchState>> {
    return this.coordinator.run(projectPath, this.getGraph(), initialState);
  }

  /** Resume from a persisted gate interrupt. */
  async resume(projectPath: string, gateResume: GateResume): Promise<RunResult<ResearchState>> {
    return this.coordinator.resume(projectPath, this.getGraph(), gateResume);
  }

  /** Stream the research pipeline, yielding events in real time. */
  async *stream(
    projectPath: string,
    initialState: ResearchState,
  ): AsyncGenerator<GraphEvent<ResearchState>, RunResult<ResearchState>> {
    return yield* this.coordinator.stream(projectPath, this.getGraph(), initialState);
  }

  /** Check if there's a pending gate interrupt. */
  loadPendingInterrupt(projectPath: string) {
    return this.coordinator.loadPendingInterrupt(projectPath);
  }

  /** Load the current research state. */
  loadState(projectPath: string): ResearchState {
    return this.coordinator.loadState(projectPath);
  }

  /** Access the graph runner for event subscriptions. */
  get graphRunner() {
    return this.coordinator.graphRunner;
  }
}
