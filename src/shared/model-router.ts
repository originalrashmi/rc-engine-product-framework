/**
 * Thin ModelRouter wrapper for intelligent LLM selection.
 *
 * Falls back to llmFactory.getClient() on any error,
 * preserving existing behavior.
 */

import { ModelRouter } from './llm/router.js';
import type { RouteRequest, RoutingDecision } from './llm/router.js';
import type { BaseLLMClient } from './llm/base-client.js';
import { llmFactory } from './llm/factory.js';
import { LLMProvider } from './types.js';

let _router: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!_router) {
    // ModelRouter accepts optional LearningStore and CostTracker.
    // We pass null for both -- they integrate through their own wrappers.
    // The router still provides task-type routing and tier-based selection.
    _router = new ModelRouter(llmFactory, null, null);
  }
  return _router;
}

/**
 * Route a request to the best LLM client. Falls back to llmFactory.getClient()
 * if ModelRouter fails, so existing behavior is preserved.
 */
export function routeRequest(request: RouteRequest): {
  client: BaseLLMClient;
  decision: RoutingDecision;
} {
  try {
    return getModelRouter().route(request);
  } catch {
    // Fallback to existing behavior
    const provider = request.preferredProvider ?? LLMProvider.Claude;
    const client = llmFactory.getClient(provider);
    return {
      client,
      decision: { provider, reason: 'router-fallback', tier: 'standard' },
    };
  }
}
