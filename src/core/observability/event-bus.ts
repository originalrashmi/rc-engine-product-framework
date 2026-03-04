/**
 * EventBus -- Cross-module event streaming for observability.
 *
 * Provides a typed, decoupled event system that all core modules can
 * publish to and subscribe from. Replaces the ad-hoc console.error
 * and per-module listener patterns with a single bus.
 *
 * Features:
 * - Typed events with discriminated union
 * - Wildcard subscriptions (listen to all events)
 * - Channel subscriptions (listen to a specific event type)
 * - Async-safe (listener errors never crash the publisher)
 * - Event history buffer for late subscribers
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface BaseEvent {
  /** Discriminant for event type. */
  type: string;
  /** When the event occurred. */
  timestamp: Date;
  /** Optional pipeline context. */
  pipelineId?: string;
}

/** Pipeline lifecycle events. */
export interface PipelineStartEvent extends BaseEvent {
  type: 'pipeline:start';
  pipelineId: string;
  graphId: string;
}

export interface PipelineCompleteEvent extends BaseEvent {
  type: 'pipeline:complete';
  pipelineId: string;
  graphId: string;
  status: 'completed' | 'failed' | 'interrupted';
  durationMs: number;
}

/** Node execution events. */
export interface NodeStartEvent extends BaseEvent {
  type: 'node:start';
  pipelineId: string;
  nodeId: string;
}

export interface NodeCompleteEvent extends BaseEvent {
  type: 'node:complete';
  pipelineId: string;
  nodeId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface NodeErrorEvent extends BaseEvent {
  type: 'node:error';
  pipelineId: string;
  nodeId: string;
  error: string;
  retryCount: number;
  willRetry: boolean;
}

/** Gate events. */
export interface GatePendingEvent extends BaseEvent {
  type: 'gate:pending';
  pipelineId: string;
  nodeId: string;
}

export interface GateResolvedEvent extends BaseEvent {
  type: 'gate:resolved';
  pipelineId: string;
  nodeId: string;
  decision: 'approve' | 'reject' | 'question';
}

/** LLM call events. */
export interface LlmCallStartEvent extends BaseEvent {
  type: 'llm:start';
  pipelineId: string;
  provider: string;
  model: string;
  tool: string;
}

export interface LlmCallCompleteEvent extends BaseEvent {
  type: 'llm:complete';
  pipelineId: string;
  provider: string;
  model: string;
  tool: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface LlmCallErrorEvent extends BaseEvent {
  type: 'llm:error';
  pipelineId: string;
  provider: string;
  model: string;
  tool: string;
  error: string;
}

/** Budget events. */
export interface BudgetWarnEvent extends BaseEvent {
  type: 'budget:warn';
  pipelineId: string;
  currentCostUsd: number;
  budgetUsd: number;
  percentUsed: number;
}

export interface BudgetExceededEvent extends BaseEvent {
  type: 'budget:exceeded';
  pipelineId: string;
  currentCostUsd: number;
  budgetUsd: number;
}

/** Union of all event types. */
export type EngineEvent =
  | PipelineStartEvent
  | PipelineCompleteEvent
  | NodeStartEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | GatePendingEvent
  | GateResolvedEvent
  | LlmCallStartEvent
  | LlmCallCompleteEvent
  | LlmCallErrorEvent
  | BudgetWarnEvent
  | BudgetExceededEvent;

/** Extract event type string literals. */
export type EventType = EngineEvent['type'];

/** Listener function. */
export type EventListener = (event: EngineEvent) => void;

// ── EventBus ────────────────────────────────────────────────────────────────

export interface EventBusConfig {
  /** Max events to keep in history buffer. Default: 1000. */
  historySize?: number;
}

export class EventBus {
  private wildcardListeners: EventListener[] = [];
  private channelListeners: Map<EventType, EventListener[]> = new Map();
  private history: EngineEvent[] = [];
  private maxHistory: number;

  constructor(config?: EventBusConfig) {
    this.maxHistory = config?.historySize ?? 1000;
  }

  /**
   * Publish an event to all matching listeners.
   */
  emit(event: EngineEvent): void {
    // Add to history
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Notify wildcard listeners
    for (const listener of this.wildcardListeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not crash the publisher
      }
    }

    // Notify channel listeners
    const channelListeners = this.channelListeners.get(event.type);
    if (channelListeners) {
      for (const listener of channelListeners) {
        try {
          listener(event);
        } catch {
          // Listener errors must not crash the publisher
        }
      }
    }
  }

  /**
   * Subscribe to all events.
   *
   * @returns Unsubscribe function.
   */
  onAll(listener: EventListener): () => void {
    this.wildcardListeners.push(listener);
    return () => {
      this.wildcardListeners = this.wildcardListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to a specific event type.
   *
   * @returns Unsubscribe function.
   */
  on(eventType: EventType, listener: EventListener): () => void {
    if (!this.channelListeners.has(eventType)) {
      this.channelListeners.set(eventType, []);
    }
    this.channelListeners.get(eventType)!.push(listener);

    return () => {
      const listeners = this.channelListeners.get(eventType);
      if (listeners) {
        this.channelListeners.set(
          eventType,
          listeners.filter((l) => l !== listener),
        );
      }
    };
  }

  /**
   * Get event history, optionally filtered by type or pipeline.
   */
  getHistory(filter?: { type?: EventType; pipelineId?: string }): EngineEvent[] {
    let events = this.history;

    if (filter?.type) {
      events = events.filter((e) => e.type === filter.type);
    }
    if (filter?.pipelineId) {
      events = events.filter((e) => e.pipelineId === filter.pipelineId);
    }

    return [...events];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get the number of registered listeners.
   */
  listenerCount(): number {
    let count = this.wildcardListeners.length;
    for (const listeners of this.channelListeners.values()) {
      count += listeners.length;
    }
    return count;
  }
}
