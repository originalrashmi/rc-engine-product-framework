import type { ComplexityClassification, PersonaConfig, PersonaSelection } from './types.js';
import { ComplexityDomain, PersonaId, ResearchStage, LLMProvider } from './types.js';

/**
 * Adaptive persona selection engine.
 * Determines which of the 20 personas to activate based on complexity classification.
 */
export class PersonaSelector {
  private configs: PersonaConfig[];

  constructor() {
    this.configs = buildPersonaRegistry();
  }

  /**
   * Select which personas to activate based on complexity classification.
   */
  select(classification: ComplexityClassification): PersonaSelection {
    const active: PersonaId[] = [];
    const skipped: Array<{ id: PersonaId; reason: string }> = [];

    for (const config of this.configs) {
      if (config.alwaysRuns) {
        active.push(config.id);
        continue;
      }

      const shouldActivate = this.evaluateConditions(config, classification);
      if (shouldActivate) {
        active.push(config.id);
      } else {
        skipped.push({
          id: config.id,
          reason: this.skipReason(config, classification),
        });
      }
    }

    return {
      activePersonas: active,
      skippedPersonas: skipped,
      totalActive: active.length,
      totalSkipped: skipped.length,
    };
  }

  getConfig(id: PersonaId): PersonaConfig | undefined {
    return this.configs.find((c) => c.id === id);
  }

  getConfigsByStage(stage: ResearchStage): PersonaConfig[] {
    return this.configs.filter((c) => c.stage === stage);
  }

  getAllConfigs(): PersonaConfig[] {
    return this.configs;
  }

  // ---------------------------------------------------------------------------

  private evaluateConditions(config: PersonaConfig, classification: ComplexityClassification): boolean {
    for (const cond of config.activationConditions) {
      if (cond.type === 'always') return true;

      if (cond.type === 'complexity') {
        if (cond.values.includes(classification.domain)) return true;
      }

      if (cond.type === 'product-class') {
        const pc = classification.productClass.toLowerCase();
        const factors = classification.complexityFactors.map((f) => f.toLowerCase()).join(' ');
        const haystack = `${pc} ${factors}`;
        if (cond.values.some((v) => haystack.includes(v.toLowerCase()))) return true;
      }
    }
    return false;
  }

  private skipReason(config: PersonaConfig, classification: ComplexityClassification): string {
    const conditions = config.activationConditions.map((c) => {
      if (c.type === 'complexity') return `requires complexity domain: ${c.values.join('/')}`;
      if (c.type === 'product-class') return `requires product class: ${c.values.join('/')}`;
      return 'unknown condition';
    });
    return `Skipped: ${conditions.join(' OR ')}. Current: ${classification.domain}, ${classification.productClass}`;
  }
}

// =============================================================================
// PERSONA REGISTRY - All 20 personas with their activation rules
// =============================================================================

