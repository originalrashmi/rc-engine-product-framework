import type { z } from 'zod';
import type { PostRCObservabilitySpecInputSchema } from '../types.js';
import { hasAnthropicKey, resolveFromRoot } from '../../../shared/config.js';
import { llmFactory } from '../../../shared/llm/factory.js';
import { LLMProvider } from '../../../shared/types.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

type ObsSpecInput = z.infer<typeof PostRCObservabilitySpecInputSchema>;

/**
 * Pre-flight tool: Generates an observability requirements spec from the PRD.
 *
 * This is the "Pattern A" tool - it runs BEFORE RC Method, analyzing the PRD
 * to produce a companion document that the operator feeds into rc_define.
 *
 * The spec covers:
 * - Error tracking requirements per feature
 * - User behavior analytics plan
 * - System health metrics and SLOs
 * - Dashboard and alert specifications
 * - AI-specific monitoring (if applicable)
 */
export async function postrcObservabilitySpec(args: ObsSpecInput): Promise<string> {
  const { project_path, prd_content } = args;

  // Load PRD content from provided input or from project directories
  const prd = prd_content || (await findAndLoadPrd(project_path));

  if (!prd) {
    return `
===============================================
  POST-RC METHOD: NO PRD FOUND
===============================================

  Could not find a PRD to analyze. Provide one of:
    1. prd_content parameter with the PRD text
    2. PRD file in rc-method/prds/
    3. PRD file in pre-rc-research/

  Run Pre-RC Method first to generate a PRD,
  then re-run this tool.
===============================================`;
  }

  // Load monitoring knowledge using shared resolveFromRoot
  const knowledgePath = resolveFromRoot('knowledge', 'post-rc');
  const monitoringKnowledge = await loadKnowledge(join(knowledgePath, 'monitoring', 'monitoring-readiness.md'));
  const observabilityTemplate = await loadKnowledge(
    join(knowledgePath, 'monitoring', 'observability-spec-template.md'),
  );

  if (hasAnthropicKey) {
    return await generateAutonomousSpec(project_path, prd, monitoringKnowledge, observabilityTemplate);
  } else {
    return generatePassthroughSpec(project_path, prd, monitoringKnowledge, observabilityTemplate);
  }
}

