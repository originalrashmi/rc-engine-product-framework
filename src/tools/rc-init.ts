/**
 * rc_init — Unified gateway tool for the RC Engine pipeline.
 *
 * Detects existing state across all 4 domains (Pre-RC, RC, Post-RC, Traceability)
 * and routes the user to the correct next tool. Defaults to Pre-RC research
 * (prc_start) when no state exists — Pre-RC first, always.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StateManager } from '../domains/rc/state/state-manager.js';
import { StatePersistence } from '../domains/pre-rc/state/state-persistence.js';
import { loadState as loadPostRcState } from '../domains/post-rc/state/state-manager.js';
import { ContextLoader } from '../domains/rc/context-loader.js';
import { PHASE_NAMES, type Phase } from '../domains/rc/types.js';

// Phase → tool mapping for RC domain
const PHASE_TOOLS: Record<Phase, string> = {
  1: 'rc_illuminate',
  2: 'rc_define',
  3: 'rc_architect',
  4: 'rc_sequence',
  5: 'rc_validate',
  6: 'rc_forge_task',
  7: 'rc_gate', // Connect phase — gate check
  8: 'rc_gate', // Compound phase — gate check
};

export function registerInitTool(server: McpServer): void {
  server.tool(
    'rc_init',
    'START HERE. Unified entry point for the RC Engine pipeline. Call this when starting a new project, resuming where you left off, or checking project status. Responds to: "rc_init", "resume project", "continue building", "where did I leave off", "pick up where I left off", "what\'s next", "continue from where I stopped". Detects your project state across all domains (Pre-RC, RC, Post-RC, Traceability) and tells you exactly which tool to call next. Defaults to Pre-RC research (prc_start) for new projects — because research comes before building.',
    {
      project_path: z.string().describe('Absolute path to the project directory'),
      brief: z.string().optional().describe('Product idea or description (for new projects)'),
      skip_research: z
        .boolean()
        .optional()
        .default(false)
        .describe('Set true to bypass Pre-RC and go straight to rc_start (not recommended)'),
    },
    {
      title: 'RC Engine Gateway',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (args) => {
      const {
        project_path: projectPath,
        brief,
        skip_research: skipResearch,
      } = args as {
        project_path: string;
        brief?: string;
        skip_research?: boolean;
      };

      try {
        const result = await detectAndRoute(projectPath, brief, skipResearch ?? false);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error in rc_init: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

async function detectAndRoute(projectPath: string, brief?: string, skipResearch: boolean = false): Promise<string> {
  // ── 1. Check Post-RC state (highest priority — project is in validation/shipping) ──
  let hasPostRc = false;
  try {
    await loadPostRcState(projectPath);
    hasPostRc = true;
  } catch {
    // No Post-RC state — continue detection
  }

  // ── 2. Check RC state ──
  const rcStateManager = new StateManager();
  const hasRc = rcStateManager.exists(projectPath);

  // ── 3. Check Pre-RC state ──
  const preRcPersistence = new StatePersistence();
  const hasPreRc = await preRcPersistence.exists(projectPath);

  // ── 4. Check Pre-RC artifacts on filesystem ──
  const contextLoader = new ContextLoader();
  const preRcArtifacts = contextLoader.detectPreRcArtifacts(projectPath);

  // ═══════════════════════════════════════════════════════════
  // ROUTING LOGIC (priority cascade)
  // ═══════════════════════════════════════════════════════════

  // Case A: Post-RC exists — project is in validation/shipping phase
  if (hasPostRc) {
    const rcState = hasRc ? rcStateManager.load(projectPath) : null;
    const phase = rcState ? `Phase ${rcState.currentPhase} (${PHASE_NAMES[rcState.currentPhase]})` : 'unknown';
    return formatRoute({
      status: 'POST-RC IN PROGRESS',
      summary: `Project has Post-RC validation state. RC is at ${phase}.`,
      nextTool: 'postrc_status',
      nextAction: 'Check Post-RC validation progress and resolve any findings.',
      tip: 'Use postrc_scan to run a new scan, or postrc_gate to check gate readiness.',
    });
  }

  // Case B: RC state exists — project is mid-build
  if (hasRc) {
    const rcState = rcStateManager.load(projectPath);
    const phase = rcState.currentPhase;
    const phaseName = PHASE_NAMES[phase];
    const tool = PHASE_TOOLS[phase];

    // Check if current phase gate is already approved → suggest next phase tool
    const gateRecord = rcState.gates[phase];
    const gateApproved = gateRecord?.status === 'approved';

    if (gateApproved && phase < 8) {
      const nextPhase = (phase + 1) as Phase;
      return formatRoute({
        status: `RC PHASE ${phase} (${phaseName}) — GATE APPROVED`,
        summary: `Phase ${phase} gate is approved. Ready for Phase ${nextPhase} (${PHASE_NAMES[nextPhase]}).`,
        nextTool: PHASE_TOOLS[nextPhase],
        nextAction: `Continue to Phase ${nextPhase}: ${PHASE_NAMES[nextPhase]}.`,
        tip: 'Use rc_status for full progress details.',
      });
    }

    if (phase === 8 && gateApproved) {
      return formatRoute({
        status: 'RC METHOD COMPLETE',
        summary: 'All 8 RC phases are complete. Project is ready for Post-RC validation.',
        nextTool: 'postrc_scan',
        nextAction: 'Run Post-RC security and monitoring scan before shipping.',
        tip: 'Use trace_enhance_prd for optional traceability analysis.',
      });
    }

    return formatRoute({
      status: `RC PHASE ${phase} — ${phaseName.toUpperCase()}`,
      summary: `Project is in RC Phase ${phase} (${phaseName}).`,
      nextTool: tool,
      nextAction: `Continue working on Phase ${phase}: ${phaseName}.`,
      tip: 'Use rc_status for full progress details. Use rc_gate when ready to advance.',
    });
  }

  // Case C: Pre-RC complete (Gate 3 approved) — ready to import into RC
  if (hasPreRc || preRcArtifacts.found) {
    if (preRcArtifacts.isComplete) {
      return formatRoute({
        status: 'PRE-RC RESEARCH COMPLETE',
        summary: 'Pre-RC research is finished (Gate 3 approved). PRD and artifacts are ready.',
        nextTool: 'rc_import_prerc',
        nextAction: 'Import Pre-RC research into the RC Method to begin building.',
        tip: preRcArtifacts.prdPath ? `PRD found: ${preRcArtifacts.prdPath}` : undefined,
      });
    }

    // Pre-RC in progress but not complete
    return formatRoute({
      status: 'PRE-RC RESEARCH IN PROGRESS',
      summary: 'Pre-RC research has been started but is not yet complete.',
      nextTool: 'prc_status',
      nextAction: 'Check Pre-RC research progress and continue the remaining stages.',
      tip: 'All 6 research stages + Gate 3 must pass before importing into RC.',
    });
  }

  // Case D: No state at all — new project
  if (!brief) {
    return formatRoute({
      status: 'NEW PROJECT — NO STATE FOUND',
      summary: 'No existing project state detected. Provide a product brief to get started.',
      nextTool: skipResearch ? 'rc_start' : 'prc_start',
      nextAction: skipResearch
        ? 'Call rc_start with your product brief to begin building directly.'
        : 'Call prc_start with your product brief to begin with AI-powered research (recommended).',
      tip: 'Re-call rc_init with a brief parameter, e.g.:\n  rc_init { project_path: "...", brief: "A SaaS invoicing tool for freelancers" }',
    });
  }

  // Case E: New project WITH brief — route to prc_start (default) or rc_start (skip)
  if (skipResearch) {
    return formatRoute({
      status: 'STARTING — SKIP RESEARCH MODE',
      summary: 'Bypassing Pre-RC research. Going directly to RC Method build phase.',
      nextTool: 'rc_start',
      nextAction: `Call rc_start with:\n  project_path: "${projectPath}"\n  brief: "${truncate(brief, 100)}"`,
      tip: 'Skipping Pre-RC means no AI research specialists, no market analysis, no competitive landscape. Consider using prc_start instead.',
    });
  }

  return formatRoute({
    status: 'STARTING — PRE-RC RESEARCH (DEFAULT)',
    summary: 'Beginning with Pre-RC AI research — 20 specialized personas will analyze your idea across 6 stages.',
    nextTool: 'prc_start',
    nextAction: `Call prc_start with:\n  project_path: "${projectPath}"\n  brief: "${truncate(brief, 100)}"`,
    tip: 'Pre-RC produces a comprehensive PRD with market research, user personas, technical analysis, and UX recommendations. This feeds directly into the RC Method build phases.',
  });
}

// ── Formatting helpers ──────────────────────────────────────

interface RouteResult {
  status: string;
  summary: string;
  nextTool: string;
  nextAction: string;
  tip?: string;
}

function formatRoute({ status, summary, nextTool, nextAction, tip }: RouteResult): string {
  let output = `
===============================================
  RC ENGINE — GATEWAY
===============================================

  STATUS: ${status}

  ${summary}

  ▸ NEXT TOOL: ${nextTool}
    ${nextAction}
`;

  if (tip) {
    output += `\n  💡 ${tip}\n`;
  }

  output += `
  PIPELINE OVERVIEW:
    Pre-RC ➜ RC (8 phases) ➜ Post-RC ➜ Traceability
    prc_*    rc_*, ux_*       postrc_*   trace_*

    Use rc_pipeline_status for full domain summary.
===============================================`;

  return output;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
