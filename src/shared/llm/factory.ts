import type { BaseLLMClient } from './base-client.js';
import { ClaudeClient } from './claude-client.js';
import { OpenAIClient } from './openai-client.js';
import { GeminiClient } from './gemini-client.js';
import { PerplexityClient } from './perplexity-client.js';
import { LLMProvider } from '../types.js';

export class LLMFactory {
  private clients: Map<LLMProvider, BaseLLMClient> = new Map();
  private claude: ClaudeClient;

  constructor() {
    this.claude = new ClaudeClient();
    this.clients.set(LLMProvider.Claude, this.claude);
    this.clients.set(LLMProvider.OpenAI, new OpenAIClient());
    this.clients.set(LLMProvider.Gemini, new GeminiClient());
    this.clients.set(LLMProvider.Perplexity, new PerplexityClient());
    this.populateFallbacks();
  }

  /**
   * Populate every client's `fallbacks` chain with the other available
   * providers in a sensible default order. Many call sites bypass the
   * ModelRouter and use factory.getClient() directly — this ensures they
   * still get cross-provider fallback on quota / rate-limit errors.
   */
  private populateFallbacks(): void {
    const fallbackOrder: LLMProvider[] = [
      LLMProvider.Claude,
      LLMProvider.OpenAI,
      LLMProvider.Gemini,
      LLMProvider.Perplexity,
    ];
    for (const [provider, client] of this.clients) {
      client.fallbacks = fallbackOrder
        .filter((p) => p !== provider)
        .map((p) => this.clients.get(p))
        .filter((c): c is BaseLLMClient => !!c && c.isAvailable());
    }
  }

  /**
   * Get the client for a provider. Falls back to Claude if the provider is unavailable.
   */
  getClient(provider: LLMProvider): BaseLLMClient {
    const client = this.clients.get(provider);

    if (client && client.isAvailable()) {
      return client;
    }

    // Fallback to Claude
    if (this.claude.isAvailable()) {
      console.error(`[LLMFactory] ${provider} unavailable, falling back to Claude`);
      return this.claude;
    }

    throw new Error(
      `No LLM provider available. ${provider} and Claude fallback both unconfigured. ` +
        'Set at least ANTHROPIC_API_KEY in your .env file.',
    );
  }

  /**
   * Check if a specific provider is available (not falling back).
   */
  isNativelyAvailable(provider: LLMProvider): boolean {
    const client = this.clients.get(provider);
    return !!client && client.isAvailable();
  }

  /**
   * Get a summary of which providers are available.
   */
  getAvailabilityReport(): Record<LLMProvider, boolean> {
    const report: Record<string, boolean> = {};
    for (const [provider, client] of this.clients) {
      report[provider] = client.isAvailable();
    }
    return report as Record<LLMProvider, boolean>;
  }
}

/** Shared singleton - use this instead of `new LLMFactory()`. */
export const llmFactory = new LLMFactory();
