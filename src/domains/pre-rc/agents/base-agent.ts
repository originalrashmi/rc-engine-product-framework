import type { PersonaConfig, ResearchArtifact, ResearchState } from '../types.js';
import { LLMProvider } from '../types.js';
import type { LLMRequest } from '../../../shared/types.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';

export interface AgentContext {
  state: ResearchState;
  previousArtifacts: ResearchArtifact[];
}

export interface AgentResult {
  success: boolean;
  content: string;
  tokensUsed: number;
  llmUsed: LLMProvider;
  mode: 'autonomous' | 'passthrough';
}

export abstract class BaseResearchAgent {
  protected config: PersonaConfig;
  protected llm: LLMFactory;
  protected ctx: ContextLoader;

  constructor(config: PersonaConfig, llm: LLMFactory, ctx: ContextLoader) {
    this.config = config;
    this.llm = llm;
    this.ctx = ctx;
  }

  /**
   * Execute the persona - ALWAYS attempts autonomous mode first.
   * Falls back to passthrough ONLY when:
   *   (a) All LLM providers fail after retries, or
   *   (b) No API keys are genuinely available (getClient throws)
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    const knowledge = await this.ctx.loadKnowledge(this.config.knowledgeFile);
    const prompt = this.buildResearchPrompt(context);

    // ALWAYS attempt autonomous mode first
    const request: LLMRequest = {
      systemPrompt: knowledge,
      messages: [{ role: 'user' as const, content: prompt }],
      temperature: 0.7,
      maxTokens: this.config.tokenBudget,
    };

    // Web-grounded personas get search options for real-time data
    if (this.config.webGrounded) {
      request.searchOptions = {
        returnCitations: true,
        recencyFilter: 'month',
      };
      console.error(`[${this.config.id}] Web-grounded mode: citations enabled, recency=month`);
    }

    // Attempt 1: Try the assigned LLM provider with retry
    try {
      const client = this.llm.getClient(this.config.llmProvider);
      console.error(
        `[${this.config.id}] Attempting autonomous mode with ${client.getProvider()} (${client.getModel()})`,
      );
      const response = await client.chatWithRetry(request, 1);
      console.error(`[${this.config.id}] Autonomous success: ${response.tokensUsed} tokens via ${response.provider}`);

      return {
        success: true,
        content: response.content,
        tokensUsed: response.tokensUsed,
        llmUsed: response.provider,
        mode: 'autonomous',
      };
    } catch (primaryErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.error(`[${this.config.id}] Primary provider failed: ${primaryMsg}`);

      // Attempt 2: If the assigned provider was not Claude, try Claude as fallback with retry
      if (this.config.llmProvider !== LLMProvider.Claude) {
        try {
          const claude = this.llm.getClient(LLMProvider.Claude);
          console.error(`[${this.config.id}] Trying Claude fallback with retry...`);
          const response = await claude.chatWithRetry(request, 1);
          console.error(`[${this.config.id}] Claude fallback success: ${response.tokensUsed} tokens`);

          return {
            success: true,
            content: response.content,
            tokensUsed: response.tokensUsed,
            llmUsed: LLMProvider.Claude,
            mode: 'autonomous',
          };
        } catch (claudeErr) {
          const claudeMsg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
          console.error(`[${this.config.id}] Claude fallback also failed: ${claudeMsg}`);
        }
      }

      // ALL autonomous attempts exhausted - NOW fall back to passthrough
      console.error(
        `[${this.config.id}] PASSTHROUGH TRIGGERED - Reason: All LLM providers failed after retries. Primary error: ${primaryMsg}`,
      );

      return {
        success: true,
        content: this.buildPassthroughOutput(knowledge, prompt, primaryMsg),
        tokensUsed: 0,
        llmUsed: this.config.llmProvider,
        mode: 'passthrough',
      };
    }
  }

  protected abstract buildResearchPrompt(context: AgentContext): string;

  private buildPassthroughOutput(knowledge: string, prompt: string, failureReason: string): string {
    return [
      `## ${this.config.name} - Manual Mode`,
      '',
      `> **Why manual mode?** Automatic mode failed after retries: ${failureReason}`,
      '',
      '### Knowledge Reference',
      knowledge,
      '',
      '---',
      '',
      '### Research Prompt',
      prompt,
      '',
      '---',
      '',
      `### Output Instructions`,
      `Save the research output to: ${this.config.stage}/${this.config.id}.md`,
      `Token budget: ${this.config.tokenBudget} tokens`,
    ].join('\n');
  }
}
