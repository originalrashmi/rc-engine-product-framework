import { BaseLLMClient } from './base-client.js';
import type { LLMRequest, LLMResponse } from '../types.js';
import { LLMProvider } from '../types.js';
import { config } from '../config.js';

export class PerplexityClient extends BaseLLMClient {
  constructor() {
    super(LLMProvider.Perplexity, config.perplexityModel);
  }

  isAvailable(): boolean {
    return !!config.perplexityApiKey;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!config.perplexityApiKey) {
      throw new Error('Perplexity API key not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];

    const systemContent = request.systemPrompt || request.messages.find((m) => m.role === 'system')?.content;
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    for (const m of request.messages.filter((m) => m.role !== 'system')) {
      messages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens || 4096,
    };

    if (request.searchOptions) {
      if (request.searchOptions.returnCitations) {
        body.return_citations = true;
      }
      if (request.searchOptions.recencyFilter) {
        body.search_recency_filter = request.searchOptions.recencyFilter;
      }
      if (request.searchOptions.searchDomains && request.searchOptions.searchDomains.length > 0) {
        body.search_domain_filter = request.searchOptions.searchDomains;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.perplexityApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Perplexity API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;

    const citations = data.citations;
    let finalContent = content;
    if (citations && Array.isArray(citations) && citations.length > 0) {
      finalContent += '\n\n---\n\n### Sources\n';
      for (let i = 0; i < citations.length; i++) {
        finalContent += `[${i + 1}] ${citations[i]}\n`;
      }
    }

    return { content: finalContent, tokensUsed: tokens, provider: LLMProvider.Perplexity };
  }
}