async function generateAutonomousSpec(
  projectPath: string,
  prd: string,
  knowledge: string,
  template: string,
): Promise<string> {
  try {
    const client = llmFactory.getClient(LLMProvider.Claude);
    const prompt = buildSpecPrompt(prd, knowledge, template);

    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    tokenTracker.record('post-rc', 'postrc_generate_observability_spec', response.tokensUsed, response.provider, { inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    recordCost({
      pipelineId: 'postrc-session',
      domain: 'post-rc',
      tool: 'postrc_generate_observability_spec',
      provider: response.provider,
      model: client.getModel(),
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? response.tokensUsed,
    });
    recordModelPerformance({
      provider: response.provider,
      model: client.getModel(),
      taskType: 'postrc-observability-spec',
      tokensUsed: response.tokensUsed,
      success: true,
    });

    const specContent = response.content;

    // Save the spec
    const specPath = await saveSpec(projectPath, specContent);

    return `
===============================================
  POST-RC METHOD: OBSERVABILITY SPEC GENERATED
===============================================

  Analyzed PRD and generated observability requirements.

  SAVED TO: ${specPath}

  NEXT STEPS:
    1. Review the spec below
    2. Feed it into RC Method alongside your PRD:
       → When running rc_define, include this spec as
         additional context for the operator_inputs

  This spec is a COMPANION document to the PRD.
  It does NOT modify the PRD - it supplements it.

===============================================

${specContent}`;
  } catch (err) {
    console.error('[post-rc] Observability spec generation failed:', err);
    return generatePassthroughSpec(projectPath, prd, knowledge, template);
  }
}

function generatePassthroughSpec(projectPath: string, prd: string, knowledge: string, template: string): string {
  const prompt = buildSpecPrompt(prd, knowledge, template);

  return `
===============================================
  POST-RC METHOD: OBSERVABILITY SPEC (PASSTHROUGH)
===============================================

  No API key configured. The spec generation prompt has been
  assembled below. Feed this to your LLM to generate the spec.

  After generation, save the output to:
    ${projectPath}/post-rc/specs/OBSERVABILITY-SPEC.md

  Then feed it into RC Method alongside your PRD.

===============================================

${prompt}`;
}

function buildSpecPrompt(prd: string, knowledge: string, template: string): string {
  return `You are an observability architect. Analyze the following PRD and generate a comprehensive observability requirements specification.

## Your Task

Read the PRD below and produce an OBSERVABILITY-SPEC document that covers:

1. **Error Tracking Plan** - For each feature/API endpoint in the PRD, specify:
   - What errors to capture
   - What context to include (user ID, request ID, environment)
   - Recommended tool (Sentry, Datadog, etc.)

2. **User Behavior Analytics Plan** - For each user-facing feature:
   - Key events to track (e.g., "user.signup.started", "user.signup.completed")
   - Funnel definition (entry → action → completion)
   - Session recording requirements (which flows need recordings)
   - Recommended tool (PostHog, Hotjar, FullStory, etc.)

3. **System Health Metrics** - For each API/service:
   - Latency SLO (P50, P95, P99 targets)
   - Availability SLO (target %)
   - Error rate SLO (target %)
   - Throughput expectations

4. **Dashboard Specification** - What dashboards are needed:
   - Operations dashboard (golden signals: latency, traffic, errors, saturation)
   - Product dashboard (feature adoption, funnel conversion, retention)
   - Business dashboard (revenue metrics, if applicable)

5. **Alert Configuration** - What alerts to set up:
   - Critical alerts (page the on-call): what thresholds?
   - Warning alerts (Slack notification): what thresholds?
   - Escalation path

6. **Instrumentation Tasks** - Concrete build tasks:
   - SDK integrations needed
   - Event schemas to define
   - Dashboard configurations to create
   - Alert rules to set up

## Output Format

Produce the spec as a markdown document with the structure above.
Use concrete, specific recommendations - not generic advice.
Reference actual tools and event names.

${knowledge ? `## Monitoring Knowledge Reference\n${knowledge}\n` : ''}
${template ? `## Spec Template\n${template}\n` : ''}

## PRD to Analyze

${prd.slice(0, 40000)}

Generate the OBSERVABILITY-SPEC now. Output ONLY the markdown document.`;
}

async function saveSpec(projectPath: string, content: string): Promise<string> {
  const specsDir = join(projectPath, 'post-rc', 'specs');
  await mkdir(specsDir, { recursive: true });
  const specPath = join(specsDir, 'OBSERVABILITY-SPEC.md');
  await writeFile(specPath, content, 'utf-8');
  return 'post-rc/specs/OBSERVABILITY-SPEC.md';
}

async function findAndLoadPrd(projectPath: string): Promise<string | null> {
  // Try rc-method/prds/ first (RC Method output)
  const rcPrdsDir = join(projectPath, 'rc-method', 'prds');
  const prdFromRc = await loadFirstPrd(rcPrdsDir);
  if (prdFromRc) return prdFromRc;

  // Try pre-rc-research/ (Pre-RC Method output)
  const preRcDir = join(projectPath, 'pre-rc-research');
  const prdFromPreRc = await loadFirstPrd(preRcDir, 'prd-');
  if (prdFromPreRc) return prdFromPreRc;

  // Try tasks/ (Pre-RC copies PRDs here too)
  const tasksDir = join(projectPath, 'tasks');
  const prdFromTasks = await loadFirstPrd(tasksDir, 'prd-');
  if (prdFromTasks) return prdFromTasks;

  return null;
}

async function loadFirstPrd(dir: string, prefix: string = 'PRD-'): Promise<string | null> {
  if (!existsSync(dir)) return null;
  try {
    const files = await readdir(dir);
    const prdFile = files.find((f) => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.endsWith('.md'));
    if (!prdFile) return null;
    return await readFile(join(dir, prdFile), 'utf-8');
  } catch {
    return null;
  }
}

async function loadKnowledge(path: string): Promise<string> {
  if (!existsSync(path)) return '';
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}
