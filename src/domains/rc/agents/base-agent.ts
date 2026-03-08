import type { ContextLoader } from '../context-loader.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { hasApiKey } from '../../../shared/config.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import { routeRequest } from '../../../shared/model-router.js';
import type { AgentResult } from '../types.js';

/**
 * Task-specific maxTokens mapping. Sized to typical output needs per agent.
 * Prevents waste: a scoring agent doesn't need 4096 output tokens.
 */
const AGENT_MAX_TOKENS: Record<string, number> = {
  UxAgent_score: 1024,       // Numeric score + mode + specialist list
  UxAgent_audit: 3500,       // Audit report with findings
  UxAgent_generate: 4096,    // Full UX PRD child
  QualityAgent: 3500,        // Quality gate report
  TaskAgent: 4096,           // Full task list
  ConnectAgent: 3500,        // Integration report
  ArchitectAgent: 4096,      // Architecture document
  DefineAgent: 4096,         // PRD generation
  IlluminateAgent: 3500,     // Discovery report
};

const DEFAULT_MAX_TOKENS = 4096;

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
    const knowledge = this.contextLoader.loadRequiredFiles(knowledgeFiles);

    const systemPrompt = `${knowledge}\n\n---\n\n${agentInstructions}`;

    const userContent = projectContext
      ? `## Project Context\n${projectContext}\n\n## Request\n${userMessage}`
      : userMessage;

    if (hasApiKey) {
      const agentName = this.constructor.name;
      const maxTokens = AGENT_MAX_TOKENS[agentName] ?? DEFAULT_MAX_TOKENS;

      // Pre-flight token estimation: warn if input is unusually large
      const estimatedInputChars = systemPrompt.length + userContent.length;
      const estimatedInputTokens = Math.ceil(estimatedInputChars / 3.5);
      if (estimatedInputTokens > 50_000) {
        console.error(
          `[rc-engine] [${agentName}] Large input detected: ~${estimatedInputTokens.toLocaleString()} tokens ` +
          `(system: ${Math.ceil(systemPrompt.length / 3.5).toLocaleString()}, user: ${Math.ceil(userContent.length / 3.5).toLocaleString()})`,
        );
      }

      // Autonomous mode: route to best LLM via ModelRouter with token tracking
      const { client } = routeRequest({
        taskType: `rc-agent-${agentName}`,
        domain: 'rc',
        pipelineId: 'rc-session',
      });
      const response = await client.chatWithRetry({
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxTokens,
      });
      tokenTracker.record('rc', agentName, response.tokensUsed, response.provider, {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cacheCreationTokens: response.cacheCreationTokens,
        cacheReadTokens: response.cacheReadTokens,
      });
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: agentName,
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });
      recordModelPerformance({
        provider: response.provider,
        model: client.getModel(),
        taskType: `rc-agent-${agentName}`,
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
