/**
 * Graph Runner -- Executes a GraphDefinition.
 *
 * Supports:
 * - Sequential execution in topological order
 * - Parallel execution for fan-out nodes (P0-012)
 * - Gate interrupts that pause for human approval (P0-013)
 * - Per-node retry with exponential backoff (P0-014)
 * - Event emission for observability (P0-015)
 */

import type {
  GraphDefinition,
  GraphNode,
  GraphEdge,
  NodeResult,
  NodeExecution,
  ExecutionTrace,
  GateInterrupt,
  GateResume,
  GraphEvent,
  GraphEventListener,
} from './types.js';

/** Options for running a graph. */
export interface RunOptions<S> {
  /** Resume from a gate interrupt. If provided, execution continues from the gate node. */
  gateResume?: GateResume;
  /** The gate node ID to resume from (required if gateResume is provided). */
  resumeFromGateId?: string;
  /** Called after each successful node execution for incremental checkpointing. */
  onNodeComplete?: (nodeId: string, state: S) => void;
  /** Resume from a specific node (crash recovery). Skips all nodes before this. */
  resumeFromNodeId?: string;
}

/** Result of a graph execution. */
export interface RunResult<S> {
  /** The final state after execution. */
  state: S;
  /** The execution trace with per-node timings. */
  trace: ExecutionTrace;
  /** If execution was interrupted by a gate, the interrupt details. */
  gateInterrupt?: GateInterrupt<S>;
}

export class GraphRunner<S> {
  private listeners: GraphEventListener<S>[] = [];

