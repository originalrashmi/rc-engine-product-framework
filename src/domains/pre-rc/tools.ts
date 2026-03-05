import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  PrcStartSchema,
  PrcClassifySchema,
  PrcGateSchema,
  PrcRunStageSchema,
  PrcStatusSchema,
  PrcSynthesizeSchema,
  PrcStressTestSchema,
} from './types.js';
import { StatePersistence } from './state/state-persistence.js';
import { ComplexityClassifier } from './complexity-classifier.js';
import { PersonaSelector } from './persona-selector.js';
import { AgentFactory } from './agents/agent-factory.js';
import { ContextLoader } from './context-loader.js';
import { llmFactory } from '../../shared/llm/factory.js';

import { prcStart } from './tools/prc-start.js';
import { prcClassify } from './tools/prc-classify.js';
import { prcGate } from './tools/prc-gate.js';
import { prcRunStage } from './tools/prc-run-stage.js';
import { prcStatus } from './tools/prc-status.js';
import { prcSynthesize } from './tools/prc-synthesize.js';
import { prcStressTest } from './tools/prc-stress-test.js';
import type { PreRcDependencies } from './tools/prc-coordinator-factory.js';

/**
 * Register all 7 Pre-RC domain tools on the MCP server.
 *
 * Shared infrastructure (LLMFactory, ContextLoader, etc.) is instantiated
 * once here and reused across all tool invocations.
 */
export function registerPreRcTools(server: McpServer): void {
  // Shared instances - created once, reused across all tool calls
  const persistence = new StatePersistence();
  // llmFactory is the shared singleton from shared/llm/factory.ts
  const ctx = new ContextLoader();
  const classifier = new ComplexityClassifier(llmFactory, ctx);
  const selector = new PersonaSelector();
  const agentFactory = new AgentFactory(llmFactory, ctx);

  // Dependencies bundle for coordinator factory
  const coordDeps: PreRcDependencies = {
    persistence,
    classifier,
    selector,
    agentFactory,
    llmFactory,
    contextLoader: ctx,
  };

  // ─── prc_start ─────────────────────────────────────────────────────
  server.tool(
    'prc_start',
    'FIRST STEP of Pre-RC research. Call when the user describes a product idea and you want deep research before building. Creates the pre-rc-research/ directory and initializes project state. Prerequisites: none — this is the entry point. After success: MUST call prc_classify next. Never skip to prc_run_stage without classifying first.',
    PrcStartSchema.shape,
    {
      title: 'Start Pre-RC Research',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (args) => {
      try {
        const result = await prcStart(persistence, args.project_path, args.project_name, args.brief);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_classify ──────────────────────────────────────────────────
  server.tool(
    'prc_classify',
    'Call AFTER prc_start. Classifies the product idea using Cynefin framework (Clear/Complicated/Complex/Chaotic) and activates the appropriate subset of 20 research specialists. Returns: complexity domain, activated specialist list, estimated cost budget, and which stages to run. After success: present the classification to the user as Checkpoint 1 -- call prc_gate with their decision. Read-only analysis, no side effects beyond state update.',
    PrcClassifySchema.shape,
    {
      title: 'Classify Complexity',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => {
      try {
        const result = await prcClassify(
          persistence,
          classifier,
          selector,
          llmFactory,
          args.project_path,
          ctx,
          agentFactory,
        );
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_gate ──────────────────────────────────────────────────────
  server.tool(
    'prc_gate',
    'Submit a checkpoint decision for the current Pre-RC research stage. NEVER call without presenting the checkpoint context to the user first and getting their explicit decision. Three checkpoints exist: Checkpoint 1 (after classify -- is research scope right?), Checkpoint 2 (after stages 1-4 -- is research accurate?), Checkpoint 3 (after all stages -- ready to build?). Valid decisions: "approve" to proceed, "reject" with feedback to revise, "question" to pause for clarification. After approve: proceed to next stage or prc_synthesize (after Checkpoint 3). After reject: re-run the relevant stage with user feedback.',
    PrcGateSchema.shape,
    {
      title: 'Pre-RC Checkpoint Decision',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (args) => {
      try {
        const result = await prcGate(persistence, args.project_path, args.decision, args.feedback, coordDeps);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_run_stage ─────────────────────────────────────────────────
  server.tool(
    'prc_run_stage',
    'Re-run a specific research stage. In normal flow, stages execute automatically when you approve a checkpoint via prc_gate. Use this tool ONLY to re-run a failed or incomplete stage. Valid stages: "stage-1-meta", "stage-2-user-intelligence", "stage-3-business-market" (uses web search), "stage-4-technical", "stage-5-ux-cognitive", "stage-6-validation". Prerequisites: prc_classify must be complete and relevant checkpoints approved. Returns research specialist results with success/failure markers.',
    PrcRunStageSchema.shape,
    {
      title: 'Run Research Stage',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => {
      try {
        const result = await prcRunStage(coordDeps, args.project_path, args.stage);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_status ────────────────────────────────────────────────────
  server.tool(
    'prc_status',
    'Check Pre-RC research progress. Read-only, safe to call anytime. Returns: current stage, completed stages, gate statuses, persona results, token usage. Use this to orient yourself when resuming a session or when the user asks "where are we?" Call this BEFORE deciding which prc_ tool to call next if you are unsure of the current state.',
    PrcStatusSchema.shape,
    { title: 'Pre-RC Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => {
      try {
        const result = await prcStatus(persistence, args.project_path);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_synthesize ────────────────────────────────────────────────
  server.tool(
    'prc_synthesize',
    'FINAL STEP of Pre-RC. Call ONLY after Gate 3 is approved (all 6 stages complete). Synthesizes all persona research into deliverables: 19-section PRD (markdown), HTML consulting deck, task list, DOCX document, and research index. LONG-RUNNING: involves multiple LLM calls for synthesis. Set include_task_deck=true to also generate a visual task breakdown deck. After success: present deliverables to user. To continue into RC Method, call rc_import_prerc. This is a natural stopping point — user may choose to stop here with just the PRD.',
    PrcSynthesizeSchema.shape,
    {
      title: 'Synthesize Research',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => {
      try {
        const result = await prcSynthesize(persistence, llmFactory, ctx, args.project_path, args.include_task_deck);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── prc_stress_test ─────────────────────────────────────────────
  server.tool(
    'prc_stress_test',
    "[Pro+] OPTIONAL Pro-tier tool. Call AFTER prc_synthesize to stress-test the product idea before building. Runs a VC-level devil's advocate analysis: challenges market assumptions, fact-checks claims with live web data, evaluates business model, technical risk, and differentiation. Returns GO/NO-GO/CONDITIONAL verdict with confidence score. LONG-RUNNING: involves 3 LLM calls (analysis, web fact-check, verdict synthesis). Prerequisites: Gate 3 approved, prc_synthesize complete. After success: present the verdict to the user. If GO or CONDITIONAL (with conditions met), proceed to rc_import_prerc. If NO-GO, discuss alternatives with the user.",
    PrcStressTestSchema.shape,
    {
      title: 'Stress Test Idea',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => {
      try {
        const result = await prcStressTest(persistence, llmFactory, ctx, args.project_path);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
