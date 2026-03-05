/**
 * Abstract Build Agent — Base class for role-based forge agents.
 *
 * Each specialized agent (DatabaseArchitect, BackendEngineer, etc.)
 * extends this with its own system prompt and knowledge file.
 */

import type { ContextLoader } from '../context-loader.js';
import type { BuildTask, TaskBuildResult, ForgeState } from './types.js';
import { hasApiKey } from '../../../shared/config.js';
import { routeRequest } from '../../../shared/model-router.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import type { CostTier } from '../../../shared/llm/router.js';

export abstract class BuildAgent {
  protected contextLoader: ContextLoader;

  constructor(contextLoader: ContextLoader) {
    this.contextLoader = contextLoader;
  }

  /** Human-readable agent name (e.g. "DatabaseArchitect") */
  abstract get agentName(): string;

  /** Cost tier for model routing (cheap, standard, premium) */
  abstract get costTier(): CostTier;

  /** System prompt with role-specific instructions */
  abstract getSystemPrompt(state: ForgeState): string;

  /** Knowledge files to load for this agent */
  abstract getKnowledgeFiles(state: ForgeState): string[];

  /**
   * Build a task. Calls the LLM with role-specific context and returns the result.
   */
  async build(task: BuildTask, state: ForgeState): Promise<TaskBuildResult> {
    const startMs = Date.now();

    try {
      const output = await this.execute(task, state);
      const durationMs = Date.now() - startMs;

      return {
        taskId: task.taskId,
        agentName: this.agentName,
        output,
        generatedFiles: this.extractFileNames(output),
        tokensUsed: 0, // Updated by execute() via recordCost
        costUsd: 0,
        durationMs,
        success: true,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        agentName: this.agentName,
        output: '',
        generatedFiles: [],
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startMs,
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Execute the LLM call with role-specific context.
   */
  protected async execute(task: BuildTask, state: ForgeState): Promise<string> {
    // Load knowledge files
    let knowledge = '';
    for (const file of this.getKnowledgeFiles(state)) {
      try {
        knowledge += this.contextLoader.loadFile(file) + '\n\n---\n\n';
      } catch {
        // Skip missing knowledge files
      }
    }

    const systemPrompt = `${knowledge}\n\n${this.getSystemPrompt(state)}`;

    // Build the user message with task spec and contracts
    const contractContext = this.buildContractContext(state);
    const userMessage = `## Task\n${task.spec}\n\n## Contracts from Previous Layers\n${contractContext}`;

    if (!hasApiKey) {
      // Passthrough mode
      return [
        `## ${this.agentName} Build Instructions\n\n${this.getSystemPrompt(state)}`,
        `## Knowledge\n\n${knowledge}`,
        `## Task\n\n${task.spec}`,
        `## Contracts\n\n${contractContext}`,
        `## Output Instructions\n\nGenerate the implementation files using ===FILE: path=== / ===END_FILE=== format.`,
      ].join('\n\n---\n\n');
    }

    // Route to best model for this agent's tier
    const { client } = routeRequest({
      taskType: `forge-${this.agentName}`,
      domain: 'rc',
      pipelineId: 'rc-session',
      forceTier: this.costTier,
    });

    const response = await client.chatWithRetry({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 8192,
    });

    tokenTracker.record('rc', this.agentName, response.tokensUsed, response.provider);
    recordCost({
      pipelineId: 'rc-session',
      domain: 'rc',
      tool: this.agentName,
      provider: response.provider,
      model: client.getModel(),
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? response.tokensUsed,
    });
    recordModelPerformance({
      provider: response.provider,
      model: client.getModel(),
      taskType: `forge-${this.agentName}`,
      tokensUsed: response.tokensUsed,
      success: true,
    });

    return response.content;
  }

  /**
   * Build contract context string from ForgeState.
   */
  private buildContractContext(state: ForgeState): string {
    const parts: string[] = [];
    if (state.contracts.schemas) {
      parts.push(`### Database Schema\n${state.contracts.schemas}`);
    }
    if (state.contracts.apiRoutes) {
      parts.push(`### API Routes\n${state.contracts.apiRoutes}`);
    }
    if (state.contracts.componentInterfaces) {
      parts.push(`### Component Interfaces\n${state.contracts.componentInterfaces}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : 'No contracts available yet (this is Layer 1).';
  }

  /**
   * Extract file names from ===FILE: path=== blocks.
   */
  private extractFileNames(output: string): string[] {
    const files: string[] = [];
    const regex = /===FILE:\s*(.+?)===/g;
    let match;
    while ((match = regex.exec(output)) !== null) {
      files.push(match[1].trim());
    }
    return files;
  }
}