  /** Subscribe to graph execution events. */
  on(listener: GraphEventListener<S>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GraphEvent<S>): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not crash the runner
      }
    }
  }

  /**
   * Stream graph execution as an async generator of events.
   *
   * Yields every GraphEvent as the graph runs, then returns the final RunResult.
   * Consumers can process events in real time (progress bars, logs, etc.).
   *
   * Usage:
   *   const gen = runner.stream(graph, initialState);
   *   for await (const event of gen) { console.log(event); }
   *   // gen.return value contains the RunResult (access via manual iteration)
   */
  async *stream(
    graph: GraphDefinition<S>,
    initialState: S,
    options?: RunOptions<S>,
  ): AsyncGenerator<GraphEvent<S>, RunResult<S>> {
    const queue: GraphEvent<S>[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let result: RunResult<S> | undefined;
    let runError: Error | undefined;

    const notify = () => {
      if (resolve) {
        const fn = resolve;
        resolve = null;
        fn();
      }
    };

    // Subscribe to events and push them to the queue
    const unsub = this.on((event) => {
      queue.push(event);
      notify();
    });

    // Run the graph concurrently -- events flow into the queue
    const runPromise = (async () => {
      try {
        result = await this.run(graph, initialState, options);
      } catch (e) {
        runError = e instanceof Error ? e : new Error(String(e));
      } finally {
        done = true;
        notify();
        unsub();
      }
    })();

    // Yield events as they arrive
    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!done) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }

    await runPromise;
    if (runError) throw runError;
    return result!;
  }

  /**
   * Execute a graph from its entry node.
   *
   * Traverses nodes in topological order, passing state between them.
   * Pauses at gate nodes and returns a GateInterrupt for human approval.
   * Supports resuming from a gate via RunOptions.gateResume.
   */
  async run(graph: GraphDefinition<S>, initialState: S, options?: RunOptions<S>): Promise<RunResult<S>> {
    const runId = generateRunId();
    const startedAt = new Date();
    const nodeExecutions: NodeExecution[] = [];

    this.emit({ type: 'graph-start', graphId: graph.id, timestamp: startedAt, state: initialState });

    // Build adjacency list and in-degree map for topological traversal
    const adjacency = buildAdjacency(graph);
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // Determine execution order via topological sort
    const executionOrder = topologicalSort(graph.nodes, graph.edges);

    // If resuming from a gate, skip nodes before the gate
    let state = initialState;
    let startIndex = 0;

    // Handle crash recovery: skip nodes before the resume point
    if (options?.resumeFromNodeId && !options.gateResume) {
      const resumeIndex = executionOrder.indexOf(options.resumeFromNodeId);
      if (resumeIndex === -1) {
        throw new Error(`Resume node "${options.resumeFromNodeId}" not found in execution order`);
      }
      // Mark all nodes before resume point as skipped
      for (let s = 0; s < resumeIndex; s++) {
        nodeExecutions.push({
          nodeId: executionOrder[s],
          status: 'skipped',
          metadata: { reason: 'crash-recovery-skip' },
        });
      }
      startIndex = resumeIndex;
    }

    if (options?.gateResume && options.resumeFromGateId) {
      const gateIndex = executionOrder.indexOf(options.resumeFromGateId);
      if (gateIndex === -1) {
        throw new Error(`Gate node "${options.resumeFromGateId}" not found in execution order`);
      }

      const gateNode = nodeMap.get(options.resumeFromGateId);
      if (!gateNode || gateNode.type !== 'gate') {
        throw new Error(`Node "${options.resumeFromGateId}" is not a gate node`);
      }

      // Record the gate decision
      nodeExecutions.push({
        nodeId: options.resumeFromGateId,
        status: options.gateResume.decision === 'approve' ? 'completed' : 'failed',
        metadata: {
          decision: options.gateResume.decision,
          feedback: options.gateResume.feedback,
        },
      });

      if (options.gateResume.decision === 'reject') {
        // On rejection, stop execution -- caller should re-run preceding nodes
        const trace: ExecutionTrace = {
          runId,
          graphId: graph.id,
          startedAt,
          completedAt: new Date(),
          status: 'failed',
          nodeExecutions,
        };
        this.emit({ type: 'graph-complete', graphId: graph.id, timestamp: new Date(), state, status: 'failed' });
        return { state, trace };
      }

      if (options.gateResume.decision === 'question') {
        // On question, pause again at the same gate
        const trace: ExecutionTrace = {
          runId,
          graphId: graph.id,
          startedAt,
          completedAt: new Date(),
          status: 'interrupted',
          nodeExecutions,
          gateInterrupt: { gateNodeId: options.resumeFromGateId, state, context: options.gateResume.feedback },
        };
        return { state, trace, gateInterrupt: { gateNodeId: options.resumeFromGateId, state } };
      }

      // On approve, continue from the next node after the gate
      startIndex = gateIndex + 1;
    }

    // Execute nodes in order
    for (let i = startIndex; i < executionOrder.length; i++) {
      const nodeId = executionOrder[i];
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Check if all incoming edges have conditions met
      const incomingEdges = graph.edges.filter((e) => e.to === nodeId);
      if (incomingEdges.length > 0 && incomingEdges.every((e) => e.condition !== undefined)) {
        // All edges are conditional -- check if at least one condition is met
        const anyConditionMet = incomingEdges.some((e) => e.condition!(state));
        if (!anyConditionMet) {
          nodeExecutions.push({ nodeId, status: 'skipped' });
          continue;
        }
      }

      // Handle gate nodes
      if (node.type === 'gate') {
        this.emit({ type: 'gate-pending', nodeId, timestamp: new Date(), state });
        nodeExecutions.push({ nodeId, status: 'gate-pending' });
        const trace: ExecutionTrace = {
          runId,
          graphId: graph.id,
          startedAt,
          status: 'interrupted',
          nodeExecutions,
          gateInterrupt: { gateNodeId: nodeId, state },
        };
        this.emit({ type: 'graph-complete', graphId: graph.id, timestamp: new Date(), state, status: 'interrupted' });
        return { state, trace, gateInterrupt: { gateNodeId: nodeId, state } };
      }

      // Handle fan-out nodes -- execute all successor nodes in parallel
      if (node.type === 'fan-out') {
        const successorIds = adjacency.get(nodeId) ?? [];
        const successorNodes = successorIds.map((id) => nodeMap.get(id)).filter((n): n is GraphNode<S> => n != null);

        if (successorNodes.length === 0) {
          nodeExecutions.push({ nodeId, status: 'completed', metadata: { fanOutCount: 0 } });
          continue;
        }

        this.emit({ type: 'node-start', nodeId, timestamp: new Date(), state });
        const fanOutStart = Date.now();

        const results = await Promise.allSettled(
          successorNodes.map(async (successor) => {
            return this.executeNode(successor, state, nodeExecutions);
          }),
        );

        // Collect successful states for fan-in
        const successfulStates: S[] = [];
        for (let r = 0; r < results.length; r++) {
          const result = results[r];
          if (result.status === 'fulfilled') {
            successfulStates.push(result.value.state);
          }
        }

        // Store fan-out results on state for the fan-in node to merge
        nodeExecutions.push({
          nodeId,
          status: 'completed',
          startedAt: new Date(fanOutStart),
          completedAt: new Date(),
          durationMs: Date.now() - fanOutStart,
          metadata: {
            fanOutCount: successorNodes.length,
            succeededCount: successfulStates.length,
          },
        });
        this.emit({
          type: 'node-complete',
          nodeId,
          timestamp: new Date(),
          state,
          durationMs: Date.now() - fanOutStart,
        });

        // Skip fan-out successors in the main loop (they were already executed)
        const skipSet = new Set(successorIds);

        // Find the fan-in node that collects these parallel results
        const fanInNodeId = findFanInNode(graph, successorIds);
        if (fanInNodeId) {
          const fanInNode = nodeMap.get(fanInNodeId);
          if (fanInNode?.merge) {
            state = fanInNode.merge(successfulStates, state);
            nodeExecutions.push({ nodeId: fanInNodeId, status: 'completed' });
            skipSet.add(fanInNodeId);
          }
        }

        // Per-step checkpointing after fan-out/fan-in
        options?.onNodeComplete?.(nodeId, state);

        // Advance i past all nodes we already handled
        while (i + 1 < executionOrder.length && skipSet.has(executionOrder[i + 1])) {
          i++;
        }

        continue;
      }

      // Handle fan-in nodes (reached outside of fan-out context -- just pass through)
      if (node.type === 'fan-in') {
        nodeExecutions.push({ nodeId, status: 'completed' });
        continue;
      }

      // Handle action nodes
      if (!node.execute) {
        nodeExecutions.push({ nodeId, status: 'skipped', metadata: { reason: 'no execute function' } });
        continue;
      }

      const result = await this.executeNode(node, state, nodeExecutions);
      state = result.state;

      // Dynamic send: spawn parallel executions from the result
      if (result.send && result.send.length > 0) {
        const sendStart = Date.now();
        // Deduplicate node IDs for fan-in lookup (multiple sends can target the same node)
        const uniqueSendNodeIds = [...new Set(result.send.map((s) => s.nodeId))];

        const sendResults = await Promise.allSettled(
          result.send.map(async (sendEntry) => {
            const targetNode = nodeMap.get(sendEntry.nodeId);
            if (!targetNode || !targetNode.execute) {
              throw new Error(`Send target "${sendEntry.nodeId}" not found or has no execute function`);
            }
            return this.executeNode(targetNode, sendEntry.state, nodeExecutions);
          }),
        );

        // Collect successful states
        const successfulStates: S[] = [];
        for (const sendResult of sendResults) {
          if (sendResult.status === 'fulfilled') {
            successfulStates.push(sendResult.value.state);
          }
        }

        // Find fan-in node for the send targets (using unique IDs for edge matching)
        const sendSkipSet = new Set(uniqueSendNodeIds);
        const fanInNodeId = findFanInNode(graph, uniqueSendNodeIds);
        if (fanInNodeId) {
          const fanInNode = nodeMap.get(fanInNodeId);
          if (fanInNode?.merge) {
            state = fanInNode.merge(successfulStates, state);
            nodeExecutions.push({
              nodeId: fanInNodeId,
              status: 'completed',
              durationMs: Date.now() - sendStart,
              metadata: { sendCount: result.send.length, succeededCount: successfulStates.length },
            });
            sendSkipSet.add(fanInNodeId);
          }
        } else if (successfulStates.length > 0) {
          // No fan-in -- use the last successful state
          state = successfulStates[successfulStates.length - 1];
        }

        // Skip send targets and fan-in in the main loop
        while (i + 1 < executionOrder.length && sendSkipSet.has(executionOrder[i + 1])) {
          i++;
        }
      }

      // Per-step checkpointing callback
      options?.onNodeComplete?.(node.id, state);
    }

    // Execution complete
    const completedAt = new Date();
    const trace: ExecutionTrace = {
      runId,
      graphId: graph.id,
      startedAt,
      completedAt,
      status: 'completed',
      nodeExecutions,
    };
    this.emit({ type: 'graph-complete', graphId: graph.id, timestamp: completedAt, state, status: 'completed' });
    return { state, trace };
  }

  /**
   * Execute a single action node with retry logic.
   */
  private async executeNode(node: GraphNode<S>, state: S, nodeExecutions: NodeExecution[]): Promise<NodeResult<S>> {
    const maxRetries = node.retry?.maxRetries ?? 0;
    const baseDelay = node.retry?.baseDelayMs ?? 1000;
    const nonRetryable = new Set(node.retry?.nonRetryable ?? []);
    const errorStrategy = node.errorStrategy ?? 'fail-fast';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startedAt = new Date();
      this.emit({ type: 'node-start', nodeId: node.id, timestamp: startedAt, state });

      try {
        const result = await node.execute!(state);
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();

        nodeExecutions.push({
          nodeId: node.id,
          status: 'completed',
          startedAt,
          completedAt,
          durationMs,
          retryCount: attempt,
          metadata: result.metadata,
        });

        this.emit({
          type: 'node-complete',
          nodeId: node.id,
          timestamp: completedAt,
          state: result.state,
          durationMs,
          metadata: result.metadata,
        });

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const willRetry = attempt < maxRetries && !nonRetryable.has(lastError.name);

        this.emit({
          type: 'node-error',
          nodeId: node.id,
          timestamp: new Date(),
          error: lastError.message,
          retryCount: attempt,
          willRetry,
        });

        if (!willRetry) break;

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * baseDelay;
        await sleep(delay);
      }
    }

    // All retries exhausted
    const errorMsg = lastError?.message ?? 'Unknown error';

    if (errorStrategy === 'skip-and-continue') {
      nodeExecutions.push({
        nodeId: node.id,
        status: 'failed',
        error: errorMsg,
        retryCount: maxRetries,
      });
      return { state }; // Return unchanged state
    }

    if (errorStrategy === 'fallback' && node.fallbackNodeId) {
      // Fallback is handled by the caller (runner) -- for now, mark as failed
      nodeExecutions.push({
        nodeId: node.id,
        status: 'failed',
        error: errorMsg,
        retryCount: maxRetries,
        metadata: { fallbackTo: node.fallbackNodeId },
      });
      return { state };
    }

    // fail-fast: throw to stop execution
    nodeExecutions.push({
      nodeId: node.id,
      status: 'failed',
      error: errorMsg,
      retryCount: maxRetries,
    });
    throw new Error(`Node "${node.id}" failed after ${maxRetries + 1} attempts: ${errorMsg}`);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build an adjacency list from edges.
 */
