import type { AgentContext } from './base-agent.js';
import { BaseResearchAgent } from './base-agent.js';
import type { PersonaConfig } from '../types.js';
import { ResearchStage } from '../types.js';
import { GateStatus } from '../../../shared/types.js';
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
      if (context.state.classification.industry) {
        sections.push(`**Industry / Vertical:** ${context.state.classification.industry}`);
      }
      if (context.state.classification.productFunction) {
        sections.push(`**Product Function:** ${context.state.classification.productFunction}`);
      }
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

      // Search-query construction discipline.
      // Without this, generic project names ("Pearl AI", "Apex", "Nova", etc.) collide
      // with established companies in unrelated industries and pollute the analysis.
      sections.push('\n\n# CRITICAL: Search Query Construction\n');
      sections.push(
        '**Anchor your searches on the product CATEGORY (industry + function), NOT the project name.** The project name is internal vocabulary; using it as a standalone search query may surface unrelated products with similar names and corrupt the analysis.',
      );
      sections.push('');

      const cls = context.state.classification;
      const projName = context.state.brief.name;
      if (cls?.industry || cls?.productFunction) {
        const industry = cls.industry || '(not specified)';
        const productFunction = cls.productFunction || '(not specified)';
        const productClass = cls.productClass || '(not specified)';
        sections.push('**For this project, build queries from these anchors (NOT the project name):**');
        sections.push(`- **Industry / vertical:** ${industry}`);
        sections.push(`- **Product function:** ${productFunction}`);
        sections.push(`- **Product class:** ${productClass}`);
        sections.push('');
        sections.push('**Example query patterns to use:**');
        sections.push(`- "${productClass} for ${industry} 2026"`);
        sections.push(`- "${productFunction} ${industry} competitors"`);
        sections.push(`- "${productFunction} platforms for [target user from brief]"`);
        sections.push(`- "${industry} market sizing 2026"`);
        sections.push('');
        sections.push(`**DO NOT** use "${projName}" as a standalone search query.`);
      } else {
        sections.push(
          '**For this project, build queries from the product class, target user (ICP), and problem space described in the brief.** Do NOT use the project name as a standalone search query.',
        );
      }
      sections.push('');
      sections.push('**Disambiguation discipline:**');
      sections.push(
        `- Before relying on any source, verify it matches this product's industry and function. If a search returns results about an unrelated product with a similar name (e.g., a dental-AI company when you are researching real-estate software), DISCARD those sources.`,
      );
      sections.push(
        `- If your first query returns mostly off-domain results, immediately refine the query with industry/function modifiers and retry. Do not pad the analysis with off-domain citations.`,
      );
      sections.push(
        `- If after 2-3 refinements you cannot find on-domain sources, mark relevant claims as "[UNVERIFIED - on-domain sources unavailable]" rather than fabricating or substituting off-domain data.`,
      );
    }

    // Operator constraints from approved gate feedback.
    // Without this, user-validated decisions made at gate checkpoints (e.g.,
    // "MVP-first, no Kubernetes/RabbitMQ") evaporate after the gate is passed
    // and downstream personas can re-introduce rejected approaches.
    const approvedFeedback = (context.state.gates ?? [])
      .filter((g) => g.status === GateStatus.Approved && g.feedback && g.feedback.trim() !== '')
      .map((g) => `- (Gate ${g.gateNumber}) ${g.feedback.trim()}`);
    if (approvedFeedback.length > 0) {
      sections.push('\n\n# Operator Constraints (from approved gates)\n');
      sections.push(
        'The following directives have been explicitly approved by the operator at prior gates. They are NON-NEGOTIABLE in your output. Your recommendations must align with these constraints, not contradict them. If a constraint conflicts with what your specialist knowledge would otherwise suggest, the operator constraint wins; document the trade-off briefly but do not override it.',
      );
      sections.push('');
      sections.push(...approvedFeedback);
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
