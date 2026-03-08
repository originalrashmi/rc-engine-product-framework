import { BaseLLMClient } from './base-client.js';
import type { LLMRequest, LLMResponse } from '../types.js';
import { LLMProvider } from '../types.js';
import { config } from '../config.js';

export class GeminiClient extends BaseLLMClient {
  constructor() {
    super(LLMProvider.Gemini, config.geminiModel);
  }

  isAvailable(): boolean {
    return !!config.geminiApiKey;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!config.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const systemContent = request.systemPrompt || request.messages.find((m) => m.role === 'system')?.content;

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens || 4096,
      },
    };

    if (systemContent) {
      body.systemInstruction = { parts: [{ text: systemContent }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const tokens = data.usageMetadata?.totalTokenCount || inputTokens + outputTokens;

    return { content, tokensUsed: tokens, inputTokens, outputTokens, provider: LLMProvider.Gemini };
  }
}
