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
    let response;
    try {
      const stream = this.client.messages.stream(params);
      response = await stream.finalMessage();
    } catch (err) {
      throw this.withRemediation(err as Error);
    }

    let text = response.content[0].type === 'text' ? response.content[0].text : '';
    let inputTokens = response.usage.input_tokens;
    let outputTokens = response.usage.output_tokens;

    // Truncation guard: a max_tokens stop used to be persisted silently, so a
    // 24-task list could be saved cut off mid-sentence and every downstream
    // phase consumed the corrupt artifact. Continue the generation (bounded),
    // and fail loudly if it still will not fit.
    let continuations = 0;
    const messages = [...params.messages];
    while (response.stop_reason === 'max_tokens' && continuations < MAX_CONTINUATIONS) {
      continuations += 1;
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content:
          'Your previous message was cut off by the output limit. Continue EXACTLY where you stopped. Do not repeat anything already written, do not add a preamble.',
      });
      try {
        const stream = this.client.messages.stream({ ...params, messages });
        response = await stream.finalMessage();
      } catch (err) {
        throw this.withRemediation(err as Error);
      }
      const part = response.content[0].type === 'text' ? response.content[0].text : '';
      text += part;
      messages[messages.length - 2] = { role: 'assistant', content: text };
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Claude output still truncated after ${MAX_CONTINUATIONS} continuation(s) ` +
          `(${outputTokens} output tokens). Raise maxTokens for this call or split the request; ` +
          `refusing to return a silently truncated result.`,
      );
    }

    return {
      content: text,
      tokensUsed: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      provider: LLMProvider.Claude,
    };
  }

  /** Map opaque API failures to actionable errors (retired model ids especially). */
  private withRemediation(err: Error): Error {
    const msg = err.message || '';
    if (msg.includes('not_found_error') && msg.includes('model')) {
      return new Error(
        `Claude model "${this.model}" was not found - it has likely been retired. ` +
          `Set CLAUDE_MODEL in .env (or the environment) to a current model alias ` +
          `such as "claude-sonnet-4-5". Original error: ${msg}`,
      );
    }
    return err;
  }
}

/** Bounded auto-continuation rounds when a response stops at max_tokens. */
const MAX_CONTINUATIONS = 2;
