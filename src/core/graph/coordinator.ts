/**
 * Graph Coordinator -- bridges GraphRunner + CheckpointStore.
 *
 * Provides persistent gate interrupts: when the graph pauses at a gate,
 * the state and interrupt metadata are saved to SQLite. On resume, the
 * coordinator loads the persisted state and feeds the gate decision back
 * to the runner.
 *
 * Generic over S (the pipeline state type). Each domain creates a
 * concrete coordinator that wraps this base.
 */

import { z } from 'zod';
import type { CheckpointStore } from '../checkpoint/store.js';
import { GraphRunner, topologicalSort } from './runner.js';
import type { RunOptions, RunResult } from './runner.js';
import type { GraphDefinition, GraphEvent, GateResume } from './types.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** Persisted interrupt metadata (stored in CheckpointStore). */
export interface PersistedInterrupt {
  gateNodeId: string;
  graphId: string;
  context?: string;
  createdAt: string;
}

/** Factory function to get a project's store + pipeline ID. */
export type StoreFactory = (projectPath: string) => {
  store: CheckpointStore;
  pipelineId: string;
};

// ── Zod schema for interrupt persistence ────────────────────────────────────

const PersistedInterruptSchema = z.object({
  gateNodeId: z.string(),
  graphId: z.string(),
  context: z.string().optional(),
  createdAt: z.string(),
});

// ── Coordinator ─────────────────────────────────────────────────────────────

export class GraphCoordinator<S> {
  private runner: GraphRunner<S>;

  constructor(
    private storeFactory: StoreFactory,
    private stateNodeId: string,
    private interruptNodeId: string,
    private stateSchema: z.ZodType<S>,
  ) {
    this.runner = new GraphRunner<S>();
  }

  /** Expose the runner for event subscriptions. */
  get graphRunner(): GraphRunner<S> {
    return this.runner;
  }

  /**
   * Start a fresh graph run.
   *
   * Saves the initial state, then executes the graph until completion
   * or a gate interrupt. On interrupt, persists both the state and
   * interrupt metadata for later resume.
   */
  async run(
    projectPath: string,
    graph: GraphDefinition<S>,
    initialState: S,
    extraOptions?: Partial<RunOptions<S>>,
  ): Promise<RunResult<S>> {
    // Clear any stale interrupt from a previous run
    this.clearInterrupt(projectPath);

    const result = await this.runner.run(graph, initialState, {
      ...extraOptions,
      onNodeComplete: (nodeId, state) => {
        this.saveNodeCheckpoint(projectPath, nodeId, state);
        extraOptions?.onNodeComplete?.(nodeId, state);
      },
    });
    this.persistResult(projectPath, graph.id, result);
    return result;
  }

  /**
   * Resume from a persisted gate interrupt.
   *
   * Loads the saved state and interrupt metadata, then continues
   * execution from the gate node with the provided decision.
   */
  async resume(projectPath: string, graph: GraphDefinition<S>, gateResume: GateResume): Promise<RunResult<S>> {
    const interrupt = this.loadPendingInterrupt(projectPath);
    if (!interrupt) {
      throw new Error('No pending gate interrupt to resume from');
    }

    const state = this.loadState(projectPath);

    const result = await this.runner.run(graph, state, {
      gateResume,
      resumeFromGateId: interrupt.gateNodeId,
      onNodeComplete: (nodeId, nodeState) => {
        this.saveNodeCheckpoint(projectPath, nodeId, nodeState);
      },
    });

    this.persistResult(projectPath, graph.id, result);
    return result;
  }

  /**
   * Stream a fresh graph run as an async generator of events.
   *
   * Same lifecycle as run() (state persistence, gate interrupts) but yields
   * each GraphEvent in real time for progress tracking.
   */
  async *stream(
    projectPath: string,
    graph: GraphDefinition<S>,
    initialState: S,
    extraOptions?: Partial<RunOptions<S>>,
  ): AsyncGenerator<GraphEvent<S>, RunResult<S>> {
    this.clearInterrupt(projectPath);

    const gen = this.runner.stream(graph, initialState, {
      ...extraOptions,
      onNodeComplete: (nodeId, state) => {
        this.saveNodeCheckpoint(projectPath, nodeId, state);
        extraOptions?.onNodeComplete?.(nodeId, state);
      },
    });

    let iterResult = await gen.next();
    while (!iterResult.done) {
      yield iterResult.value;
      iterResult = await gen.next();
    }

    const result = iterResult.value;
    this.persistResult(projectPath, graph.id, result);
    return result;
  }

