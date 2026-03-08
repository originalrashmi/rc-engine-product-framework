import type { LLMRequest, LLMResponse, LLMProvider } from '../types.js';
import { canRequest, recordSuccess, recordFailure } from '../circuit-breaker.js';
import { emitEvent } from '../event-bus.js';

export abstract class BaseLLMClient {
  protected provider: LLMProvider;
  protected model: string;

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
   *
   * Integrates: CircuitBreaker (provider failure handling),
   * EventBus (llm:start/complete/error events for Tracer).
   */
  async chatWithRetry(request: LLMRequest, maxRetries: number = 1): Promise<LLMResponse> {
    // Circuit breaker check -- fail fast if provider is down
    if (!canRequest(this.provider)) {
      throw new Error(`${this.provider} circuit is open -- provider temporarily unavailable`);
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
          inputTokens: response.inputTokens ?? 0,
          outputTokens: response.outputTokens ?? response.tokensUsed,
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
