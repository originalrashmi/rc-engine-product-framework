import type { AgentContext } from './base-agent.js';
import { BaseResearchAgent } from './base-agent.js';
import type { PersonaConfig } from '../types.js';
import { ResearchStage } from '../types.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';

/**
 * Generic persona agent - loads a knowledge file and builds a research prompt.
 * All 20 personas use this single class; differentiation comes from the knowledge file.
 */
export class PersonaAgent extends BaseResearchAgent {
  constructor(config: PersonaConfig, llm: LLMFactory, ctx: ContextLoader) {
    super(config, llm, ctx);
  }

  protected buildResearchPrompt(context: AgentContext): string {
    const sections: string[] = [];

    // Product brief
    sections.push('# Product Brief\n');
    sections.push(`**Project:** ${context.state.brief.name}`);
    sections.push(`**Description:** ${context.state.brief.description}\n`);
    sections.push(context.state.brief.rawInput);

    // Classification context (if available)
    if (context.state.classification) {
      sections.push('\n\n# Complexity Classification\n');
      sections.push(`**Domain:** ${context.state.classification.domain}`);
      sections.push(`**Product Class:** ${context.state.classification.productClass}`);
      sections.push(`**Complexity Factors:** ${context.state.classification.complexityFactors.join(', ')}`);
      sections.push(`**Reasoning:** ${context.state.classification.reasoning}`);
    }

    // Previous research from this and dependent stages
    const relevantArtifacts = this.getRelevantArtifacts(context);
    if (relevantArtifacts.length > 0) {
      sections.push('\n\n# Previous Research Context\n');
      for (const artifact of relevantArtifacts) {
        sections.push(`## ${artifact.personaName} (${artifact.stage})\n`);
        sections.push(artifact.content);
        sections.push('');
      }
    }

    // Task instruction
    sections.push('\n\n# Your Task\n');
    sections.push(
      `You are the **${this.config.name}**. Using your specialized knowledge framework and the product context above, produce your research analysis.`,
    );
    sections.push(`\nFocus on actionable insights that will directly inform the PRD. Be specific, not generic.`);
    sections.push(`Token budget: ~${this.config.tokenBudget} tokens. Be concise but thorough.`);

    // Web-grounded personas get explicit instructions to search and cite real data
    if (this.config.webGrounded) {
      sections.push('\n\n# IMPORTANT: Web Search Grounding\n');
      sections.push('You have access to real-time web search. You MUST use it to ground your analysis in real data.');
      sections.push('');
      sections.push('**Requirements:**');
      sections.push('- Search for REAL competitors, their actual pricing pages, and current market data');
      sections.push('- Cite specific URLs, company names, and pricing tiers you find - do NOT invent competitors');
      sections.push('- If you reference market size, growth rates, or benchmarks, cite the source');
      sections.push(
        '- If you cannot find data for a claim, explicitly mark it as "[UNVERIFIED - needs manual validation]"',
      );
      sections.push('- Prefer data from the last 12 months over older sources');
      sections.push('- For pricing analysis: search for at least 3 real competitor pricing pages and compare');
      sections.push('- For market analysis: search for industry reports, funding data, or analyst coverage');
      sections.push('');
      sections.push(
        'Every factual claim should be traceable to a source. This prevents hallucination and gives the PRD reader confidence that recommendations are grounded in reality.',
      );
    }

    return sections.join('\n');
  }

  private getRelevantArtifacts(context: AgentContext) {
    const deps = this.getDependentStages();
    return context.previousArtifacts.filter((a) => deps.includes(a.stage) || a.stage === this.config.stage);
  }

  /**
   * Each stage depends on the stages before it.
   */
  private getDependentStages(): ResearchStage[] {
    const stageOrder = [
      ResearchStage.MetaOrchestration,
      ResearchStage.UserIntelligence,
      ResearchStage.BusinessMarket,
      ResearchStage.Technical,
      ResearchStage.UXCognitive,
      ResearchStage.Validation,
    ];

    const currentIdx = stageOrder.indexOf(this.config.stage);
    return stageOrder.slice(0, currentIdx);
  }
}
