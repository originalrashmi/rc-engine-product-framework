import { BaseLLMClient } from './base-client.js';
import type { LLMRequest, LLMResponse } from '../types.js';
import { LLMProvider } from '../types.js';
import { config } from '../config.js';

export class OpenAIClient extends BaseLLMClient {
  constructor() {
    super(LLMProvider.OpenAI, config.openaiModel);
  }

  isAvailable(): boolean {
    return !!config.openaiApiKey;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];

    const systemContent = request.systemPrompt || request.messages.find((m) => m.role === 'system')?.content;
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    for (const m of request.messages.filter((m) => m.role !== 'system')) {
      messages.push({ role: m.role, content: m.content });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;

    return { content, tokensUsed: tokens, provider: LLMProvider.OpenAI };
  }
}
