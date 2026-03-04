import type { PersonaConfig } from '../types.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';
import type { BaseResearchAgent } from './base-agent.js';
import { PersonaAgent } from './persona-agent.js';

/**
 * Factory that creates persona agent instances from config.
 * All personas use the generic PersonaAgent - differentiation comes from knowledge files.
 */
export class AgentFactory {
  private llm: LLMFactory;
  private ctx: ContextLoader;

  constructor(llm: LLMFactory, ctx: ContextLoader) {
    this.llm = llm;
    this.ctx = ctx;
  }

  create(config: PersonaConfig): BaseResearchAgent {
    return new PersonaAgent(config, this.llm, this.ctx);
  }
}
