import { LLMProvider } from '../types.js';
import type { StatePersistence } from '../state/state-persistence.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { audit } from '../../../shared/audit.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import { hasFeature } from '../../../core/pricing/index.js';
import { getUsageMeter } from '../../../shared/usage-meter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StressTestVerdict {
  verdict: 'GO' | 'NO-GO' | 'CONDITIONAL';
  confidence: number;
  conditions: string[];
  topRisk: string;
  topStrength: string;
  dimensionRatings: Record<string, string>;
  claimsChecked: number;
  claimsContradicted: number;
}

const DEFAULT_VERDICT: StressTestVerdict = {
  verdict: 'CONDITIONAL',
  confidence: 50,
  conditions: ['Verdict could not be parsed - review the full report manually'],
  topRisk: 'Analysis incomplete',
  topStrength: 'Unknown',
  dimensionRatings: {},
  claimsChecked: 0,
  claimsContradicted: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the verdict JSON block from the final report.
 * Looks for the VERDICT_JSON_START / VERDICT_JSON_END markers.
 */
export function extractVerdictJson(content: string): StressTestVerdict {
  const startMarker = 'VERDICT_JSON_START';
  const endMarker = 'VERDICT_JSON_END';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // Try fallback: look for JSON block with verdict field
    const jsonMatch = content.match(/\{[^{}]*"verdict"\s*:\s*"(?:GO|NO-GO|CONDITIONAL)"[^{}]*\}/s);
    if (jsonMatch) {
      try {
        return parseVerdictJson(jsonMatch[0]);
      } catch {
        return DEFAULT_VERDICT;
      }
    }
    return DEFAULT_VERDICT;
  }

  const jsonStr = content.slice(startIdx + startMarker.length, endIdx).trim();
  try {
    return parseVerdictJson(jsonStr);
  } catch {
    return DEFAULT_VERDICT;
  }
}

function parseVerdictJson(raw: string): StressTestVerdict {
  // Strip markdown code fences if present
  let str = raw.trim();
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(str);

  // Validate required fields
  const verdict = parsed.verdict;
  if (verdict !== 'GO' && verdict !== 'NO-GO' && verdict !== 'CONDITIONAL') {
    throw new Error(`Invalid verdict: ${verdict}`);
  }

  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, parsed.confidence)) : 50;

  return {
    verdict,
    confidence,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    topRisk: typeof parsed.topRisk === 'string' ? parsed.topRisk : 'Not specified',
    topStrength: typeof parsed.topStrength === 'string' ? parsed.topStrength : 'Not specified',
    dimensionRatings: typeof parsed.dimensionRatings === 'object' ? parsed.dimensionRatings : {},
    claimsChecked: typeof parsed.claimsChecked === 'number' ? parsed.claimsChecked : 0,
    claimsContradicted: typeof parsed.claimsContradicted === 'number' ? parsed.claimsContradicted : 0,
  };
}

/**
 * Summarize research artifacts to key findings (first ~200 words each)
 * to manage context window size.
 */