function buildAdjacency<S>(graph: GraphDefinition<S>): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adj.get(edge.from)?.push(edge.to);
  }
  return adj;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns nodes in execution order (respecting dependencies).
 */
export function topologicalSort<S>(nodes: GraphNode<S>[], edges: GraphEdge<S>[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Start with nodes that have no incoming edges
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);

    for (const neighbor of adj.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    const missing = nodes.filter((n) => !sorted.includes(n.id)).map((n) => n.id);
    throw new Error(`Graph contains a cycle involving nodes: ${missing.join(', ')}`);
  }

  return sorted;
}

/**
 * Find the fan-in node that collects parallel results from the given node IDs.
 * A fan-in node is one where all the given nodes have edges pointing to it.
 */
function findFanInNode<S>(graph: GraphDefinition<S>, parallelNodeIds: string[]): string | null {
  if (parallelNodeIds.length === 0) return null;

  // Find nodes that ALL parallel nodes point to
  const targetCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (parallelNodeIds.includes(edge.from)) {
      targetCounts.set(edge.to, (targetCounts.get(edge.to) ?? 0) + 1);
    }
  }

  // The fan-in node is the one that all parallel nodes converge to
  for (const [target, count] of targetCounts) {
    if (count === parallelNodeIds.length) {
      const node = graph.nodes.find((n) => n.id === target);
      if (node?.type === 'fan-in') return target;
    }
  }

  return null;
}
