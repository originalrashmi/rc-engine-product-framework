import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../orchestrator.js';
import { estimateCopyCost } from '../copy-types.js';
import type { CopyResearchInput, CopyGenerateInput, CopyIterateInput } from '../copy-types.js';
import fs from 'node:fs';
import path from 'node:path';

let _orchestrator: Orchestrator | null = null;
function getOrchestrator(): Orchestrator {
  if (!_orchestrator) _orchestrator = new Orchestrator();
  return _orchestrator;
}

export function registerCopyTools(server: McpServer): void {
  // copy_research_brief — Phase 1 copy research
  server.registerTool(
    'copy_research_brief',
    {
      description:
        'Generate a Copy Research Brief: VOC phrase bank, awareness mapping, JTBD extraction, objection mapping, competitive copy audit, and persuasion framework selection. Call during Phase 2 (Define) AFTER the Design Research Brief. The brief feeds into copy_generate and ux_design. Requires project_path and PRD context.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
      annotations: {
        title: 'Copy Research Brief',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_path }) => {
      try {
        const prdContext = await loadPrdContext(project_path);
        const { icpData, competitorData } = await loadResearchContext(project_path);

        // Load design research brief if available
        let designResearchBrief: string | undefined;
        const briefPath = path.join(project_path, 'rc-method', 'design', 'DESIGN-RESEARCH-BRIEF.md');
        if (fs.existsSync(briefPath)) {
          designResearchBrief = fs.readFileSync(briefPath, 'utf-8');
        }

        const input: CopyResearchInput = {
          projectPath: project_path,
          prdContext,
          icpData,
          competitorData,
          designResearchBrief,
        };

        const result = await getOrchestrator().copyResearch(input);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // copy_generate — Phase 2 copy system generation
  server.registerTool(
    'copy_generate',
    {
      description:
        'Generate the full Content Strategy & Copy System: voice/tone, page-level copy with variants, microcopy library, CTA matrix, and SEO content map. Call AFTER copy_research_brief. Requires the screen inventory (list of screen names). Saves to rc-method/copy/COPY-SYSTEM.md.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        screen_inventory: z
          .array(z.string())
          .describe('List of screen/page names to generate copy for'),
      },
      annotations: {
        title: 'Generate Copy System',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_path, screen_inventory }) => {
      try {
        // Load copy research brief
        const briefPath = path.join(project_path, 'rc-method', 'copy', 'COPY-RESEARCH-BRIEF.md');
        if (!fs.existsSync(briefPath)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No Copy Research Brief found. Run copy_research_brief first.',
              },
            ],
            isError: true,
          };
        }

        // Parse the brief (it's markdown, pass as-is — the agent reads it)
        const briefContent = fs.readFileSync(briefPath, 'utf-8');

        // Load design research brief if available
        let designResearchBrief: string | undefined;
        const designBriefPath = path.join(
          project_path,
          'rc-method',
          'design',
          'DESIGN-RESEARCH-BRIEF.md',
        );
        if (fs.existsSync(designBriefPath)) {
          designResearchBrief = fs.readFileSync(designBriefPath, 'utf-8');
        }

        const cost = estimateCopyCost(screen_inventory.length);

        const input: CopyGenerateInput = {
          projectPath: project_path,
          copyResearchBrief: briefContent as unknown as CopyGenerateInput['copyResearchBrief'],
          designResearchBrief,
          screenInventory: screen_inventory,
        };

        const result = await getOrchestrator().copyGenerate(input);

        const costNote = `\n\n---\n**Estimated cost:** ~$${cost.estimatedUsd.toFixed(2)} (${cost.calls} AI calls, ~${cost.estimatedTokens.toLocaleString()} tokens)`;

        return { content: [{ type: 'text' as const, text: result.text + costNote }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // copy_iterate — Phase 3 iterate with feedback
  server.registerTool(
    'copy_iterate',
    {
      description:
        'Iterate on the generated copy system with user feedback. Updates the COPY-SYSTEM.md in place. Optionally target specific screens for revision.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        feedback: z.string().describe('User feedback on the copy — what to change, improve, or adjust'),
        target_screens: z
          .array(z.string())
          .optional()
          .describe('Optional: specific screen names to revise (default: apply feedback globally)'),
      },
      annotations: {
        title: 'Iterate Copy',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_path, feedback, target_screens }) => {
      try {
        const input: CopyIterateInput = {
          projectPath: project_path,
          feedback,
          targetScreens: target_screens,
        };

        const result = await getOrchestrator().copyIterate(input);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

/** Load PRD content from a project */
async function loadPrdContext(projectPath: string): Promise<string> {
  const prdsDir = path.join(projectPath, 'rc-method', 'prds');
  try {
    if (!fs.existsSync(prdsDir)) {
      const preRcDir = path.join(projectPath, 'pre-rc-research');
      if (fs.existsSync(preRcDir)) {
        const files = fs.readdirSync(preRcDir).filter((f: string) => f.endsWith('.md') && f.includes('prd'));
        if (files.length > 0) {
          return fs.readFileSync(path.join(preRcDir, files[0]), 'utf-8');
        }
      }
      return 'No PRD found.';
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
  const researchDir = path.join(projectPath, 'pre-rc-research');
  let icpData: string | undefined;
  let competitorData: string | undefined;

  try {
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir);
      const icpFile = files.find(
        (f: string) => f.includes('icp') || f.includes('persona') || f.includes('user-research'),
      );
      if (icpFile) {
        icpData = fs.readFileSync(path.join(researchDir, icpFile), 'utf-8');
      }
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
