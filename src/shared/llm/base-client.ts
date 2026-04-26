import type { LLMRequest, LLMResponse, LLMProvider } from '../types.js';
import { canRequest, recordSuccess, recordFailure } from '../circuit-breaker.js';
import { emitEvent } from '../event-bus.js';

export abstract class BaseLLMClient {
  protected provider: LLMProvider;
  protected model: string;

  /**
   * Optional cross-provider fallback chain. Populated by ModelRouter based on
   * tier preference. When the primary provider fails on a quota / rate-limit
   * error after retries, chatWithRetry walks this list trying the next provider.
   * Mutated per-call by the router; safe under single-threaded MCP request flow.
   */
  fallbacks: BaseLLMClient[] = [];

  constructor(provider: LLMProvider, model: string) {
    this.provider = provider;
    this.model = model;
  }

  abstract chat(request: LLMRequest): Promise<LLMResponse>;
  abstract isAvailable(): boolean;

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Execute chat with retry logic. Retries once on transient failures
   * (network errors, 429 rate limits, 5xx server errors).
   * Non-retryable errors (401, 403, 400) throw immediately.
   * After exhausting retries on the primary provider, walks the fallback
   * chain (if any) on quota / rate-limit errors only.
   *
   * Integrates: CircuitBreaker (provider failure handling),
   * EventBus (llm:start/complete/error events for Tracer).
   */
  async chatWithRetry(request: LLMRequest, maxRetries: number = 1): Promise<LLMResponse> {
    try {
      return await this._chatWithRetryInner(request, maxRetries);
    } catch (err) {
      const errMsg = String((err as Error)?.message || '').toLowerCase();
      const isRetryableProviderError =
        errMsg.includes('429') ||
        errMsg.includes('quota') ||
        errMsg.includes('rate limit') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('credit balance') ||
        errMsg.includes('insufficient_quota') ||
        errMsg.includes('billing') ||
        errMsg.includes('circuit is open');

      if (isRetryableProviderError && this.fallbacks && this.fallbacks.length > 0) {
        for (const fb of this.fallbacks) {
          if (!fb.isAvailable()) continue;
          try {
            console.error(
              `[${this.provider}] quota/billing error; falling back to ${fb.getProvider()}`,
            );
            return await fb._chatWithRetryInner(request, maxRetries);
          } catch {
            continue;
          }
        }
      }
      throw err;
    }
  }

  private async _chatWithRetryInner(request: LLMRequest, maxRetries: number = 1): Promise<LLMResponse> {
    // Circuit breaker check - fail fast if provider is down
    if (!canRequest(this.provider)) {
      throw new Error(`${this.provider} circuit is open - provider temporarily unavailable`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startMs = Date.now();

      emitEvent({
        type: 'llm:start',
        timestamp: new Date(),
        pipelineId: '',
        provider: this.provider,
        model: this.model,
        tool: '',
      });

      try {
        const response = await this.chat(request);
        const durationMs = Date.now() - startMs;

        recordSuccess(this.provider);

        emitEvent({
          type: 'llm:complete',
          timestamp: new Date(),
          pipelineId: '',
          provider: this.provider,
          model: this.model,
          tool: '',
          inputTokens: 0,
          outputTokens: response.tokensUsed,
          costUsd: 0,
          durationMs,
        });

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errMsg = lastError.message.toLowerCase();

        recordFailure(this.provider);

        emitEvent({
          type: 'llm:error',
          timestamp: new Date(),
          pipelineId: '',
          provider: this.provider,
          model: this.model,
          tool: '',
          error: lastError.message,
        });

        // Don't retry on auth/client errors
        const isNonRetryable =
          errMsg.includes('(401)') ||
          errMsg.includes('(403)') ||
          errMsg.includes('(400)') ||
          errMsg.includes('not configured');

        if (isNonRetryable) {
          console.error(`[${this.provider}] Non-retryable error: ${lastError.message}`);
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delayMs = 2000 * (attempt + 1);
          console.error(
            `[${this.provider}] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          console.error(`[${this.provider}] All ${maxRetries + 1} attempts failed: ${lastError.message}`);
        }
      }
    }

    throw lastError || new Error(`${this.provider} chat failed after ${maxRetries + 1} attempts`);
  }
}
