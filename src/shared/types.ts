// ============================================================================
// SHARED ENUMS - used across all domains
// ============================================================================

export enum LLMProvider {
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Perplexity = 'perplexity',
}

export enum GateStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

// ============================================================================
// SHARED LLM TYPES - the unified interface all domains use
// ============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMSearchOptions {
  returnCitations?: boolean;
  recencyFilter?: 'month' | 'week' | 'day' | 'hour';
  searchDomains?: string[];
}

export interface LLMRequest {
  systemPrompt?: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  searchOptions?: LLMSearchOptions;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  /** Input tokens consumed. Available when the provider reports them separately. */
  inputTokens?: number;
  /** Output tokens generated. Available when the provider reports them separately. */
  outputTokens?: number;
  /** Tokens written to Anthropic prompt cache (first call with new system prompt). */
  cacheCreationTokens?: number;
  /** Tokens read from Anthropic prompt cache (subsequent calls with same system prompt). */
  cacheReadTokens?: number;
  provider: LLMProvider;
}
