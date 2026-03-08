import type { ComplexityClassification, ProductBrief } from './types.js';
import { ComplexityDomain, LLMProvider } from './types.js';
import type { LLMFactory } from '../../shared/llm/factory.js';
import { tokenTracker } from '../../shared/token-tracker.js';
import { recordCost } from '../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../shared/learning.js';
import type { ContextLoader } from './context-loader.js';

export class ComplexityClassifier {
  private llm: LLMFactory;
  private ctx: ContextLoader;

  constructor(llm: LLMFactory, ctx: ContextLoader) {
    this.llm = llm;
    this.ctx = ctx;
  }

  async classify(brief: ProductBrief): Promise<ComplexityClassification> {
    const knowledge = await this.ctx.loadKnowledge('complexity-framework.md');
    const client = this.llm.getClient(LLMProvider.Gemini);

    console.error(
      `[ComplexityClassifier] Classifying with ${client.getProvider()} (${client.getModel()}) - with retry`,
    );
    const response = await client.chatWithRetry(
      {
        systemPrompt: knowledge,
        messages: [
          {
            role: 'user',
            content: this.buildPrompt(brief),
          },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      },
      1,
    );

    console.error(`[ComplexityClassifier] Classification complete: ${response.tokensUsed} tokens`);
    tokenTracker.record('pre-rc', 'prc_classify', response.tokensUsed, response.provider);
    recordCost({
      pipelineId: 'pre-rc-session',
      domain: 'pre-rc',
      tool: 'prc_classify',
      provider: response.provider,
      model: client.getModel(),
      inputTokens: 0,
      outputTokens: response.tokensUsed,
    });
    recordModelPerformance({
      provider: response.provider,
      model: client.getModel(),
      taskType: 'prc-classify',
      tokensUsed: response.tokensUsed,
      success: true,
    });
    return this.parseResponse(response.content);
  }

  /**
   * Build a passthrough prompt (for when no API keys are configured).
   */
  async buildPassthroughPrompt(brief: ProductBrief): Promise<string> {
    const knowledge = await this.ctx.loadKnowledge('complexity-framework.md');
    return `${knowledge}\n\n---\n\n${this.buildPrompt(brief)}\n\n---\n\nReturn your analysis as JSON matching this schema:\n\`\`\`json\n{\n  "domain": "clear|complicated|complex|chaotic",\n  "confidence": 0.0-1.0,\n  "reasoning": "2-3 sentences",\n  "productClass": "e.g. enterprise infrastructure, consumer agent",\n  "complexityFactors": ["factor1", "factor2"]\n}\n\`\`\``;
  }

  private buildPrompt(brief: ProductBrief): string {
    return `# Product Brief to Classify

**Project:** ${brief.name}
**Description:** ${brief.description}

**Full Input:**
${brief.rawInput}

# Task

Classify this product's complexity. Determine which domain it falls into:

- **Clear** (known knowns): Standard patterns apply. Example: simple CRUD app, static website.
- **Complicated** (known unknowns): Expert analysis required. Example: enterprise integration, complex API.
- **Complex** (unknown unknowns): Emergent, novel. Example: AI-native product, new market category.
- **Chaotic** (crisis): Stabilize first. Example: urgent pivot, competitive emergency.

Also identify:
- **Product class** (2-3 words): e.g., "enterprise SaaS", "consumer mobile app", "AI developer tool"
- **Complexity factors**: What makes this product non-trivial?

Return JSON:
\`\`\`json
{
  "domain": "clear|complicated|complex|chaotic",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences explaining the classification",
  "productClass": "brief product category",
  "complexityFactors": ["factor 1", "factor 2", "factor 3"]
}
\`\`\``;
  }

  private parseResponse(content: string): ComplexityClassification {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr.trim());
      return {
        domain: parsed.domain as ComplexityDomain,
        confidence: Number(parsed.confidence) || 0.5,
        reasoning: String(parsed.reasoning || ''),
        productClass: String(parsed.productClass || 'unknown'),
        complexityFactors: Array.isArray(parsed.complexityFactors) ? parsed.complexityFactors : [],
      };
    } catch {
      // If JSON parsing fails, attempt a best-effort extraction
      const domain = this.extractDomain(content);
      return {
        domain,
        confidence: 0.3,
        reasoning: 'Auto-extracted from non-JSON response: ' + content.slice(0, 200),
        productClass: 'unknown',
        complexityFactors: [],
      };
    }
  }

  private extractDomain(text: string): ComplexityDomain {
    const lower = text.toLowerCase();
    if (lower.includes('chaotic')) return ComplexityDomain.Chaotic;
    if (lower.includes('complex') && !lower.includes('complicated')) return ComplexityDomain.Complex;
    if (lower.includes('complicated')) return ComplexityDomain.Complicated;
    return ComplexityDomain.Clear;
  }
}
