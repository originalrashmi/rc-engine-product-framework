/**
 * Tracer -- Structured pipeline execution tracing.
 *
 * Creates a hierarchical trace of a pipeline execution:
 *   Pipeline Span
 *     └─ Node Span (with duration, status, metadata)
 *         └─ LLM Call Span (with tokens, cost, provider)
 *
 * Traces are built from EventBus events and can be:
 * - Queried during execution (for progress reporting)
 * - Serialized after completion (for persistence/analysis)
 * - Connected to the CheckpointStore (for replay)
 */

import type { EventBus, EngineEvent } from './event-bus.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpanBase {
  id: string;
  name: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  metadata?: Record<string, unknown>;
}

export interface LlmSpan extends SpanBase {
  kind: 'llm';
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
}

export interface NodeSpan extends SpanBase {
  kind: 'node';
  nodeId: string;
  retryCount?: number;
  error?: string;
  children: LlmSpan[];
}

export interface PipelineTrace extends SpanBase {
  kind: 'pipeline';
  pipelineId: string;
  graphId?: string;
  nodes: NodeSpan[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ── Tracer ──────────────────────────────────────────────────────────────────

export class Tracer {
  private traces: Map<string, PipelineTrace> = new Map();
  private activeNodes: Map<string, NodeSpan> = new Map();
  private unsubscribe: (() => void) | null = null;

  /**
   * Attach the tracer to an EventBus. All relevant events will be
   * automatically captured into traces.
   */
  attach(bus: EventBus): void {
    this.unsubscribe = bus.onAll((event: EngineEvent) => this.handleEvent(event));
  }

  /**
   * Detach from the EventBus.
   */
  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Get a trace by pipeline ID.
   */
  getTrace(pipelineId: string): PipelineTrace | undefined {
    return this.traces.get(pipelineId);
  }

  /**
   * Get all traces.
   */
  getAllTraces(): PipelineTrace[] {
    return [...this.traces.values()];
  }

  /**
   * Get a summary of a pipeline's progress.
   */
  getProgress(pipelineId: string): {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    runningNodes: number;
    percentComplete: number;
    totalCostUsd: number;
    elapsedMs: number;
  } | null {
    const trace = this.traces.get(pipelineId);
    if (!trace) return null;

    const completed = trace.nodes.filter((n) => n.status === 'completed').length;
    const failed = trace.nodes.filter((n) => n.status === 'failed').length;
    const running = trace.nodes.filter((n) => n.status === 'running').length;
    const total = trace.nodes.length;

    return {
      totalNodes: total,
      completedNodes: completed,
      failedNodes: failed,
      runningNodes: running,
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalCostUsd: trace.totalCostUsd,
      elapsedMs: Date.now() - trace.startedAt.getTime(),
    };
  }

  /**
   * Serialize a trace to a plain object (for JSON persistence).
   */
  serialize(pipelineId: string): PipelineTrace | null {
    const trace = this.traces.get(pipelineId);
    if (!trace) return null;

    // Deep clone to avoid mutation
    return JSON.parse(JSON.stringify(trace)) as PipelineTrace;
  }

  /**
   * Clear all traces.
   */
  clear(): void {
    this.traces.clear();
    this.activeNodes.clear();
  }

  // ── Event Handlers ──────────────────────────────────────────────────────

  private handleEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'pipeline:start':
        this.onPipelineStart(event);
        break;
      case 'pipeline:complete':
        this.onPipelineComplete(event);
        break;
      case 'node:start':
        this.onNodeStart(event);
        break;
      case 'node:complete':
        this.onNodeComplete(event);
        break;
      case 'node:error':
        this.onNodeError(event);
        break;
      case 'llm:start':
        this.onLlmStart(event);
        break;
      case 'llm:complete':
        this.onLlmComplete(event);
        break;
      case 'llm:error':
        this.onLlmError(event);
        break;
    }
  }

