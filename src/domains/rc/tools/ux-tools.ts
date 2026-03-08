import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../orchestrator.js';
import { estimateDesignCost } from '../design-types.js';
import type { DesignInput } from '../design-types.js';

let _orchestrator: Orchestrator | null = null;
function getOrchestrator(): Orchestrator {
  if (!_orchestrator) _orchestrator = new Orchestrator();
  return _orchestrator;
}

export function registerRcUxTools(server: McpServer): void {
  // ux_score - Score UX complexity and get routing recommendation
  server.registerTool(
    'ux_score',
    {
      description:
        'OPTIONAL - call during Phase 2 (Define) to assess UX complexity. Pass the feature list from the PRD. Returns: numeric score, mode (standard/selective/deep_dive), and which UX specialist modules to load. Use the result to decide whether to call ux_generate (for deep_dive/selective) or skip UX child PRD (for standard). Does NOT require project_path - works on any feature list. Read-only analysis.',
      inputSchema: {
        feature_list: z.string().describe('List of features/screens to score for UX complexity'),
      },
    },
    async ({ feature_list }) => {
      try {
        const result = await getOrchestrator().uxScore(feature_list);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ux_audit - Audit UI code or description against UX rules
  server.registerTool(
    'ux_audit',
    {
      description:
        'Audit UI code or a screen description against 42 core UX rules plus specialist modules. Call during or after Forge (Phase 6) to check implementation quality. task_type controls which specialist modules load: form, dashboard, onboarding, admin, payment, component_library, content, navigation, or "audit" to load all. Returns findings with severity, rule citations, and fix suggestions. Use this to catch UX issues before postrc_scan.',
      inputSchema: {
        code_or_description: z.string().describe('UI code snippet or description to audit'),
        task_type: z
          .string()
          .describe(
            'Type of UI task for specialist routing: form, dashboard, onboarding, admin, payment, component_library, content, navigation, or audit (loads all)',
          ),
      },
    },
    async ({ code_or_description, task_type }) => {
      try {
        const result = await getOrchestrator().uxAudit(code_or_description, task_type);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ux_generate - Generate a UX child PRD
  server.registerTool(
    'ux_generate',
    {
      description:
        'Generate a UX child PRD (PRD-[project]-ux.md). Call during Phase 2 (Define) if ux_score returned selective or deep_dive mode. Produces: screen inventory, state contracts, component inventory, copy inventory, and accessibility checklist. Saved alongside the main PRD in rc-method/prds/. Pass descriptions of the screens and user flows. After success: the UX PRD is used by rc_validate (Phase 5) for UX quality checks and by rc_forge_task for implementation guidance.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        screens_description: z.string().describe('Description of the screens and flows that need UX specification'),
      },
    },
    async ({ project_path, screens_description }) => {
      try {
        const result = await getOrchestrator().uxGenerate(project_path, screens_description);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ux_design - Generate design options with wireframes
  server.registerTool(
    'ux_design',
    {
      description:
        'Generate visual design options with HTML wireframes. Call after PRD is created (Phase 2+). Produces 1 or 3 design options based on ICP, competitor gaps, and design trends. Each option includes a design spec (colors, typography, layout) and self-contained HTML wireframes (lo-fi + hi-fi). Saves to rc-method/design/. Pass option_count=1 for budget-conscious, option_count=3 for full comparison.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        option_count: z.number().min(1).max(3).describe('Number of design options to generate (1 or 3)'),
        inspiration: z
          .string()
          .optional()
          .describe('Optional user-provided design references, style preferences, or URLs for inspiration'),
      },
    },
    async ({ project_path, option_count, inspiration }) => {
      try {
        const orchestrator = getOrchestrator();
        const optionCount = (option_count === 3 ? 3 : 1) as 1 | 3;

        // Load PRD context from project
        const prdContext = await loadPrdContext(project_path);
        const { icpData, competitorData } = await loadResearchContext(project_path);

        // Provide cost estimate in response
        const cost = estimateDesignCost(optionCount);

        const input: DesignInput = {
          projectPath: project_path,
          optionCount,
          inspiration,
          prdContext,
          icpData,
          competitorData,
        };

        const result = await orchestrator.designGenerate(input);

        const costNote = `\n\n---\n**Estimated cost for this generation:** ~$${cost.estimatedUsd.toFixed(2)} (${cost.calls} AI calls, ~${cost.estimatedTokens.toLocaleString()} tokens)`;

        return { content: [{ type: 'text' as const, text: result.text + costNote }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

/** Load PRD content from a project for design context */
async function loadPrdContext(projectPath: string): Promise<string> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const prdsDir = path.join(projectPath, 'rc-method', 'prds');

  try {
    if (!fs.existsSync(prdsDir)) {
      // Try Pre-RC PRD
      const preRcDir = path.join(projectPath, 'pre-rc-research');
      if (fs.existsSync(preRcDir)) {
        const files = fs.readdirSync(preRcDir).filter((f: string) => f.endsWith('.md') && f.includes('prd'));
        if (files.length > 0) {
          return fs.readFileSync(path.join(preRcDir, files[0]), 'utf-8');
        }
      }
      return 'No PRD found. Design will be based on project description only.';
    }

    const files = fs.readdirSync(prdsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => fs.readFileSync(path.join(prdsDir, f), 'utf-8')).join('\n\n---\n\n');
  } catch {
    return 'Could not load PRD files.';
  }
}

/** Load ICP and competitor data from Pre-RC research */
async function loadResearchContext(projectPath: string): Promise<{
  icpData: string | undefined;
  competitorData: string | undefined;
}> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const researchDir = path.join(projectPath, 'pre-rc-research');

  let icpData: string | undefined;
  let competitorData: string | undefined;

  try {
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir);
      // Look for ICP/persona research
      const icpFile = files.find(
        (f: string) => f.includes('icp') || f.includes('persona') || f.includes('user-research'),
      );
      if (icpFile) {
        icpData = fs.readFileSync(path.join(researchDir, icpFile), 'utf-8');
      }

      // Look for competitor analysis
      const compFile = files.find(
        (f: string) => f.includes('competitor') || f.includes('market') || f.includes('landscape'),
      );
      if (compFile) {
        competitorData = fs.readFileSync(path.join(researchDir, compFile), 'utf-8');
      }
    }
  } catch {
    // Non-fatal
  }

  return { icpData, competitorData };
}
