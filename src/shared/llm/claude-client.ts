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

    const params = {
      model: this.model,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      system: systemContent,
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
    const tokens = response.usage.input_tokens + response.usage.output_tokens;

    return { content: text, tokensUsed: tokens, provider: LLMProvider.Claude };
  }
}
