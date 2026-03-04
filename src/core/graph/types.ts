/**
 * Graph Engine -- Core Types
 *
 * LangGraph-inspired but simpler. Designed for RC Engine's specific needs:
 * - Sequential and parallel node execution
 * - Gate interrupts for human-in-the-loop approval
 * - Per-node retry and error strategies
 * - Typed state passing between nodes
 */

import { z } from 'zod';

// ── Node Types ──────────────────────────────────────────────────────────────

/** Discriminates how a node behaves during execution. */
export type NodeType = 'action' | 'gate' | 'fan-out' | 'fan-in';

/** How to handle errors from this node. */
export type ErrorStrategy = 'fail-fast' | 'skip-and-continue' | 'fallback';

/** Retry configuration for a node. */
export interface RetryPolicy {
  /** Maximum number of retry attempts (0 = no retries). */
  maxRetries: number;
  /** Base delay in ms between retries. Actual delay = base * 2^attempt + jitter. */
  baseDelayMs: number;
  /** Error types that should NOT be retried (e.g. validation errors). */
  nonRetryable?: string[];
}

/** Result of a single node execution. */
export interface NodeResult<S> {
  /** The updated state after execution. */
  state: S;
  /** Optional metadata from the node (e.g. tokens used, duration). */
  metadata?: Record<string, unknown>;
  /**
   * Dynamic fan-out: spawn parallel executions at runtime.
   *
   * Each entry targets a node in the graph with its own state copy.
   * All targets execute in parallel. Results are collected by the
   * fan-in node (if one exists) that all target nodes converge to.
   *
   * LangGraph alignment: equivalent to the `Send()` primitive.
   */
  send?: Array<{ nodeId: string; state: S }>;
}

/** The execute function signature for action nodes. */
export type NodeExecuteFn<S> = (state: S) => Promise<NodeResult<S>>;

/** A merge function that combines fan-in results into a single state. */
export type MergeFn<S> = (states: S[], originalState: S) => S;

/**
 * A node in the execution graph.
 *
 * Generic over S (the pipeline state type). Every node receives the current
 * state and returns the updated state.
 */
export interface GraphNode<S> {
  /** Unique identifier for this node. */
  id: string;
  /** Human-readable name for display and logging. */
  name: string;
  /** How this node behaves: action, gate, fan-out, or fan-in. */
  type: NodeType;
  /** The function to execute for action nodes. Ignored for gate/fan-out/fan-in. */
  execute?: NodeExecuteFn<S>;
  /** Retry configuration. Defaults to no retries. */
  retry?: RetryPolicy;
  /** How to handle errors from this node. Defaults to 'fail-fast'. */
  errorStrategy?: ErrorStrategy;
  /** For fan-in nodes: the function to merge parallel results. */
  merge?: MergeFn<S>;
  /** For fallback error strategy: the node ID to route to on failure. */
  fallbackNodeId?: string;
  /** Arbitrary metadata attached to this node (domain, description, etc). */
  meta?: Record<string, unknown>;
}

// ── Edge Types ──────────────────────────────────────────────────────────────

/** A condition function that determines if an edge should be followed. */
export type EdgeCondition<S> = (state: S) => boolean;

/**
 * A directed edge between two nodes.
 *
 * Edges can be unconditional (always followed) or conditional (followed only
 * when the condition function returns true).
 */
export interface GraphEdge<S> {
  /** Source node ID. */
  from: string;
  /** Target node ID. */
  to: string;
  /** Optional condition -- edge is only followed when this returns true. */
  condition?: EdgeCondition<S>;
}

// ── Gate Types ──────────────────────────────────────────────────────────────

/** Valid decisions a human can make at a gate. */
export type GateDecision = 'approve' | 'reject' | 'question';

/** The result of a gate interrupt -- returned when execution pauses at a gate. */
export interface GateInterrupt<S> {
  /** The gate node that triggered the interrupt. */
  gateNodeId: string;
  /** The state at the time of the interrupt. */
  state: S;
  /** Contextual information for the human reviewer. */
  context?: string;
}

/** Input to resume execution after a gate interrupt. */
export interface GateResume {
  /** The decision made at the gate. */
  decision: GateDecision;
  /** Optional feedback (required for reject, optional for question). */
  feedback?: string;
}

// ── Graph Definition ────────────────────────────────────────────────────────

/**
 * A complete graph definition that can be executed by the GraphRunner.
 *
 * Validated at construction time:
 * - All edge endpoints reference existing nodes
 * - No orphan nodes (every node reachable from entry)
 * - Fan-in nodes have a merge function
 * - Exactly one entry node
 */
export interface GraphDefinition<S> {
  /** Unique ID for this graph (e.g. 'pre-rc-pipeline', 'rc-method'). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** All nodes in the graph. */
  nodes: GraphNode<S>[];
  /** All edges connecting nodes. */
  edges: GraphEdge<S>[];
  /** The ID of the entry node (where execution starts). */
  entryNodeId: string;
}

// ── Execution State ─────────────────────────────────────────────────────────

/** Status of a single node during execution. */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'gate-pending';

/** Record of a node's execution. */
export interface NodeExecution {
  nodeId: string;
  status: NodeStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

/** The overall execution state of a graph run. */
export interface ExecutionTrace {
  /** Unique ID for this execution run. */
  runId: string;
  /** The graph definition ID. */
  graphId: string;
  /** When execution started. */
  startedAt: Date;
  /** When execution completed (or was interrupted). */
  completedAt?: Date;
  /** Overall status. */
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  /** Per-node execution records. */
  nodeExecutions: NodeExecution[];
  /** If interrupted by a gate, the gate interrupt details. */
  gateInterrupt?: GateInterrupt<unknown>;
}

// ── Events ──────────────────────────────────────────────────────────────────

/** Discriminated union of all graph events. */
export type GraphEvent<S> =
  | { type: 'node-start'; nodeId: string; timestamp: Date; state: S }
  | {
      type: 'node-complete';
      nodeId: string;
      timestamp: Date;
      state: S;
      durationMs: number;
      metadata?: Record<string, unknown>;
    }
  | { type: 'node-error'; nodeId: string; timestamp: Date; error: string; retryCount: number; willRetry: boolean }
  | { type: 'gate-pending'; nodeId: string; timestamp: Date; state: S; context?: string }
  | { type: 'graph-start'; graphId: string; timestamp: Date; state: S }
  | {
      type: 'graph-complete';
      graphId: string;
      timestamp: Date;
      state: S;
      status: 'completed' | 'failed' | 'interrupted';
    };

/** A listener for graph events. */
export type GraphEventListener<S> = (event: GraphEvent<S>) => void;

// ── Zod Schemas (for serialization/validation) ──────────────────────────────

export const NodeTypeSchema = z.enum(['action', 'gate', 'fan-out', 'fan-in']);
export const ErrorStrategySchema = z.enum(['fail-fast', 'skip-and-continue', 'fallback']);
export const GateDecisionSchema = z.enum(['approve', 'reject', 'question']);
export const NodeStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped', 'gate-pending']);

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0),
  baseDelayMs: z.number().int().min(0),
  nonRetryable: z.array(z.string()).optional(),
});

export const GateResumeSchema = z.object({
  decision: GateDecisionSchema,
  feedback: z.string().optional(),
});
