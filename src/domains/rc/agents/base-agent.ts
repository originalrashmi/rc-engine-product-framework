import type { ContextLoader } from '../context-loader.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import { LLMProvider } from '../../../shared/types.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { hasApiKey } from '../../../shared/config.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import type { AgentResult } from '../types.js';

export abstract class BaseAgent {
  protected contextLoader: ContextLoader;
  protected llmFactory: LLMFactory;

  constructor(contextLoader: ContextLoader, llmFactory: LLMFactory) {
    this.contextLoader = contextLoader;
    this.llmFactory = llmFactory;
  }

  /**
   * Dual-mode execution:
   * - If API key is set: loads knowledge, calls LLM via shared factory, returns response
   * - If no API key: assembles knowledge + instructions and returns them for the host IDE to process
   *
   * CRITICAL FIX: The old chatWithClaude() returned string and discarded token usage.
   * Now we use LLMFactory which returns {content, tokensUsed, provider} and record usage.
   */
  protected async execute(
    knowledgeFiles: string[],
    agentInstructions: string,
    userMessage: string,
    projectContext?: string,
  ): Promise<string> {
    const knowledge = this.contextLoader.loadFiles(knowledgeFiles);

    const systemPrompt = `${knowledge}\n\n---\n\n${agentInstructions}`;

    const userContent = projectContext
      ? `## Project Context\n${projectContext}\n\n## Request\n${userMessage}`
      : userMessage;

    if (hasApiKey) {
      // Autonomous mode: call LLM via shared factory with token tracking
      const client = this.llmFactory.getClient(LLMProvider.Claude);
      const response = await client.chatWithRetry({
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxTokens: 4096,
      });
      tokenTracker.record('rc', this.constructor.name, response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: this.constructor.name,
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });
      recordModelPerformance({
        provider: response.provider,
        model: client.getModel(),
        taskType: `rc-agent-${this.constructor.name}`,
        tokensUsed: response.tokensUsed,
        success: true,
      });
      return response.content;
    }

    // Passthrough mode: return assembled context for the host IDE
    const sections: string[] = [
      `## RC Method Agent Instructions\n\n${agentInstructions}`,
      `## Knowledge Reference\n\nLoaded: ${knowledgeFiles.join(', ')}\n\n${knowledge}`,
    ];

    if (projectContext) {
      sections.push(`## Project Context\n\n${projectContext}`);
    }

    sections.push(`## Request\n\n${userMessage}`);
    sections.push(
      `## Output Instructions\n\nFollow the instructions and knowledge above to generate the requested output. If an artifact needs saving, call the \`rc_save\` tool with the content and artifact type.`,
    );

    return sections.join('\n\n---\n\n');
  }

  /** Each sub-agent implements its own run method */
  abstract run(...args: unknown[]): Promise<AgentResult>;
}
