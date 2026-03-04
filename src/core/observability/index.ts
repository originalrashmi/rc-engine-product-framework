export { EventBus } from './event-bus.js';
export type {
  BaseEvent,
  EngineEvent,
  EventType,
  EventListener,
  EventBusConfig,
  PipelineStartEvent,
  PipelineCompleteEvent,
  NodeStartEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  GatePendingEvent,
  GateResolvedEvent,
  LlmCallStartEvent,
  LlmCallCompleteEvent,
  LlmCallErrorEvent,
  BudgetWarnEvent,
  BudgetExceededEvent,
} from './event-bus.js';

export { Tracer } from './tracer.js';
export type { SpanBase, LlmSpan, NodeSpan, PipelineTrace } from './tracer.js';
