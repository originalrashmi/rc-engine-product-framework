/**
 * Thin EventBus wrapper for domain tools.
 *
 * Provides a shared singleton and safe event emission
 * so observability never breaks the pipeline.
 */

import { EventBus } from '../core/observability/event-bus.js';
import type { EngineEvent } from '../core/observability/event-bus.js';

let _bus: EventBus | null = null;

/** Get the shared EventBus singleton. */
export function getEventBus(): EventBus {
  if (!_bus) {
    _bus = new EventBus({ historySize: 1000 });
  }
  return _bus;
}

/** Safely emit an event. Never throws. */
export function emitEvent(event: EngineEvent): void {
  try {
    getEventBus().emit(event);
  } catch {
    // EventBus errors must never break the pipeline.
  }
}
