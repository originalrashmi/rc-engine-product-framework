import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DesignResearchInput } from '../agents/design-research-agent.js';
import type { DesignIntakeInput } from '../design-intake-types.js';
import type { BrandImportInput } from '../brand-types.js';
import type { DesignIterateInput } from '../design-types.js';
import { getOrchestrator, loadPrdContext, loadResearchContext } from './shared-loaders.js';
import fs from 'node:fs';
import path from 'node:path';

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
        let brandProfilePath: string | undefined;
        const brandCandidate = path.join(project_path, 'rc-method', 'design', 'BRAND-PROFILE.json');
        if (fs.existsSync(brandCandidate)) brandProfilePath = brandCandidate;

        let designIntakePath: string | undefined;
        const intakeCandidate = path.join(project_path, 'rc-method', 'design', 'DESIGN-INTAKE.md');
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

  // design_iterate - Revise wireframes with feedback
  server.registerTool(
    'design_iterate',
    {
      description:
        'Iterate on existing wireframes based on user feedback. Loads the current design spec and regenerates wireframes for specified screens (or all screens) applying the feedback. Maintains design system consistency. Requires ux_design to have been run first.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        feedback: z.string().describe('User feedback on the current design — what to change and why'),
        target_screens: z
          .array(z.string())
          .optional()
          .describe('Specific screen names to revise (revises all if omitted)'),
        target_option_id: z
          .string()
          .optional()
          .describe('Design option ID to revise (uses selected/recommended if omitted)'),
      },
      annotations: {
        title: 'Design Iterate',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_path, feedback, target_screens, target_option_id }) => {
      try {
        const input: DesignIterateInput = {
          projectPath: project_path,
          feedback,
          targetScreens: target_screens,
          targetOptionId: target_option_id,
        };

        const result = await getOrchestrator().designIterate(input);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // design_pipeline - Full design intelligence pipeline in one call
  server.registerTool(
    'design_pipeline',
    {
      description:
        'Run the full Design Intelligence pipeline in sequence: brand_import → design_research_brief → ux_design → design_challenge. Requires PRD to exist (run rc_define first). Optional: provide design preferences for a design_intake step. Returns a combined report with all artifacts. This is a convenience tool — each step can also be called individually for more control.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        option_count: z
          .enum(['1', '3'])
          .optional()
          .describe('Number of design options to generate (default: 3)'),
        inspiration: z
          .string()
          .optional()
          .describe('Design inspiration, references, or preferences'),
        run_challenge: z
          .boolean()
          .optional()
          .describe('Run the Design Challenger after generation (default: true)'),
      },
      annotations: {
        title: 'Design Pipeline',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_path, option_count, inspiration, run_challenge }) => {
      try {
        const orchestrator = getOrchestrator();
        const steps: string[] = [];
        const allArtifacts: string[] = [];

        // Step 1: Brand Import
        steps.push('## Step 1: Brand Import');
        try {
          const brandResult = await orchestrator.brandImport({
            projectPath: project_path,
            mode: 'infer',
          });
          steps.push(brandResult.text);
          if (brandResult.artifacts) allArtifacts.push(...brandResult.artifacts);
        } catch (err) {
          steps.push(`Skipped — ${(err as Error).message}`);
        }

        // Step 2: Design Research Brief
        steps.push('\n---\n\n## Step 2: Design Research Brief');
        const prdContext = await loadPrdContext(project_path);
        const { icpData, competitorData } = await loadResearchContext(project_path);

        let brandProfilePath: string | undefined;
        const brandCandidate = path.join(project_path, 'rc-method', 'design', 'BRAND-PROFILE.json');
        if (fs.existsSync(brandCandidate)) brandProfilePath = brandCandidate;

        const researchResult = await orchestrator.designResearch({
          projectPath: project_path,
          prdContext,
          icpData,
          competitorData,
          brandProfilePath,
        });
        steps.push(`Design Research Brief generated (${researchResult.text.length} chars)`);
        if (researchResult.artifacts) allArtifacts.push(...researchResult.artifacts);

        // Step 3: Design Generation
        steps.push('\n---\n\n## Step 3: Design Generation');
        const designInput = {
          projectPath: project_path,
          optionCount: (option_count === '1' ? 1 : 3) as 1 | 3,
          prdContext,
          icpData,
          competitorData,
          inspiration,
          brandProfilePath,
          copySystemPath: fs.existsSync(path.join(project_path, 'rc-method', 'copy', 'COPY-SYSTEM.md'))
            ? path.join(project_path, 'rc-method', 'copy', 'COPY-SYSTEM.md')
            : undefined,
        };
        const designResult = await orchestrator.designGenerate(designInput);
        steps.push(designResult.text);
        if (designResult.artifacts) allArtifacts.push(...designResult.artifacts);

        // Step 4: Design Challenge (optional, default true)
        if (run_challenge !== false) {
          steps.push('\n---\n\n## Step 4: Design Challenge');
          try {
            const challengeResult = await orchestrator.designChallenge({
              projectPath: project_path,
              prdContext,
              icpData,
            });
            steps.push(challengeResult.text);
            if (challengeResult.artifacts) allArtifacts.push(...challengeResult.artifacts);
          } catch (err) {
            steps.push(`Challenge skipped — ${(err as Error).message}`);
          }
        }

        const report = `# Design Pipeline Complete\n\n${steps.join('\n')}\n\n---\n\n## All Artifacts (${allArtifacts.length})\n${allArtifacts.map((a) => `- \`${a}\``).join('\n')}`;

        return { content: [{ type: 'text' as const, text: report }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