function buildPersonaRegistry(): PersonaConfig[] {
  return [
    // - Stage 1: Meta-Orchestration (ALWAYS) --
    {
      id: PersonaId.MetaProductArchitect,
      name: 'Meta Product Architect',
      stage: ResearchStage.MetaOrchestration,
      llmProvider: LLMProvider.Gemini,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 2048,
      knowledgeFile: 'personas/meta-product-architect.md',
    },
    {
      id: PersonaId.ResearchProgramDirector,
      name: 'Research Program Director',
      stage: ResearchStage.MetaOrchestration,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 2048,
      knowledgeFile: 'personas/research-program-director.md',
    },
    {
      id: PersonaId.TokenEconomicsOptimizer,
      name: 'Token Economics Optimizer',
      stage: ResearchStage.MetaOrchestration,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 1024,
      knowledgeFile: 'personas/token-economics-optimizer.md',
    },

    // - Stage 2: User Intelligence --
    {
      id: PersonaId.PrimaryUserArchetype,
      name: 'Primary User Archetype Researcher',
      stage: ResearchStage.UserIntelligence,
      llmProvider: LLMProvider.Gemini,
      alwaysRuns: false,
      activationConditions: [
        {
          type: 'complexity',
          values: [
            ComplexityDomain.Clear,
            ComplexityDomain.Complicated,
            ComplexityDomain.Complex,
            ComplexityDomain.Chaotic,
          ],
        },
      ],
      tokenBudget: 4096,
      knowledgeFile: 'personas/primary-user-archetype.md',
    },
    {
      id: PersonaId.SecondaryEdgeUser,
      name: 'Secondary & Edge User Analyst',
      stage: ResearchStage.UserIntelligence,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: false,
      activationConditions: [
        { type: 'complexity', values: [ComplexityDomain.Complex, ComplexityDomain.Chaotic] },
        { type: 'product-class', values: ['enterprise', 'security', 'compliance', 'healthcare', 'finance'] },
      ],
      tokenBudget: 3072,
      knowledgeFile: 'personas/secondary-edge-user.md',
    },
    {
      id: PersonaId.DemandSideTheorist,
      name: 'Demand-Side Research Theorist',
      stage: ResearchStage.UserIntelligence,
      llmProvider: LLMProvider.Gemini,
      alwaysRuns: false,
      activationConditions: [
        {
          type: 'complexity',
          values: [ComplexityDomain.Complicated, ComplexityDomain.Complex, ComplexityDomain.Chaotic],
        },
      ],
      tokenBudget: 3072,
      knowledgeFile: 'personas/demand-side-theorist.md',
    },
    {
      id: PersonaId.AccessibilityAdvocate,
      name: 'Accessibility & Inclusive Design Advocate',
      stage: ResearchStage.UserIntelligence,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: false,
      activationConditions: [
        { type: 'product-class', values: ['consumer', 'public', 'education', 'healthcare', 'ui', 'web', 'mobile'] },
      ],
      tokenBudget: 2048,
      knowledgeFile: 'personas/accessibility-advocate.md',
    },

    // - Stage 3: Business & Market (all web-grounded for real data) --
    {
      id: PersonaId.MarketLandscapeAnalyst,
      name: 'Market Landscape & Competitive Intelligence Analyst',
      stage: ResearchStage.BusinessMarket,
      llmProvider: LLMProvider.Perplexity,
      alwaysRuns: false,
      activationConditions: [
        { type: 'complexity', values: [ComplexityDomain.Complicated, ComplexityDomain.Complex] },
        { type: 'product-class', values: ['commercial', 'b2b', 'b2c', 'saas', 'startup', 'marketplace'] },
      ],
      tokenBudget: 4096,
      knowledgeFile: 'personas/market-landscape-analyst.md',
      webGrounded: true,
    },
    {
      id: PersonaId.BusinessModelStrategist,
      name: 'Business Model Strategist',
      stage: ResearchStage.BusinessMarket,
      llmProvider: LLMProvider.Perplexity,
      alwaysRuns: false,
      activationConditions: [
        { type: 'product-class', values: ['commercial', 'startup', 'saas', 'marketplace', 'platform'] },
      ],
      tokenBudget: 3072,
      knowledgeFile: 'personas/business-model-strategist.md',
      webGrounded: true,
    },
    {
      id: PersonaId.GTMStrategist,
      name: 'Go-To-Market Strategist',
      stage: ResearchStage.BusinessMarket,
      llmProvider: LLMProvider.Perplexity,
      alwaysRuns: false,
      activationConditions: [{ type: 'product-class', values: ['commercial', 'launch', 'mvp', 'startup', 'b2c'] }],
      tokenBudget: 3072,
      knowledgeFile: 'personas/gtm-strategist.md',
      webGrounded: true,
    },

    // - Stage 4: Technical --
    {
      id: PersonaId.SystemsArchitect,
      name: 'Systems Architect',
      stage: ResearchStage.Technical,
      llmProvider: LLMProvider.Gemini,
      alwaysRuns: false,
      activationConditions: [
        {
          type: 'complexity',
          values: [ComplexityDomain.Complicated, ComplexityDomain.Complex, ComplexityDomain.Chaotic],
        },
      ],
      tokenBudget: 4096,
      knowledgeFile: 'personas/systems-architect.md',
    },
    {
      id: PersonaId.AIMLSpecialist,
      name: 'AI/ML Systems Specialist',
      stage: ResearchStage.Technical,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: false,
      activationConditions: [
        { type: 'product-class', values: ['ai', 'ml', 'agent', 'llm', 'nlp', 'chatbot', 'generative'] },
      ],
      tokenBudget: 4096,
      knowledgeFile: 'personas/ai-ml-specialist.md',
    },
    {
      id: PersonaId.DataTelemetryStrategist,
      name: 'Data & Telemetry Strategist',
      stage: ResearchStage.Technical,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: false,
      activationConditions: [{ type: 'complexity', values: [ComplexityDomain.Complicated, ComplexityDomain.Complex] }],
      tokenBudget: 3072,
      knowledgeFile: 'personas/data-telemetry-strategist.md',
    },
    {
      id: PersonaId.SecurityComplianceAnalyst,
      name: 'Security, Privacy & Compliance Analyst',
      stage: ResearchStage.Technical,
      llmProvider: LLMProvider.Perplexity,
      alwaysRuns: false,
      activationConditions: [
        { type: 'product-class', values: ['enterprise', 'healthcare', 'finance', 'compliance', 'security', 'saas'] },
      ],
      tokenBudget: 3072,
      knowledgeFile: 'personas/security-compliance-analyst.md',
      webGrounded: true,
    },

    // - Stage 5: UX & Cognitive --
    {
      id: PersonaId.UXSystemsDesigner,
      name: 'UX Systems Designer',
      stage: ResearchStage.UXCognitive,
      llmProvider: LLMProvider.OpenAI,
      alwaysRuns: false,
      activationConditions: [
        { type: 'product-class', values: ['consumer', 'ui', 'web', 'mobile', 'dashboard', 'portal'] },
      ],
      tokenBudget: 4096,
      knowledgeFile: 'personas/ux-systems-designer.md',
    },
    {
      id: PersonaId.CognitiveLoadAnalyst,
      name: 'Cognitive Load & Behavioral Psychology Analyst',
      stage: ResearchStage.UXCognitive,
      llmProvider: LLMProvider.Gemini,
      alwaysRuns: false,
      activationConditions: [
        { type: 'complexity', values: [ComplexityDomain.Complex] },
        { type: 'product-class', values: ['consumer', 'complex-ui', 'dashboard'] },
      ],
      tokenBudget: 3072,
      knowledgeFile: 'personas/cognitive-load-analyst.md',
    },
    {
      id: PersonaId.ContentLanguageStrategist,
      name: 'Content & Language Strategist',
      stage: ResearchStage.UXCognitive,
      llmProvider: LLMProvider.OpenAI,
      alwaysRuns: false,
      activationConditions: [{ type: 'product-class', values: ['ai', 'agent', 'developer', 'tool', 'cli'] }],
      tokenBudget: 2048,
      knowledgeFile: 'personas/content-language-strategist.md',
    },

    // - Stage 6: Validation (ALWAYS) --
    {
      id: PersonaId.PersonaCoverageAuditor,
      name: 'Persona Coverage Auditor',
      stage: ResearchStage.Validation,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 3072,
      knowledgeFile: 'personas/persona-coverage-auditor.md',
    },
    {
      id: PersonaId.ResearchSynthesisSpecialist,
      name: 'Research Synthesis & Compression Specialist',
      stage: ResearchStage.Validation,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 4096,
      knowledgeFile: 'personas/research-synthesis-specialist.md',
    },
    {
      id: PersonaId.PRDTranslationSpecialist,
      name: 'PRD Translation Specialist',
      stage: ResearchStage.Validation,
      llmProvider: LLMProvider.Claude,
      alwaysRuns: true,
      activationConditions: [{ type: 'always', values: [] }],
      tokenBudget: 4096,
      knowledgeFile: 'personas/prd-translation-specialist.md',
    },
  ];
}