  /**
   * Load any pending gate interrupt for this project.
   * Returns null if no interrupt is pending (or if the stored
   * interrupt is a cleared tombstone with empty gateNodeId).
   */
  loadPendingInterrupt(projectPath: string): PersistedInterrupt | null {
    const { store, pipelineId } = this.storeFactory(projectPath);
    try {
      const checkpoint = store.load(pipelineId, this.interruptNodeId, PersistedInterruptSchema);
      // Empty gateNodeId is our tombstone -- means interrupt was cleared
      if (!checkpoint.state.gateNodeId) return null;
      return checkpoint.state;
    } catch {
      return null;
    }
  }

  /**
   * Load the current state from CheckpointStore.
   * Throws if no state exists.
   */
  loadState(projectPath: string): S {
    const { store, pipelineId } = this.storeFactory(projectPath);
    const checkpoint = store.load(pipelineId, this.stateNodeId, this.stateSchema);
    return checkpoint.state;
  }

  /**
   * Recover from a crash by finding the last checkpointed node.
   *
   * Walks nodes in topological order, finds the last one with a per-node
   * checkpoint. Returns the node ID to resume from, or null if no
   * checkpoints exist (run from scratch).
   */
  recoverFromCrash(projectPath: string, graph: GraphDefinition<S>): { resumeFromNodeId: string; state: S } | null {
    const { store, pipelineId } = this.storeFactory(projectPath);
    const executionOrder = topologicalSort(graph.nodes, graph.edges);

    let lastCheckpointedNodeId: string | null = null;
    let lastState: S | null = null;

    for (const nodeId of executionOrder) {
      const checkpointNodeId = `${this.stateNodeId}:${nodeId}`;
      try {
        const checkpoint = store.load(pipelineId, checkpointNodeId, this.stateSchema);
        lastCheckpointedNodeId = nodeId;
        lastState = checkpoint.state;
      } catch {
        // No checkpoint for this node -- this is where we stopped
        break;
      }
    }

    if (!lastCheckpointedNodeId || !lastState) return null;

    // Resume from the node AFTER the last completed one
    const lastIndex = executionOrder.indexOf(lastCheckpointedNodeId);
    if (lastIndex >= executionOrder.length - 1) {
      // All nodes were completed -- nothing to resume
      return null;
    }

    const resumeNodeId = executionOrder[lastIndex + 1];
    return { resumeFromNodeId: resumeNodeId, state: lastState };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private saveNodeCheckpoint(projectPath: string, nodeId: string, state: S): void {
    const { store, pipelineId } = this.storeFactory(projectPath);
    store.save(pipelineId, `${this.stateNodeId}:${nodeId}`, state);
  }

  private persistResult(projectPath: string, graphId: string, result: RunResult<S>): void {
    const { store, pipelineId } = this.storeFactory(projectPath);

    // Always save the latest state
    store.save(pipelineId, this.stateNodeId, result.state);

    if (result.gateInterrupt) {
      // Save interrupt metadata for resume
      const interrupt: PersistedInterrupt = {
        gateNodeId: result.gateInterrupt.gateNodeId,
        graphId,
        context: result.gateInterrupt.context,
        createdAt: new Date().toISOString(),
      };
      store.save(pipelineId, this.interruptNodeId, interrupt);
    } else {
      // Execution complete -- clear any interrupt
      this.clearInterrupt(projectPath);
    }
  }

  private clearInterrupt(projectPath: string): void {
    const { store, pipelineId } = this.storeFactory(projectPath);
    // Overwrite with tombstone (empty gateNodeId) to indicate no pending interrupt
    store.save(pipelineId, this.interruptNodeId, {
      gateNodeId: '',
      graphId: '',
      createdAt: '',
    });
  }
}
