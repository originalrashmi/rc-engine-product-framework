import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMClient } from './base-client.js';
import type { LLMRequest, LLMResponse } from '../types.js';
import { LLMProvider } from '../types.js';
import { config } from '../config.js';

export class ClaudeClient extends BaseLLMClient {
  private client: Anthropic | null = null;

  constructor() {
    super(LLMProvider.Claude, config.claudeModel);
    if (config.anthropicApiKey) {
      this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }
  }

  isAvailable(): boolean {
    return !!config.anthropicApiKey;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Anthropic API key not configured');
    }

    const userMessages = request.messages.filter((m) => m.role !== 'system');
    const systemContent = request.systemPrompt || request.messages.find((m) => m.role === 'system')?.content || '';

    // Build system blocks with prompt caching.
    // Anthropic caches the system prompt prefix across calls — subsequent calls
    // with the same system content pay ~10% of original input token cost.
    // We split: knowledge (stable, cacheable) + instructions (variable).
    const systemBlocks = this.buildCachedSystemBlocks(systemContent);

    const params = {
      model: this.model,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      system: systemBlocks,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    } as const;

    // Use streaming to avoid Anthropic's 10-minute timeout on non-streaming calls.
    // Large synthesis requests (100K+ input tokens, 32K output) exceed the timeout.
    // stream().finalMessage() returns the same Message shape as messages.create().
    const stream = this.client.messages.stream(params);
    const response = await stream.finalMessage();

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = response.usage as any;
    const cacheCreation: number = usage.cache_creation_input_tokens ?? 0;
    const cacheRead: number = usage.cache_read_input_tokens ?? 0;

    return {
      content: text,
      tokensUsed: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      cacheCreationTokens: cacheCreation,
      cacheReadTokens: cacheRead,
      provider: LLMProvider.Claude,
    };
  }

  /**
   * Split system content into cacheable blocks.
   *
   * If the content contains a `---` separator (knowledge vs instructions),
   * the knowledge portion gets cache_control for reuse across calls.
   * Minimum 1024 tokens (~4K chars) for caching to be worthwhile.
   */
  private buildCachedSystemBlocks(
    systemContent: string,
  ): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    const separator = '\n\n---\n\n';
    const sepIdx = systemContent.indexOf(separator);

    // If no separator or knowledge portion is too small, use a single cached block
    if (sepIdx === -1 || sepIdx < 4000) {
      return [
        {
          type: 'text' as const,
          text: systemContent,
          cache_control: systemContent.length >= 4000 ? { type: 'ephemeral' as const } : undefined,
        },
      ];
    }

    const knowledgePart = systemContent.slice(0, sepIdx);
    const instructionPart = systemContent.slice(sepIdx + separator.length);

    return [
      {
        type: 'text' as const,
        text: knowledgePart,
        cache_control: { type: 'ephemeral' as const },
      },
      {
        type: 'text' as const,
        text: instructionPart,
      },
    ];
  }
}
