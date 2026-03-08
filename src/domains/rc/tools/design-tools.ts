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

  // design_intake - Comprehensive design preference assessment
  server.registerTool(
    'design_intake',
    {
      description:
        'Run the Design Intake Assessment — the FIRST step of the Design Intelligence pipeline after PRD. Captures comprehensive user design preferences: brand identity, colors, typography, layout, mood, animation, component styles, platform targets, accessibility requirements, competitor intelligence, and screen inventory. Evaluates all inputs against ICP expectations. Returns alignment score (0-100), verdict (proceed/proceed_with_adjustments/reconsider), and extracted design constraints that feed into every downstream design tool. Saves to rc-method/design/DESIGN-INTAKE.md.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),

        // Brand Identity
        brand_guidelines_url: z.string().optional().describe('URL or path to existing brand guidelines document'),
        brand_personality: z.array(z.string()).optional().describe('3-5 brand personality traits: "professional", "playful", "luxurious", "bold", "technical", "warm", "minimal"'),
        existing_logo_path: z.string().optional().describe('Path to existing logo file'),

        // Colors
        color_likes: z.array(z.string()).optional().describe('Colors the user prefers (hex codes or names)'),
        color_dislikes: z.array(z.string()).optional().describe('Colors the user wants to avoid'),

        // Typography
        font_likes: z.array(z.string()).optional().describe('Font preferences (specific fonts or style descriptions like "editorial serif")'),
        font_dislikes: z.array(z.string()).optional().describe('Fonts or styles to avoid'),

        // Layout & Structure
        layout_preferences: z.array(z.string()).optional().describe('Layout preferences: "sidebar navigation", "card grid", "single-page app"'),
        navigation_pattern: z.enum(['top-nav', 'sidebar', 'bottom-tabs', 'hamburger', 'hybrid', 'no-preference']).optional().describe('Primary navigation pattern'),
        content_density: z.enum(['minimal', 'balanced', 'dense']).optional().describe('Content density: minimal (Apple-like), balanced, dense (Amazon-like)'),

        // Mood & Aesthetic
        mood_keywords: z.array(z.string()).optional().describe('Design mood: "clean and modern", "warm and approachable", "bold and energetic"'),
        aesthetic_direction: z.enum(['minimal', 'bold', 'organic', 'geometric', 'editorial', 'playful', 'corporate', 'no-preference']).optional().describe('Overall aesthetic direction'),

        // Interaction & Motion
        animation_preference: z.enum(['none', 'subtle', 'moderate', 'expressive', 'no-preference']).optional().describe('Level of animation and micro-interactions'),
        interaction_density: z.enum(['spacious', 'balanced', 'compact']).optional().describe('Spacious (consumer) vs compact (power user)'),

        // Component Preferences
        card_style: z.enum(['elevated', 'outlined', 'flat', 'no-preference']).optional().describe('Card component style'),
        form_style: z.enum(['floating-label', 'outlined', 'filled', 'underlined', 'no-preference']).optional().describe('Form input style'),
        button_style: z.enum(['rounded', 'pill', 'square', 'no-preference']).optional().describe('Button style'),
        modal_preference: z.enum(['modal', 'inline', 'drawer', 'no-preference']).optional().describe('Overlay interaction pattern'),
        icon_style: z.enum(['outlined', 'filled', 'duotone', 'hand-drawn', 'no-preference']).optional().describe('Icon style'),
        imagery_style: z.enum(['photography', 'illustration', 'abstract', 'icons-only', 'mixed', 'no-preference']).optional().describe('Visual imagery approach'),

        // Platform & Device
        primary_platform: z.enum(['web', 'ios', 'android', 'desktop', 'pwa', 'cross-platform']).optional().describe('Primary platform target'),
        device_priority: z.enum(['mobile-first', 'desktop-first', 'responsive-parity', 'no-preference']).optional().describe('Device priority strategy'),
        design_system_framework: z.enum(['tailwind', 'material-ui', 'chakra', 'ant-design', 'custom', 'none', 'no-preference']).optional().describe('Preferred design system or component framework'),

        // Accessibility
        wcag_target: z.enum(['A', 'AA', 'AAA', 'no-preference']).optional().describe('WCAG compliance target'),
        accessibility_requirements: z.array(z.string()).optional().describe('Specific a11y needs: "screen reader support", "reduced motion", "high contrast"'),

        // Competitor Intelligence
        competitor_urls: z.array(z.string()).optional().describe('URLs of competitor sites to analyze'),
        competitor_likes: z.array(z.string()).optional().describe('What user likes about competitor designs'),
        competitor_dislikes: z.array(z.string()).optional().describe('What user wants to differentiate from'),

        // Reference & Inspiration
        reference_urls: z.array(z.string()).optional().describe('URLs of reference designs the user likes'),

        // Screen Inventory
        key_screens: z.array(z.string()).optional().describe('Key screens: "landing page", "dashboard", "settings", "onboarding"'),
        critical_flows: z.array(z.string()).optional().describe('User journeys: "signup -> onboarding -> first value"'),
        priority_screens: z.array(z.string()).optional().describe('Top 3 screens that matter most for design quality'),

        // Freeform
        additional_context: z.string().optional().describe('Any additional design context or preferences'),
      },
      annotations: {
        title: 'Design Intake Assessment',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const prdContext = await loadPrdContext(args.project_path);

        // Validate PRD exists — design intake without a PRD produces low-quality results
        if (prdContext.includes('No PRD found') || prdContext.includes('Could not load PRD')) {
          return {
            content: [{ type: 'text' as const, text: `Error: No PRD found at ${args.project_path}. Design intake requires a PRD to evaluate design preferences against product requirements. Run rc_define or rc_import_prerc first.` }],
            isError: true,
          };
        }

        const { icpData } = await loadResearchContext(args.project_path);

        // Auto-load brand profile if brand_import was run previously
        let brandProfile: import('../brand-types.js').BrandProfile | undefined;
        const brandCandidate = path.join(args.project_path, 'rc-method', 'design', 'BRAND-PROFILE.json');
        if (fs.existsSync(brandCandidate)) {
          try {
            brandProfile = JSON.parse(fs.readFileSync(brandCandidate, 'utf-8'));
          } catch { /* continue without brand */ }
        }

        const input: DesignIntakeInput = {
          projectPath: args.project_path,
          mode: 'guided',

          // Brand Identity
          brandGuidelinesUrl: args.brand_guidelines_url,
          brandPersonality: args.brand_personality,
          existingLogoPath: args.existing_logo_path,

          // Colors
          colorPreferences:
            args.color_likes || args.color_dislikes
              ? { liked: args.color_likes, disliked: args.color_dislikes }
              : undefined,

          // Typography
          fontPreferences:
            args.font_likes || args.font_dislikes
              ? { liked: args.font_likes, disliked: args.font_dislikes }
              : undefined,

          // Layout & Structure
          structuralPreferences: args.layout_preferences,
          navigationPattern: args.navigation_pattern,
          contentDensity: args.content_density,

          // Mood & Aesthetic
          moodKeywords: args.mood_keywords,
          aestheticDirection: args.aesthetic_direction,

          // Interaction & Motion
          animationPreference: args.animation_preference,
          interactionDensity: args.interaction_density,

          // Component Preferences
          componentPreferences:
            args.card_style || args.form_style || args.button_style || args.modal_preference
              ? {
                  cardStyle: args.card_style,
                  formStyle: args.form_style,
                  buttonStyle: args.button_style,
                  modalPreference: args.modal_preference,
                }
              : undefined,
          iconStyle: args.icon_style,
          imageryStyle: args.imagery_style,

          // Platform & Device
          primaryPlatform: args.primary_platform,
          devicePriority: args.device_priority,
          designSystemFramework: args.design_system_framework,

          // Accessibility
          wcagTarget: args.wcag_target,
          accessibilityRequirements: args.accessibility_requirements,

          // Competitor Intelligence
          competitorUrls: args.competitor_urls,
          competitorLikes: args.competitor_likes,
          competitorDislikes: args.competitor_dislikes,

          // Reference & Inspiration
          referenceUrls: args.reference_urls,

          // Screen Inventory
          keyScreens: args.key_screens,
          criticalFlows: args.critical_flows,
          priorityScreens: args.priority_screens,

          // Freeform
          additionalContext: args.additional_context,
        };

        const result = await getOrchestrator().designIntake(input, prdContext, icpData, brandProfile);

        // Show brand profile detection in output
        let output = result.text;
        if (brandProfile) {
          output = `> **Brand profile detected:** \`rc-method/design/BRAND-PROFILE.json\` — brand constraints applied to evaluation.\n\n${output}`;
        }

        return { content: [{ type: 'text' as const, text: output }] };
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

  // design_select - Select a design option for downstream use
  server.registerTool(
    'design_select',
    {
      description:
        'Select a design option after reviewing ux_design output. Saves the selected option ID to project state so that design_iterate, design_challenge, and code generation know which option to use. If not called, the recommended option is used by default.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        option_id: z.string().describe('Design option ID to select ("A", "B", or "C")'),
      },
      annotations: {
        title: 'Select Design Option',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ project_path, option_id }) => {
      try {
        const specPath = path.join(project_path, 'rc-method', 'design', 'DESIGN-SPEC.json');
        if (!fs.existsSync(specPath)) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No design spec found. Run ux_design first.' }],
            isError: true,
          };
        }

        // Validate the option exists in the spec
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
        const option = spec.options?.find((o: { id: string }) => o.id === option_id);
        if (!option) {
          const available = spec.options?.map((o: { id: string }) => o.id).join(', ') ?? 'none';
          return {
            content: [{ type: 'text' as const, text: `Error: Option "${option_id}" not found. Available options: ${available}` }],
            isError: true,
          };
        }

        const result = getOrchestrator().designSelect(project_path, option_id, specPath);
        return { content: [{ type: 'text' as const, text: `Design option ${option_id} ("${option.name}") selected.\n\nNext steps:\n- "design_iterate" to refine wireframes\n- "design_challenge" to run design review\n- "rc_forge_task" to start building` }] };
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
        'Run the full Design Intelligence pipeline in sequence: brand_import → design_intake → design_research_brief → copy_research + copy_generate → ux_design → auto-select → design_challenge. Requires PRD to exist (run rc_define first). Captures user design preferences via design_intake, generates real copy, then produces research-backed design options with wireframes using that copy. Returns a combined report with all artifacts. Each step can also be called individually for more control.',
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
        // Design intake preferences (passed to design_intake step)
        mood_keywords: z.array(z.string()).optional().describe('Design mood keywords for intake'),
        aesthetic_direction: z.enum(['minimal', 'bold', 'organic', 'geometric', 'editorial', 'playful', 'corporate', 'no-preference']).optional(),
        primary_platform: z.enum(['web', 'ios', 'android', 'desktop', 'pwa', 'cross-platform']).optional(),
        wcag_target: z.enum(['A', 'AA', 'AAA', 'no-preference']).optional(),
        key_screens: z.array(z.string()).optional().describe('Key screens to design'),
        priority_screens: z.array(z.string()).optional().describe('Top 3 priority screens'),
      },
      annotations: {
        title: 'Design Pipeline',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_path, option_count, inspiration, run_challenge, mood_keywords, aesthetic_direction, primary_platform, wcag_target, key_screens, priority_screens }) => {
      try {
        const orchestrator = getOrchestrator();
        const steps: string[] = [];
        const allArtifacts: string[] = [];

        // Load PRD context early (needed by multiple steps)
        const prdContext = await loadPrdContext(project_path);
        const { icpData, competitorData } = await loadResearchContext(project_path);

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

        // Step 2: Design Intake
        steps.push('\n---\n\n## Step 2: Design Intake');
        let brandProfile: import('../brand-types.js').BrandProfile | undefined;
        const brandCandidate = path.join(project_path, 'rc-method', 'design', 'BRAND-PROFILE.json');
        if (fs.existsSync(brandCandidate)) {
          try { brandProfile = JSON.parse(fs.readFileSync(brandCandidate, 'utf-8')); } catch { /* continue */ }
        }

        try {
          const intakeInput: DesignIntakeInput = {
            projectPath: project_path,
            mode: 'autonomous',
            moodKeywords: mood_keywords,
            aestheticDirection: aesthetic_direction,
            primaryPlatform: primary_platform,
            wcagTarget: wcag_target,
            keyScreens: key_screens,
            priorityScreens: priority_screens,
          };
          const intakeResult = await orchestrator.designIntake(intakeInput, prdContext, icpData, brandProfile);
          steps.push(`Design Intake complete — verdict: ${intakeResult.text.match(/Verdict:\s*(\w+)/)?.[1] ?? 'see report'}`);
          if (intakeResult.artifacts) allArtifacts.push(...intakeResult.artifacts);
        } catch (err) {
          steps.push(`Skipped — ${(err as Error).message}`);
        }

        // Step 3: Design Research Brief
        steps.push('\n---\n\n## Step 3: Design Research Brief');
        const brandProfilePath = fs.existsSync(brandCandidate) ? brandCandidate : undefined;
        let designIntakePath: string | undefined;
        const intakeCandidate = path.join(project_path, 'rc-method', 'design', 'DESIGN-INTAKE.md');
        if (fs.existsSync(intakeCandidate)) designIntakePath = intakeCandidate;

        const researchResult = await orchestrator.designResearch({
          projectPath: project_path,
          prdContext,
          icpData,
          competitorData,
          brandProfilePath,
          designIntakePath,
        });
        steps.push(`Design Research Brief generated (${researchResult.text.length} chars)`);
        if (researchResult.artifacts) allArtifacts.push(...researchResult.artifacts);

        // Step 3.5: Copy Research + Copy Generation (so wireframes use real copy)
        steps.push('\n---\n\n## Step 3.5: Copy System');
        const copySystemCandidate = path.join(project_path, 'rc-method', 'copy', 'COPY-SYSTEM.md');
        if (!fs.existsSync(copySystemCandidate)) {
          try {
            // Step 3.5a: Copy Research Brief
            const copyResearchInput = {
              projectPath: project_path,
              prdContext,
              icpData,
              competitorData,
              designResearchBrief: researchResult.text,
            };
            const copyResearchResult = await orchestrator.copyResearch(copyResearchInput);
            steps.push(`Copy Research Brief generated`);
            if (copyResearchResult.artifacts) allArtifacts.push(...copyResearchResult.artifacts);

            // Step 3.5b: Copy Generation (needs screen inventory from intake or PRD)
            const briefPath = path.join(project_path, 'rc-method', 'copy', 'COPY-RESEARCH-BRIEF.md');
            if (fs.existsSync(briefPath)) {
              const briefContent = fs.readFileSync(briefPath, 'utf-8');

              // Extract screen inventory from design intake if available
              let screenInventory: string[] = key_screens ?? [];
              if (screenInventory.length === 0) {
                const intakeJsonPath = path.join(project_path, 'rc-method', 'design', 'DESIGN-INTAKE.json');
                if (fs.existsSync(intakeJsonPath)) {
                  try {
                    const intake = JSON.parse(fs.readFileSync(intakeJsonPath, 'utf-8'));
                    screenInventory = intake.extractedConstraints?.screenInventory?.keyScreens ?? [];
                  } catch { /* continue */ }
                }
              }
              // Fallback: extract from PRD
              if (screenInventory.length === 0) {
                screenInventory = ['Landing Page', 'Dashboard', 'Settings'];
              }

              const designBriefPath = path.join(project_path, 'rc-method', 'design', 'DESIGN-RESEARCH-BRIEF.md');
              const designBrief = fs.existsSync(designBriefPath)
                ? fs.readFileSync(designBriefPath, 'utf-8')
                : undefined;

              const copyGenInput = {
                projectPath: project_path,
                copyResearchBrief: briefContent as unknown as import('../copy-types.js').CopyGenerateInput['copyResearchBrief'],
                designResearchBrief: designBrief,
                screenInventory,
              };
              const copyGenResult = await orchestrator.copyGenerate(copyGenInput);
              steps.push(`Copy System generated for ${screenInventory.length} screens`);
              if (copyGenResult.artifacts) allArtifacts.push(...copyGenResult.artifacts);
            }
          } catch (err) {
            steps.push(`Copy generation skipped — ${(err as Error).message}`);
          }
        } else {
          steps.push(`Copy System already exists — skipping`);
        }

        // Step 4: Design Generation
        steps.push('\n---\n\n## Step 4: Design Generation');
        const designInput = {
          projectPath: project_path,
          optionCount: (option_count === '1' ? 1 : 3) as 1 | 3,
          prdContext,
          icpData,
          competitorData,
          inspiration,
          brandProfilePath,
          designIntakePath,
          copySystemPath: fs.existsSync(path.join(project_path, 'rc-method', 'copy', 'COPY-SYSTEM.md'))
            ? path.join(project_path, 'rc-method', 'copy', 'COPY-SYSTEM.md')
            : undefined,
        };
        const designResult = await orchestrator.designGenerate(designInput);
        steps.push(designResult.text);
        if (designResult.artifacts) allArtifacts.push(...designResult.artifacts);

        // Step 4.5: Auto-select recommended design option
        const specPath = path.join(project_path, 'rc-method', 'design', 'DESIGN-SPEC.json');
        if (fs.existsSync(specPath)) {
          try {
            const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
            const recId = spec?.recommendation?.optionId;
            if (recId) {
              orchestrator.designSelect(project_path, recId, specPath);
              steps.push(`\nAuto-selected recommended option: ${recId}`);
            }
          } catch { /* continue without selection */ }
        }

        // Step 5: Design Challenge (optional, default true)
        if (run_challenge !== false) {
          steps.push('\n---\n\n## Step 5: Design Challenge');
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
