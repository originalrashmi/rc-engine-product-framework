/**
 * Bridges GraphRunner events to the global EventBus.
 *
 * Call bridgeGraphToEventBus(runner, pipelineId) after creating a
 * GraphRunner to connect graph execution to the observability layer.
 * Returns an unsubscribe function.
 */

import type { GraphRunner } from '../core/graph/runner.js';
import { emitEvent } from './event-bus.js';

export function bridgeGraphToEventBus<S>(runner: GraphRunner<S>, pipelineId: string): () => void {
  return runner.on((event) => {
    try {
      switch (event.type) {
        case 'graph-start':
          emitEvent({
            type: 'pipeline:start',
            timestamp: event.timestamp,
            pipelineId,
            graphId: event.graphId,
          });
          break;
        case 'graph-complete':
          emitEvent({
            type: 'pipeline:complete',
            timestamp: event.timestamp,
            pipelineId,
            graphId: event.graphId,
            status: event.status,
            durationMs: 0,
          });
          break;
        case 'node-start':
          emitEvent({
            type: 'node:start',
            timestamp: event.timestamp,
            pipelineId,
            nodeId: event.nodeId,
          });
          break;
        case 'node-complete':
          emitEvent({
            type: 'node:complete',
            timestamp: event.timestamp,
            pipelineId,
            nodeId: event.nodeId,
            durationMs: event.durationMs,
            metadata: event.metadata,
          });
          break;
        case 'node-error':
          emitEvent({
            type: 'node:error',
            timestamp: event.timestamp,
            pipelineId,
            nodeId: event.nodeId,
            error: event.error,
            retryCount: event.retryCount,
            willRetry: event.willRetry,
          });
          break;
        case 'gate-pending':
          emitEvent({
            type: 'gate:pending',
            timestamp: event.timestamp,
            pipelineId,
            nodeId: event.nodeId,
          });
          break;
      }
    } catch {
      // Bridge errors must never crash the graph runner.
    }
  });
}
