import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../orchestrator.js';
import type { DesignResearchInput } from '../agents/design-research-agent.js';
import type { DesignIntakeInput } from '../design-intake-types.js';
import type { BrandImportInput } from '../brand-types.js';

let _orchestrator: Orchestrator | null = null;
function getOrchestrator(): Orchestrator {
  if (!_orchestrator) _orchestrator = new Orchestrator();
  return _orchestrator;
}

export function registerDesignTools(server: McpServer): void {
  // design_research_brief - Phase 2 design research
  server.registerTool(
    'design_research_brief',
    {
      description:
        'Generate a Design Research Brief during Phase 2 (Define). Analyzes ICP, competitors, and brand constraints to produce research-backed design direction. Output: ICP design profile, competitive design landscape, emotional design strategy, information architecture, cognitive design principles, trend recommendations, and design constraints. Saves to rc-method/design/DESIGN-RESEARCH-BRIEF.md. Call AFTER prd is created.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
      annotations: {
        title: 'Design Research Brief',
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

        // Check for brand profile and design intake
        const fs = await import('node:fs');
        const pathMod = await import('node:path');

        let brandProfilePath: string | undefined;
        const brandCandidate = pathMod.join(project_path, 'rc-method', 'design', 'BRAND-PROFILE.json');
        if (fs.existsSync(brandCandidate)) brandProfilePath = brandCandidate;

        let designIntakePath: string | undefined;
        const intakeCandidate = pathMod.join(project_path, 'rc-method', 'design', 'DESIGN-INTAKE.md');
        if (fs.existsSync(intakeCandidate)) designIntakePath = intakeCandidate;

        const input: DesignResearchInput = {
          projectPath: project_path,
          prdContext,
          icpData,
          competitorData,
          brandProfilePath,
          designIntakePath,
        };

        const result = await getOrchestrator().designResearch(input);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // design_intake - Phase 1 design preference assessment
  server.registerTool(
    'design_intake',
    {
      description:
        'Run the Design Intake Assessment during Phase 1 (Illuminate). Analyzes user design preferences against ICP expectations. Optionally analyzes competitor URLs and reference designs. Returns an alignment score (0-100), verdict (proceed/proceed_with_adjustments/reconsider), and extracted design constraints for the Design Agent. Saves to rc-method/design/DESIGN-INTAKE.md.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        competitor_urls: z
          .array(z.string())
          .optional()
          .describe('URLs of competitor sites to analyze for design patterns'),
        reference_urls: z
          .array(z.string())
          .optional()
          .describe('URLs of reference designs the user likes'),
        color_likes: z
          .array(z.string())
          .optional()
          .describe('Colors the user prefers (hex codes or names)'),
        color_dislikes: z
          .array(z.string())
          .optional()
          .describe('Colors the user wants to avoid'),
        font_likes: z
          .array(z.string())
          .optional()
          .describe('Font preferences (specific fonts or style descriptions like "editorial serif")'),
        layout_preferences: z
          .array(z.string())
          .optional()
          .describe('Layout/structure preferences (e.g., "sidebar navigation", "card grid")'),
        additional_context: z
          .string()
          .optional()
          .describe('Any additional design context or preferences'),
      },
      annotations: {
        title: 'Design Intake Assessment',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      project_path,
      competitor_urls,
      reference_urls,
      color_likes,
      color_dislikes,
      font_likes,
      layout_preferences,
      additional_context,
    }) => {
      try {
        const prdContext = await loadPrdContext(project_path);
        const { icpData } = await loadResearchContext(project_path);

        const input: DesignIntakeInput = {
          projectPath: project_path,
          mode: 'guided',
          competitorUrls: competitor_urls,
          referenceUrls: reference_urls,
          colorPreferences:
            color_likes || color_dislikes
              ? { liked: color_likes, disliked: color_dislikes }
              : undefined,
          fontPreferences: font_likes ? { liked: font_likes } : undefined,
          structuralPreferences: layout_preferences,
          additionalContext: additional_context,
        };

        const result = await getOrchestrator().designIntake(input, prdContext, icpData);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // brand_import - Phase 1 brand asset detection
  server.registerTool(
    'brand_import',
    {
      description:
        'Import brand assets during Phase 1 (Illuminate). Auto-detects colors, fonts, and design tokens from project files (tailwind config, CSS variables, constants/). Optionally scrapes a URL for brand signals. Produces a normalized BrandProfile saved to rc-method/design/BRAND-PROFILE.json. The profile is consumed by design_research_brief, ux_design, and copy_generate for brand consistency.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        website_url: z
          .string()
          .optional()
          .describe('URL of existing website/product to scrape for brand assets'),
        mode: z
          .enum(['strict', 'infer'])
          .optional()
          .describe('strict = only use detected values; infer = auto-fill gaps with harmonious defaults'),
      },
      annotations: {
        title: 'Brand Import',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_path, website_url, mode }) => {
      try {
        const input: BrandImportInput = {
          projectPath: project_path,
          websiteUrl: website_url,
          mode: mode ?? 'infer',
        };

        const result = await getOrchestrator().brandImport(input);
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

/** Load PRD content from a project for design context */
async function loadPrdContext(projectPath: string): Promise<string> {
  const fs = await import('node:fs');
  const pathMod = await import('node:path');
  const prdsDir = pathMod.join(projectPath, 'rc-method', 'prds');

  try {
    if (!fs.existsSync(prdsDir)) {
      const preRcDir = pathMod.join(projectPath, 'pre-rc-research');
      if (fs.existsSync(preRcDir)) {
        const files = fs.readdirSync(preRcDir).filter((f: string) => f.endsWith('.md') && f.includes('prd'));
        if (files.length > 0) {
          return fs.readFileSync(pathMod.join(preRcDir, files[0]), 'utf-8');
        }
      }
      return 'No PRD found. Will work from project description only.';
    }

    const files = fs.readdirSync(prdsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => fs.readFileSync(pathMod.join(prdsDir, f), 'utf-8')).join('\n\n---\n\n');
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
  const pathMod = await import('node:path');
  const researchDir = pathMod.join(projectPath, 'pre-rc-research');

  let icpData: string | undefined;
  let competitorData: string | undefined;

  try {
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir);
      const icpFile = files.find(
        (f: string) => f.includes('icp') || f.includes('persona') || f.includes('user-research'),
      );
      if (icpFile) {
        icpData = fs.readFileSync(pathMod.join(researchDir, icpFile), 'utf-8');
      }
      const compFile = files.find(
        (f: string) => f.includes('competitor') || f.includes('market') || f.includes('landscape'),
      );
      if (compFile) {
        competitorData = fs.readFileSync(pathMod.join(researchDir, compFile), 'utf-8');
      }
    }
  } catch {
    // Non-fatal
  }

  return { icpData, competitorData };
}