  private onPipelineStart(event: EngineEvent & { type: 'pipeline:start' }): void {
    const trace: PipelineTrace = {
      kind: 'pipeline',
      id: event.pipelineId,
      pipelineId: event.pipelineId,
      graphId: event.graphId,
      name: `Pipeline ${event.graphId}`,
      startedAt: event.timestamp,
      status: 'running',
      nodes: [],
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
    this.traces.set(event.pipelineId, trace);
  }

  private onPipelineComplete(event: EngineEvent & { type: 'pipeline:complete' }): void {
    const trace = this.traces.get(event.pipelineId);
    if (!trace) return;

    trace.completedAt = event.timestamp;
    trace.durationMs = event.durationMs;
    trace.status =
      event.status === 'completed' ? 'completed' : event.status === 'interrupted' ? 'interrupted' : 'failed';
  }

  private onNodeStart(event: EngineEvent & { type: 'node:start' }): void {
    const trace = this.traces.get(event.pipelineId);
    if (!trace) return;

    const span: NodeSpan = {
      kind: 'node',
      id: `${event.pipelineId}:${event.nodeId}`,
      nodeId: event.nodeId,
      name: event.nodeId,
      startedAt: event.timestamp,
      status: 'running',
      children: [],
    };

    trace.nodes.push(span);
    this.activeNodes.set(span.id, span);
  }

  private onNodeComplete(event: EngineEvent & { type: 'node:complete' }): void {
    const spanId = `${event.pipelineId}:${event.nodeId}`;
    const span = this.activeNodes.get(spanId);
    if (!span) return;

    span.completedAt = event.timestamp;
    span.durationMs = event.durationMs;
    span.status = 'completed';
    span.metadata = event.metadata;
    this.activeNodes.delete(spanId);
  }

  private onNodeError(event: EngineEvent & { type: 'node:error' }): void {
    const spanId = `${event.pipelineId}:${event.nodeId}`;
    const span = this.activeNodes.get(spanId);
    if (!span) return;

    span.retryCount = event.retryCount;
    span.error = event.error;

    if (!event.willRetry) {
      span.status = 'failed';
      span.completedAt = event.timestamp;
      span.durationMs = event.timestamp.getTime() - span.startedAt.getTime();
      this.activeNodes.delete(spanId);
    }
  }

  private onLlmStart(event: EngineEvent & { type: 'llm:start' }): void {
    // Find the active node span for this pipeline
    const nodeSpan = this.findActiveNode(event.pipelineId);
    if (!nodeSpan) return;

    const llmSpan: LlmSpan = {
      kind: 'llm',
      id: `${event.pipelineId}:${nodeSpan.nodeId}:llm-${nodeSpan.children.length}`,
      name: `${event.provider}/${event.model}`,
      provider: event.provider,
      model: event.model,
      startedAt: event.timestamp,
      status: 'running',
    };

    nodeSpan.children.push(llmSpan);
  }

  private onLlmComplete(event: EngineEvent & { type: 'llm:complete' }): void {
    // Always update pipeline totals, even without a matching span
    const trace = this.traces.get(event.pipelineId);
    if (trace) {
      trace.totalCostUsd += event.costUsd;
      trace.totalInputTokens += event.inputTokens;
      trace.totalOutputTokens += event.outputTokens;
    }

    const nodeSpan = this.findActiveNode(event.pipelineId);
    if (!nodeSpan) return;

    // Find the last running LLM span
    const llmSpan = [...nodeSpan.children].reverse().find((c) => c.status === 'running');
    if (!llmSpan) return;

    llmSpan.completedAt = event.timestamp;
    llmSpan.durationMs = event.durationMs;
    llmSpan.status = 'completed';
    llmSpan.inputTokens = event.inputTokens;
    llmSpan.outputTokens = event.outputTokens;
    llmSpan.costUsd = event.costUsd;
  }

  private onLlmError(event: EngineEvent & { type: 'llm:error' }): void {
    const nodeSpan = this.findActiveNode(event.pipelineId);
    if (!nodeSpan) return;

    const llmSpan = [...nodeSpan.children].reverse().find((c) => c.status === 'running');
    if (!llmSpan) return;

    llmSpan.completedAt = event.timestamp;
    llmSpan.durationMs = event.timestamp.getTime() - llmSpan.startedAt.getTime();
    llmSpan.status = 'failed';
    llmSpan.error = event.error;
  }

  private findActiveNode(pipelineId: string): NodeSpan | undefined {
    for (const [key, span] of this.activeNodes) {
      if (key.startsWith(pipelineId + ':')) {
        return span;
      }
    }
    return undefined;
  }
}