function summarizeArtifacts(artifacts: Array<{ personaName: string; stage: string; content: string }>): string {
  return artifacts
    .map((a) => {
      const words = a.content.split(/\s+/);
      const summary = words.length > 200 ? words.slice(0, 200).join(' ') + '...' : a.content;
      return `### ${a.personaName} (${a.stage})\n${summary}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Extract verifiable claims from the analysis output.
 * Looks for sentences containing numbers, percentages, company names, or market data.
 */
function extractVerifiableClaims(analysisContent: string, prdContent: string): string {
  const claims: string[] = [];

  // Look for the "Claims requiring fact-check" section from Call 1
  const claimsSection = analysisContent.match(/claims requiring fact-check[:\s]*\n([\s\S]*?)(?:\n---|\n##|$)/i);
  if (claimsSection) {
    const lines = claimsSection[1]
      .split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 10);
    claims.push(...lines);
  }

  // If we got fewer than 3 claims from the analysis, extract from PRD
  if (claims.length < 3) {
    const patterns = [
      /\$[\d,.]+\s*(?:billion|million|B|M|K)/gi,
      /\d+%\s+(?:growth|increase|market|share|CAGR)/gi,
      /TAM\s+(?:of\s+)?\$[\d,.]+/gi,
      /SAM\s+(?:of\s+)?\$[\d,.]+/gi,
      /\d+\s+(?:million|billion)\s+users/gi,
    ];

    for (const pattern of patterns) {
      const matches = prdContent.match(pattern);
      if (matches) {
        for (const m of matches) {
          // Get surrounding sentence context
          const idx = prdContent.indexOf(m);
          const start = Math.max(0, prdContent.lastIndexOf('.', idx) + 1);
          const end = prdContent.indexOf('.', idx + m.length);
          const sentence = prdContent.slice(start, end > -1 ? end + 1 : idx + m.length + 50).trim();
          if (sentence.length > 15 && !claims.includes(sentence)) {
            claims.push(sentence);
          }
        }
      }
      if (claims.length >= 10) break;
    }
  }

  return claims.length > 0
    ? claims
        .slice(0, 10)
        .map((c, i) => `${i + 1}. ${c}`)
        .join('\n')
    : 'No specific verifiable claims found in the analysis. Focus on validating the overall market thesis, competitive landscape, and pricing assumptions described in the PRD.';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function prcStressTest(
  persistence: StatePersistence,
  llm: LLMFactory,
  ctx: ContextLoader,
  projectPath: string,
): Promise<string> {
  const stateManager = await persistence.load(projectPath);
  if (!stateManager) {
    throw new Error('Research not initialized. Run prc_start first.');
  }

  const state = stateManager.getState();
  tokenTracker.setProjectPath(projectPath);

  // Guard: Gate 3 must be approved
  if (!stateManager.isGateApproved(3)) {
    throw new Error(
      'Checkpoint 3 must be approved before running the stress test. Complete all research stages and run prc_synthesize first.',
    );
  }

  // Guard: Pro tier required
  const tier = getUsageMeter().getUserTier('operator');
  if (!hasFeature(tier, 'stressTest')) {
    return `The Idea Stress Test is a Pro feature.

This tool runs a deep viability analysis of your product idea - challenging market assumptions, fact-checking with live web data, and producing a GO/NO-GO/CONDITIONAL verdict before you invest in building.

To unlock it, upgrade to Pro ($79/month) or Enterprise.

Your research and PRD are complete and ready to use. You can continue to the build phase with rc_import_prerc.`;
  }

  // Guard: artifacts must exist
  const artifacts = stateManager.getAllArtifacts();
  if (artifacts.length === 0) {
    throw new Error('No research artifacts found. Run all research stages first.');
  }

  // Find the PRD file
  const projectSlug = state.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const prdContent = await persistence.readArtifact(projectPath, `prd-${projectSlug}.md`);
  if (!prdContent) {
    throw new Error('PRD not found. Run prc_synthesize first.');
  }

  // Load knowledge file
  const instructions = await ctx.loadKnowledge('templates/stress-test-instructions.md');

  // Extract section-specific instructions for each call
  const call1Instructions = extractSection(instructions, '## Call 1: Core Viability Analysis', '## Call 2:');
  const call2Instructions = extractSection(instructions, '## Call 2: Web Fact-Check', '## Call 3:');
  const call3Instructions = extractSection(instructions, '## Call 3: Verdict Synthesis', '');

  // Build summarized research context
  const researchSummary = summarizeArtifacts(artifacts);

  let analysisContent: string;
  let factCheckContent: string;
  let finalReport: string;
  let totalTokens = 0;

  try {
    // -----------------------------------------------------------------------
    // Call 1: Core Viability Analysis (Claude)
    // -----------------------------------------------------------------------
    console.error('[prc_stress_test] Running core viability analysis...');
    const claudeClient = llm.getClient(LLMProvider.Claude);

    const call1Prompt = `## Product Brief

**Project:** ${state.brief.name}
${state.brief.rawInput}

## Complexity Classification

Domain: ${state.classification?.domain || 'N/A'}
Product Class: ${state.classification?.productClass || 'N/A'}
Complexity Factors: ${state.classification?.complexityFactors?.join(', ') || 'N/A'}

## Synthesized PRD (19 sections)

${prdContent}

## Research Specialist Summaries (${artifacts.length} specialists)

${researchSummary}

## Your Task

Analyze this product idea using the evaluation framework provided. Be brutally honest. Challenge every assumption. Find every weakness. This entrepreneur needs to know the truth before investing months of their life building this.`;

    const call1Response = await claudeClient.chatWithRetry(
      {
        systemPrompt: call1Instructions,
        messages: [{ role: 'user', content: call1Prompt }],
        temperature: 0.6,
        maxTokens: 8192,
      },
      1,
    );

    analysisContent = call1Response.content;
    totalTokens += call1Response.tokensUsed;

    tokenTracker.record('pre-rc', 'prc_stress_test:analysis', call1Response.tokensUsed, call1Response.provider);
    recordCost({
      pipelineId: 'pre-rc-session',
      domain: 'pre-rc',
      tool: 'prc_stress_test:analysis',
      provider: call1Response.provider,
      model: claudeClient.getModel(),
      inputTokens: 0,
      outputTokens: call1Response.tokensUsed,
    });
    recordModelPerformance({
      provider: call1Response.provider,
      model: claudeClient.getModel(),
      taskType: 'prc-stress-test-analysis',
      tokensUsed: call1Response.tokensUsed,
      success: true,
    });

    console.error(`[prc_stress_test] Core analysis complete: ${call1Response.tokensUsed} tokens`);

    // -----------------------------------------------------------------------
    // Call 2: Web Fact-Check (Perplexity, falls back to Claude)
    // -----------------------------------------------------------------------
    console.error('[prc_stress_test] Running web fact-check...');
    const perplexityClient = llm.getClient(LLMProvider.Perplexity);
    const isWebGrounded = llm.isNativelyAvailable(LLMProvider.Perplexity);

    const verifiableClaims = extractVerifiableClaims(analysisContent, prdContent);

    const call2Prompt = `## Product Being Analyzed

**Project:** ${state.brief.name}
**Product Class:** ${state.classification?.productClass || 'N/A'}

## Claims to Fact-Check

The following claims were identified in the product research and PRD. Verify each one using current data:

${verifiableClaims}

## Additional Context

If any claims reference specific competitors, market sizes, industry growth rates, or pricing benchmarks, independently verify those as well.

Produce your analysis following the output format in your instructions.`;

    const call2Response = await perplexityClient.chatWithRetry(
      {
        systemPrompt: call2Instructions,
        messages: [{ role: 'user', content: call2Prompt }],
        temperature: 0.3,
        maxTokens: 4096,
        searchOptions: {
          returnCitations: true,
          recencyFilter: 'month',
        },
      },
      1,
    );

    factCheckContent = call2Response.content;
    totalTokens += call2Response.tokensUsed;

    tokenTracker.record('pre-rc', 'prc_stress_test:factcheck', call2Response.tokensUsed, call2Response.provider);
    recordCost({
      pipelineId: 'pre-rc-session',
      domain: 'pre-rc',
      tool: 'prc_stress_test:factcheck',
      provider: call2Response.provider,
      model: perplexityClient.getModel(),
      inputTokens: 0,
      outputTokens: call2Response.tokensUsed,
    });
    recordModelPerformance({
      provider: call2Response.provider,
      model: perplexityClient.getModel(),
      taskType: 'prc-stress-test-factcheck',
      tokensUsed: call2Response.tokensUsed,
      success: true,
    });

    console.error(
      `[prc_stress_test] Fact-check complete: ${call2Response.tokensUsed} tokens (web-grounded: ${isWebGrounded})`,
    );

    // -----------------------------------------------------------------------
    // Call 3: Verdict Synthesis (Claude)
    // -----------------------------------------------------------------------
    console.error('[prc_stress_test] Synthesizing final verdict...');

    const call3Prompt = `## Product Brief

**Project:** ${state.brief.name}
${state.brief.rawInput}

## Core Viability Analysis

${analysisContent}

## Fact-Check Results ${isWebGrounded ? '(verified with live web data)' : '(based on available data - no live web search)'}

${factCheckContent}

## Your Task

Synthesize the analysis and fact-check results into a final verdict report. Follow the output format exactly, including the VERDICT_JSON_START/VERDICT_JSON_END markers for the verdict JSON block.

Be decisive. The entrepreneur needs a clear answer: should they build this or not?`;

    const call3Response = await claudeClient.chatWithRetry(
      {
        systemPrompt: call3Instructions,
        messages: [{ role: 'user', content: call3Prompt }],
        temperature: 0.4,
        maxTokens: 6144,
      },
      1,
    );

    finalReport = call3Response.content;
    totalTokens += call3Response.tokensUsed;

    tokenTracker.record('pre-rc', 'prc_stress_test:verdict', call3Response.tokensUsed, call3Response.provider);
    recordCost({
      pipelineId: 'pre-rc-session',
      domain: 'pre-rc',
      tool: 'prc_stress_test:verdict',
      provider: call3Response.provider,
      model: claudeClient.getModel(),
      inputTokens: 0,
      outputTokens: call3Response.tokensUsed,
    });
    recordModelPerformance({
      provider: call3Response.provider,
      model: claudeClient.getModel(),
      taskType: 'prc-stress-test-verdict',
      tokensUsed: call3Response.tokensUsed,
      success: true,
    });

    console.error(`[prc_stress_test] Verdict synthesis complete: ${call3Response.tokensUsed} tokens`);
  } catch (err) {
    // Passthrough fallback
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[prc_stress_test] PASSTHROUGH TRIGGERED - Analysis failed: ${errMsg}`);

    return `## Idea Stress Test - Manual Mode

> **Why manual mode?** Automatic analysis failed: ${errMsg}

Please run this analysis manually using any AI tool. Copy the prompt below, paste into Claude, ChatGPT, or another AI, and paste the results back.

### Prompt

You are a brutally honest VC analyst evaluating a product idea. Read the PRD below and analyze it across 6 dimensions: Market Viability, Business Model Sustainability, Technical Risk, Execution Risk, User/Demand Risk, and Differentiation.

For each dimension, rate it Critical/High/Medium/Low and explain your reasoning. Then give a final GO/NO-GO/CONDITIONAL verdict with a confidence percentage.

### PRD Content

${prdContent}

Save the results to: pre-rc-research/stress-test-${projectSlug}.md`;
  }

  // -----------------------------------------------------------------------
  // Extract verdict and save
  // -----------------------------------------------------------------------
  const verdict = extractVerdictJson(finalReport);

  // Save the full report
  const reportPath = `stress-test-${projectSlug}.md`;
  await persistence.writeArtifact(projectPath, reportPath, finalReport);

  // Update state with verdict
  const updatedState = stateManager.getState();
  updatedState._stressTestVerdict = verdict.verdict;
  updatedState._stressTestConfidence = verdict.confidence;
  await persistence.save(updatedState);

  // Audit
  audit('artifact.create', 'pre-rc', projectPath, { type: 'stress-test', verdict: verdict.verdict }, 'stress-test');

  console.error(`[prc_stress_test] Complete: ${verdict.verdict} (${verdict.confidence}%), ${totalTokens} total tokens`);

  // Estimate cost
  const estimatedCost = (totalTokens / 1000) * 0.008;

  // -----------------------------------------------------------------------
  // Return user-facing summary
  // -----------------------------------------------------------------------
  const criticalCount = Object.values(verdict.dimensionRatings).filter((r) => r === 'Critical').length;
  const highCount = Object.values(verdict.dimensionRatings).filter((r) => r === 'High').length;

  let verdictEmoji: string;
  let verdictAdvice: string;

  if (verdict.verdict === 'GO') {
    verdictEmoji = 'PASS';
    verdictAdvice = `Your product idea passed the stress test. Risks exist but are manageable.\n\nReady to proceed to the build phase?\n- **Continue to build** - proceed to architecture and task planning\n- **Review the full report** - see the detailed analysis in pre-rc-research/${reportPath}`;
  } else if (verdict.verdict === 'CONDITIONAL') {
    const conditionsList = verdict.conditions.map((c, i) => `${i + 1}. ${c}`).join('\n');
    verdictEmoji = 'CONDITIONAL';
    verdictAdvice = `Your product idea has potential, but these conditions must be addressed:\n\n${conditionsList}\n\nYou can:\n- **Proceed anyway** - build as designed and address conditions during development\n- **Adjust scope** - revise the requirements document to address conditions, then re-run\n- **Explore alternatives** - discuss the suggested alternative approaches`;
  } else {
    verdictEmoji = 'NO-GO';
    verdictAdvice = `The analysis found fundamental issues with the product idea as designed. This does not mean the core idea is worthless - it means the current approach needs rethinking.\n\nYou can:\n- **Pivot** - revise the idea based on the analysis and start a new research cycle\n- **Proceed anyway** - build despite the warning (not recommended)\n- **Stop here** - use the stress test report as input for future planning`;
  }

  return `**Idea Stress Test: ${verdictEmoji}** (Confidence: ${verdict.confidence}%)

**Top risk:** ${verdict.topRisk}
**Top strength:** ${verdict.topStrength}
${criticalCount > 0 ? `**Critical issues:** ${criticalCount} dimension(s) rated Critical` : ''}${highCount > 0 ? `\n**High-risk areas:** ${highCount} dimension(s) rated High` : ''}
${verdict.claimsChecked > 0 ? `**Claims fact-checked:** ${verdict.claimsChecked} (${verdict.claimsContradicted} contradicted)` : ''}

AI usage: ~${totalTokens.toLocaleString()} units (estimated cost: ~$${estimatedCost.toFixed(2)})
Full report saved to: pre-rc-research/${reportPath}

${verdictAdvice}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a section from the knowledge file between two headings.
 */
function extractSection(content: string, startHeading: string, endHeading: string): string {
  const startIdx = content.indexOf(startHeading);
  if (startIdx === -1) return content; // Return full content if section not found

  const endIdx = endHeading ? content.indexOf(endHeading, startIdx + startHeading.length) : -1;
  return endIdx > startIdx ? content.slice(startIdx, endIdx).trim() : content.slice(startIdx).trim();
}
