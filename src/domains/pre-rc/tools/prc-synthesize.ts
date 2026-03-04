import { LLMProvider } from '../types.js';
import type { StatePersistence } from '../state/state-persistence.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { audit } from '../../../shared/audit.js';
import { recordCost } from '../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../shared/learning.js';
import type { ContextLoader } from '../context-loader.js';
import { generateHtmlPrd, PRDSectionsSchema, type PRDSections } from '../generators/html-prd-generator.js';
import { generateHtmlTaskList, type TaskSections } from '../generators/html-task-generator.js';
import { generatePrdDocx } from '../generators/prd-docx-generator.js';

// ---------------------------------------------------------------------------
// Section-parallel synthesis types and routing table
// Derived from knowledge/pre-rc/templates/synthesis-instructions.md (lines 32-52)
// ---------------------------------------------------------------------------

interface SectionGroup {
  id: string;
  sections: number[];
  sectionTitles: string[];
  personaIds: string[];
  maxTokens: number;
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    id: 'problem-users',
    sections: [1, 2, 3],
    sectionTitles: ['Problem Statement & Introduction', 'Target User & ICP', 'Solution Overview'],
    personaIds: [
      'demand-side-theorist',
      'primary-user-archetype',
      'systems-architect',
      'meta-product-architect',
      'business-model-strategist',
      'gtm-strategist',
      'secondary-edge-user',
      'accessibility-advocate',
      'market-landscape-analyst',
    ],
    maxTokens: 8192,
  },
  {
    id: 'goals-stories',
    sections: [4, 5],
    sectionTitles: ['Goals', 'User Stories'],
    personaIds: [
      'business-model-strategist',
      'meta-product-architect',
      'primary-user-archetype',
      'demand-side-theorist',
      'market-landscape-analyst',
      'secondary-edge-user',
      'cognitive-load-analyst',
    ],
    maxTokens: 6144,
  },
  {
    id: 'features-requirements',
    sections: [6, 7],
    sectionTitles: ['Features', 'Functional Requirements'],
    personaIds: [
      'meta-product-architect',
      'business-model-strategist',
      'systems-architect',
      'token-economics-optimizer',
      'demand-side-theorist',
    ],
    maxTokens: 8192,
  },
  {
    id: 'ux-design',
    sections: [8],
    sectionTitles: ['UX & Design Considerations'],
    personaIds: [
      'ux-systems-designer',
      'cognitive-load-analyst',
      'content-language-strategist',
      'accessibility-advocate',
    ],
    maxTokens: 6144,
  },
  {
    id: 'technical',
    sections: [9, 10],
    sectionTitles: ['Non-Functional Requirements', 'Technical Architecture Notes'],
    personaIds: [
      'systems-architect',
      'security-compliance-analyst',
      'data-telemetry-strategist',
      'ai-ml-specialist',
      'accessibility-advocate',
    ],
    maxTokens: 6144,
  },
  {
    id: 'scope-gtm',
    sections: [11, 12],
    sectionTitles: ['Non-Goals', 'Go-to-Market Strategy'],
    personaIds: [
      'meta-product-architect',
      'token-economics-optimizer',
      'gtm-strategist',
      'business-model-strategist',
      'market-landscape-analyst',
    ],
    maxTokens: 6144,
  },
  {
    id: 'metrics-questions',
    sections: [13, 14],
    sectionTitles: ['Success Metrics', 'Open Questions'],
    personaIds: [
      'data-telemetry-strategist',
      'business-model-strategist',
      'research-program-director',
      'persona-coverage-auditor',
      'market-landscape-analyst',
      'research-synthesis-specialist',
    ],
    maxTokens: 6144,
  },
  {
    id: 'implementation-risks',
    sections: [15, 16, 17],
    sectionTitles: ['Implementation Sequence', 'Risks & Assumptions', 'Dependencies & Integrations'],
    personaIds: [
      'systems-architect',
      'token-economics-optimizer',
      'market-landscape-analyst',
      'security-compliance-analyst',
      'meta-product-architect',
      'secondary-edge-user',
      'gtm-strategist',
      'data-telemetry-strategist',
    ],
    maxTokens: 6144,
  },
];

// ---------------------------------------------------------------------------
// Helper functions for section-parallel synthesis
// ---------------------------------------------------------------------------

/**
 * Extract template sections by number from the PRD template markdown.
 */
function extractTemplateSections(template: string, sectionNumbers: number[]): string {
  const sections: string[] = [];
  for (const num of sectionNumbers) {
    const pattern = new RegExp(`(## ${num}\\..*?)(?=## \\d+\\.|$)`, 's');
    const match = template.match(pattern);
    if (match) {
      sections.push(match[1].trim());
    }
  }
  return sections.join('\n\n---\n\n');
}

/**
 * Extract a single section by number from generated PRD content.
 */
function extractSectionFromContent(content: string, sectionNumber: number): string | null {
  const pattern = new RegExp(`(## ${sectionNumber}\\..*?)(?=## \\d+\\.|$)`, 's');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Build the PRD frontmatter header deterministically (no LLM call).
 */
function buildPrdFrontmatter(state: any, artifacts: any[], researchTokens: number): string {
  const date = new Date().toISOString().split('T')[0];
  return `# PRD: ${state.projectName}

## ${state.projectName}

> **Status:** Draft
> **Created:** ${date}
> **Last Updated:** ${date}
> **Pre-RC Status:** Research + Analysis complete
> **RC Method Phase:** Pre-RC Research -> Define
> **Research Basis:** Pre-RC Research Agent - ${artifacts.length} research specialists, ~${Math.round(researchTokens / 1000)}K AI units
> **Complexity Domain:** ${state.classification?.domain || 'N/A'} | **Product Class:** ${state.classification?.productClass || 'N/A'}

---`;
}

/**
 * Generate sections 18-19 from artifact metadata (no LLM call).
 */
function generateAutoSections(artifacts: any[], state: any, researchTokens: number, prdTokens: number): string {
  const personaRows = artifacts
    .map((a: any) => `| ${a.personaName} | ${a.llmUsed} | ${a.tokenCount.toLocaleString()} | ${a.stage} |`)
    .join('\n');

  const section18 = `## 18. Appendix: Pre-RC Research Summary

| Persona | Provider | Tokens | Stage |
|---------|----------|--------|-------|
${personaRows}

Full research artifacts: \`pre-rc-research/stage-{1-6}/\``;

  const section19 = `## 19. RC Method Metadata

- **Parent PRD:** None (this is the master)
- **Child PRDs:** None yet
- **Phase:** Define (generated from Pre-RC Research)
- **Gate Status:** Gate 3 Approved
- **Research Deliverables:** ${artifacts.length} deliverables from ${artifacts.length} research specialists
- **Research AI Usage:** ${researchTokens.toLocaleString()}
- **Synthesis AI Usage:** ${prdTokens.toLocaleString()}
- **Anti-Pattern Check:** Not yet run

### Pipeline Tracking

| Phase | Status | Tool | Output |
|-------|--------|------|--------|
| **Research** | Complete | Pre-RC Stages 1-5 | ${artifacts.length} specialist deliverables |
| **Analysis** | Complete | Pre-RC Stage 6 + Synthesis | This PRD + task list |
| **Define & Architect** | Pending | RC-Method \`rc_define\` + \`rc_architect\` | Refined PRD + UX child PRD + architecture |
| **Sequence & Build** | Pending | RC-Method \`rc_sequence\` + \`rc_forge\` | Sequenced tasks + implementation |
| **Validate** | Pending | RC-Method \`rc_validate\` | Quality gates + anti-pattern scan |

**Handoff:** This PRD is the Pre-RC output. Feed into RC-Method \`rc_start\` -> \`rc_define\` to continue.`;

  return section18 + '\n\n---\n\n' + section19;
}

/**
 * Synthesize one section group. Filters artifacts by persona, builds a focused
 * prompt, and calls the LLM. Each group runs independently in parallel.
 */
async function synthesizeSectionGroup(
  group: SectionGroup,
  artifacts: any[],
  state: any,
  prdTemplate: string,
  synthesisInstructions: string,
  client: any,
): Promise<{ content: string; tokensUsed: number; provider: LLMProvider }> {
  // Filter artifacts to those relevant to this group
  let relevantArtifacts = artifacts.filter((a: any) => group.personaIds.includes(a.personaId));

  // If no matching artifacts (personas not activated), fall back to all
  if (relevantArtifacts.length === 0) {
    relevantArtifacts = artifacts;
  }

  const researchContext = relevantArtifacts
    .map((a: any) => `## ${a.personaName} (${a.stage})\n\n${a.content}`)
    .join('\n\n---\n\n');

  const templateSections = extractTemplateSections(prdTemplate, group.sections);
  const sectionList = group.sections.map((n, i) => `${n}. ${group.sectionTitles[i]}`).join('\n');

  const prompt = `# Section Group Synthesis: ${group.id}

## Product Brief

**Project:** ${state.brief.name}
${state.brief.rawInput}

## Complexity Classification

Domain: ${state.classification?.domain}
Product Class: ${state.classification?.productClass}

## Relevant Research (${relevantArtifacts.length} specialists)

${researchContext}

## Synthesis Instructions (Key Principles)

${synthesisInstructions}

## Template for These Sections

${templateSections}

## Your Task

Write ONLY these PRD sections:
${sectionList}

Follow the template structure exactly. Each section must start with "## N. Title".
Enrich every section with insights from the research above. Preserve specific numbers, metrics, quotes, and evidence.
Write in plain language for a non-technical product owner. Do not include any other sections.`;

  const response = await client.chatWithRetry(
    {
      systemPrompt: `You are a PRD section writer. Write ONLY the requested PRD sections (${group.sections.join(', ')}). Follow the template structure exactly. Start each section with "## N. Title". Write in plain language for a non-technical product owner.`,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      maxTokens: group.maxTokens,
    },
    1,
  );

  return {
    content: response.content,
    tokensUsed: response.tokensUsed,
    provider: response.provider,
  };
}

// ---------------------------------------------------------------------------
// Main synthesis entry point
// ---------------------------------------------------------------------------

export async function prcSynthesize(
  persistence: StatePersistence,
  llm: LLMFactory,
  ctx: ContextLoader,
  projectPath: string,
  includeTaskDeck?: boolean,
): Promise<string> {
  const stateManager = await persistence.load(projectPath);
  if (!stateManager) {
    throw new Error('Research not initialized. Run prc_start first.');
  }

  const state = stateManager.getState();
  tokenTracker.setProjectPath(projectPath);

  // If synthesis already ran via the graph handler, return cached output
  if (state._synthesisOutput) {
    const output = state._synthesisOutput;
    // Clear transient field after consumption
    state._synthesisOutput = undefined;
    await persistence.save(state);
    return output;
  }

  // Check all gates are approved
  if (!stateManager.isGateApproved(3)) {
    throw new Error('Gate 3 must be approved before synthesis. Run prc_gate.');
  }

  // Load all artifacts
  const artifacts = stateManager.getAllArtifacts();
  if (artifacts.length === 0) {
    throw new Error('No research artifacts found. Run research stages first.');
  }

  // Load synthesis instructions, PRD template, and task list template
  const [synthesisInstructions, prdTemplate, taskListTemplate] = await Promise.all([
    ctx.loadKnowledge('synthesis-instructions.md'),
    ctx.loadKnowledge('prd-template.md'),
    ctx.loadKnowledge('task-list-template.md'),
  ]);

  const researchTokens = artifacts.reduce((s, a) => s + a.tokenCount, 0);

  // Slug for file naming
  const projectSlug = state.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let prdContent: string;
  let prdTokens: number;
  let taskContent: string;
  let taskTokens: number;

  try {
    const client = llm.getClient(LLMProvider.Claude);
    console.error(
      `[prc_synthesize] Parallel synthesis: ${SECTION_GROUPS.length} groups, ${artifacts.length} artifacts`,
    );

    // -----------------------------------------------------------------------
    // Run all section groups in parallel (section-parallel pattern)
    // -----------------------------------------------------------------------
    const groupResults = await Promise.allSettled(
      SECTION_GROUPS.map((group) =>
        synthesizeSectionGroup(group, artifacts, state, prdTemplate, synthesisInstructions, client),
      ),
    );

    // Collect results into a map of section number -> content
    const sectionMap = new Map<number, string>();
    let totalPrdTokens = 0;
    const failedGroups: { group: SectionGroup; reason: string }[] = [];

    for (let i = 0; i < groupResults.length; i++) {
      const result = groupResults[i];
      const group = SECTION_GROUPS[i];

      if (result.status === 'fulfilled') {
        const { content, tokensUsed, provider } = result.value;
        totalPrdTokens += tokensUsed;

        tokenTracker.record('pre-rc', `prc_synthesize:prd:${group.id}`, tokensUsed, provider);
        recordCost({
          pipelineId: 'pre-rc-session',
          domain: 'pre-rc',
          tool: `prc_synthesize:prd:${group.id}`,
          provider,
          model: client.getModel(),
          inputTokens: 0,
          outputTokens: tokensUsed,
        });
        recordModelPerformance({
          provider,
          model: client.getModel(),
          taskType: `prc-synthesize-prd-${group.id}`,
          tokensUsed,
          success: true,
        });

        // Extract individual sections from the group's output
        for (const sectionNum of group.sections) {
          const sectionContent = extractSectionFromContent(content, sectionNum);
          if (sectionContent) {
            sectionMap.set(sectionNum, sectionContent);
          }
        }

        console.error(
          `[prc_synthesize] Group ${group.id} done: ${tokensUsed} tokens, ${group.sections.length} sections`,
        );
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failedGroups.push({ group, reason });
        console.error(`[prc_synthesize] Group ${group.id} failed: ${reason}`);
      }
    }

    // Retry failed groups once individually
    for (const { group } of failedGroups) {
      console.error(`[prc_synthesize] Retrying failed group ${group.id}...`);
      try {
        const retryResult = await synthesizeSectionGroup(
          group,
          artifacts,
          state,
          prdTemplate,
          synthesisInstructions,
          client,
        );
        totalPrdTokens += retryResult.tokensUsed;

        tokenTracker.record(
          'pre-rc',
          `prc_synthesize:prd:${group.id}:retry`,
          retryResult.tokensUsed,
          retryResult.provider,
        );
        recordCost({
          pipelineId: 'pre-rc-session',
          domain: 'pre-rc',
          tool: `prc_synthesize:prd:${group.id}:retry`,
          provider: retryResult.provider,
          model: client.getModel(),
          inputTokens: 0,
          outputTokens: retryResult.tokensUsed,
        });

        for (const sectionNum of group.sections) {
          const sectionContent = extractSectionFromContent(retryResult.content, sectionNum);
          if (sectionContent) {
            sectionMap.set(sectionNum, sectionContent);
          }
        }
        console.error(`[prc_synthesize] Retry succeeded for group ${group.id}`);
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error(`[prc_synthesize] Retry also failed for group ${group.id}: ${msg}`);
      }
    }

    // -----------------------------------------------------------------------
    // Generate auto-sections 18 and 19 (no LLM call)
    // -----------------------------------------------------------------------
    const autoSections = generateAutoSections(artifacts, state, researchTokens, totalPrdTokens);

    // -----------------------------------------------------------------------
    // Assemble the full PRD from parallel results
    // -----------------------------------------------------------------------
    const frontmatter = buildPrdFrontmatter(state, artifacts, researchTokens);
    const assembledSections: string[] = [];

    for (let i = 1; i <= 17; i++) {
      const content = sectionMap.get(i);
      if (content) {
        assembledSections.push(content);
      } else {
        assembledSections.push(`## ${i}. [Section generation failed -- group did not produce this section]`);
      }
    }

    prdContent = frontmatter + '\n\n' + assembledSections.join('\n\n---\n\n') + '\n\n---\n\n' + autoSections;
    prdTokens = totalPrdTokens;

    // Validate section completeness
    let { count: sectionCount, missing: missingSections } = validateSectionCompleteness(prdContent);

    if (missingSections.length > 0) {
      console.error(
        `[prc_synthesize] PRD has ${sectionCount}/19 sections after assembly. Missing: ${missingSections.join(', ')}. Requesting targeted continuation...`,
      );

      // Targeted continuation for just the missing sections
      const missingTitles = missingSections.map((n) => {
        const group = SECTION_GROUPS.find((g) => g.sections.includes(n));
        const idx = group?.sections.indexOf(n) ?? -1;
        return `${n}. ${idx >= 0 ? group!.sectionTitles[idx] : 'Unknown'}`;
      });

      const continuationPrompt = `Write the following missing PRD sections. Follow the template structure exactly.

## Product Brief

**Project:** ${state.brief.name}
${state.brief.rawInput}

## Template Sections Needed

${extractTemplateSections(prdTemplate, missingSections)}

## Sections to Write

${missingTitles.join('\n')}

Write ONLY these sections. Start each with "## N. Title".`;

      try {
        const contResponse = await client.chatWithRetry(
          {
            systemPrompt:
              'You are a PRD section writer. Write ONLY the requested sections. Start each with "## N. Title".',
            messages: [{ role: 'user', content: continuationPrompt }],
            temperature: 0.4,
            maxTokens: 8192,
          },
          1,
        );

        prdContent += '\n\n' + contResponse.content;
        prdTokens += contResponse.tokensUsed;
        tokenTracker.record(
          'pre-rc',
          'prc_synthesize:prd:continuation',
          contResponse.tokensUsed,
          contResponse.provider,
        );
        recordCost({
          pipelineId: 'pre-rc-session',
          domain: 'pre-rc',
          tool: 'prc_synthesize:prd:continuation',
          provider: contResponse.provider,
          model: client.getModel(),
          inputTokens: 0,
          outputTokens: contResponse.tokensUsed,
        });
        console.error(`[prc_synthesize] Continuation added: ${contResponse.tokensUsed} tokens`);

        // Re-validate
        const recheck = validateSectionCompleteness(prdContent);
        sectionCount = recheck.count;
        missingSections = recheck.missing;
      } catch (contErr) {
        const msg = contErr instanceof Error ? contErr.message : String(contErr);
        console.error(`[prc_synthesize] Continuation failed: ${msg}`);
      }
    }

    if (missingSections.length > 0) {
      console.error(
        `[prc_synthesize] WARNING: PRD still has ${sectionCount}/19 sections. Missing: ${missingSections.join(', ')}`,
      );
    } else {
      console.error(`[prc_synthesize] All 19 sections present in PRD.`);
    }

    // Now generate the task list from the PRD
    console.error('[prc_synthesize] Generating task list from PRD...');

    const taskPrompt = `# Task List Generation

## PRD Content

${prdContent}

## Task List Template

${taskListTemplate}

## Your Task

Generate a detailed task list from the PRD above. Follow the task list template structure exactly.

Rules:
- Task 0.0 is always "Project setup" (branch creation + environment verification)
- Parent tasks (1.0, 2.0...) map directly to the PRD's modules from Functional Requirements
- Sub-tasks should be specific enough for an AI coding agent to execute
- Every module gets a testing sub-task
- Final task is integration testing and quality gate (lint, typecheck, build, smoke test)
- Follow the Implementation Sequence from the PRD for task ordering
- Include a "Relevant Files" section listing files that will be created or modified
- Keep sub-tasks to 3-8 per parent task
- Use plain language - describe WHAT to do, not HOW

Output ONLY the markdown task list, nothing else.`;

    const taskResponse = await client.chatWithRetry(
      {
        systemPrompt:
          'You are a task list generator. Your job is to break down a PRD into actionable, step-by-step implementation tasks. Write for someone who uses AI coding tools to build - be explicit about what needs to happen, but not how to code it.',
        messages: [{ role: 'user', content: taskPrompt }],
        temperature: 0.3,
        maxTokens: 4096,
      },
      1,
    );

    taskContent = taskResponse.content;
    taskTokens = taskResponse.tokensUsed;
    tokenTracker.record('pre-rc', 'prc_synthesize:tasks', taskTokens, taskResponse.provider);
    recordCost({
      pipelineId: 'pre-rc-session',
      domain: 'pre-rc',
      tool: 'prc_synthesize:tasks',
      provider: taskResponse.provider,
      model: client.getModel(),
      inputTokens: 0,
      outputTokens: taskTokens,
    });
    recordModelPerformance({
      provider: taskResponse.provider,
      model: client.getModel(),
      taskType: 'prc-synthesize-tasks',
      tokensUsed: taskTokens,
      success: true,
    });
    console.error(`[prc_synthesize] Task list generation succeeded: ${taskTokens} tokens`);
  } catch (err) {
    // Autonomous synthesis failed -- fall back to passthrough with clear reason.
    // Build the monolithic prompt lazily here (only needed for passthrough).
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[prc_synthesize] PASSTHROUGH TRIGGERED - Autonomous synthesis failed: ${errMsg}`);

    const researchContext = artifacts
      .map((a) => `## ${a.personaName} (${a.stage})\n\n${a.content}`)
      .join('\n\n---\n\n');

    const synthesisPrompt = `# Synthesis Task

## Product Brief

**Project:** ${state.brief.name}
${state.brief.rawInput}

## Complexity Classification

Domain: ${state.classification?.domain}
Product Class: ${state.classification?.productClass}

## All Research Artifacts (${artifacts.length} specialists)

${researchContext}

## Instructions

${synthesisInstructions}

## PRD Template

${prdTemplate}

## Your Task

Synthesize ALL the research above into a single, comprehensive PRD following the template structure. You MUST include ALL 19 sections. Every section should be enriched by the relevant persona research.

Save the PRD to: pre-rc-research/prd-${projectSlug}.md
Save the task list to: pre-rc-research/tasks-${projectSlug}.md`;

    return `## PRD Synthesis - Manual Mode

> **Why manual mode?** Automatic synthesis failed after retries: ${errMsg}

Please synthesize manually using the prompt below.

${synthesisPrompt}

Save the PRD to: pre-rc-research/prd-${projectSlug}.md
Save the task list to: pre-rc-research/tasks-${projectSlug}.md`;
  }

  // Save the PRD
  const prdPath = `prd-${projectSlug}.md`;
  await persistence.writeArtifact(projectPath, prdPath, prdContent);

  // Save the task list
  const taskPath = `tasks-${projectSlug}.md`;
  if (taskContent) {
    await persistence.writeArtifact(projectPath, taskPath, taskContent);
  }

  // Generate research index
  const indexContent = buildResearchIndex(state);
  await persistence.writeArtifact(projectPath, 'RESEARCH-INDEX.md', indexContent);

  // Generate HTML consulting deck
  let htmlDeckPath = '';
  try {
    console.error('[prc_synthesize] Generating HTML consulting deck...');
    const client = llm.getClient(LLMProvider.Claude);

    const parsePrompt = `Parse the following PRD markdown into a structured JSON object that matches the PRDSections interface below. Return ONLY valid JSON, no markdown fences.

## Interface
{
  "execSummary": {
    "recommendation": "string - the strategic recommendation paragraph",
    "metrics": [{ "label": "string", "value": "string", "target": "string" }],
    "painPoints": ["string - each as an HTML string with <strong> for emphasis"],
    "keyInsight": "string"
  },
  "icp": {
    "rows": [{ "label": "string", "value": "string" }],
    "persona": { "name": "string", "title": "string", "description": "string" },
    "painPoints": [{ "title": "string", "detail": "string" }],
    "behavioralTraits": [{ "title": "string", "detail": "string" }],
    "secondaryUsers": "string",
    "accessibility": ["string"]
  },
  "solution": {
    "overview": "string",
    "currentState": "string",
    "targetState": "string",
    "phases": [{ "phase": "string", "weeks": "string", "scope": "string", "rollout": "string" }],
    "costImpact": [{ "item": "string", "current": "string", "projected": "string", "delta": "string", "deltaColor": "string (#2A7D2E for savings, #C4952B for increase)" }],
    "rollbackNote": "string"
  },
  "goals": [{ "id": "string", "goal": "string", "baseline": "string", "target": "string" }],
  "userStoryGroups": [{ "category": "string", "stories": [{ "id": "string", "story": "string", "criteria": "string" }] }],
  "features": [{ "name": "string", "priority": "Must|Should|Could", "effort": "High|Medium|Low", "module": "string" }],
  "requirementModules": [{ "id": "string (A,B,C...)", "name": "string", "requirements": [{ "id": "string (FR-A1)", "requirement": "string" }] }],
  "ux": { "surfaces": ["string"], "flows": [{ "title": "string", "description": "string - can include HTML arrows and breaks" }] },
  "risks": [{ "risk": "string", "likelihood": "Low|Medium|High", "impact": "Low|Medium|High|Critical", "mitigation": "string" }],
  "methodology": { "researchScope": "string", "nextSteps": "string" }
}

## PRD Content

${prdContent}

Return ONLY the JSON object. No explanation, no markdown fences.`;

    const prdSections = await parseJsonWithRetry<PRDSections>(client, parsePrompt, PRDSectionsSchema, 'PRD sections');

    // Auto-populate RC Method Metadata from state
    prdSections.rcMethodMetadata = {
      phase: 'Pre-RC Research Complete',
      gateStatus: 'Gate 3 Approved',
      researchArtifactCount: artifacts.length,
      personaCount: artifacts.length,
      tokenCount: researchTokens,
      handoffInstructions: `Feed this PRD into RC Method via rc_import_prerc("${projectPath}") or rc_start → rc_define. All ${artifacts.length} research specialist deliverables are available in pre-rc-research/.`,
    };

    const htmlContent = generateHtmlPrd(state, prdSections);
    const htmlPath = `prd-${projectSlug}.html`;
    await persistence.writeArtifact(projectPath, htmlPath, htmlContent);
    htmlDeckPath = htmlPath;

    console.error(`[prc_synthesize] HTML consulting deck generated: ${htmlPath}`);
  } catch (htmlErr) {
    const errMsg = htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
    console.error(`[prc_synthesize] HTML deck generation failed (non-blocking): ${errMsg}`);
  }

  // Generate HTML task list deck (optional)
  let taskDeckPath = '';
  if (includeTaskDeck && taskContent) {
    try {
      console.error('[prc_synthesize] Generating HTML task list deck...');
      const client = llm.getClient(LLMProvider.Claude);

      const taskParsePrompt = `Parse the following task list markdown into a structured JSON object that matches the TaskSections interface below. Return ONLY valid JSON, no markdown fences.

## Interface
{
  "title": "string - the document title from the H1 heading",
  "generatedFrom": "string - the PRD file name from the 'Generated from' line",
  "createdDate": "string - the creation date",
  "relevantFiles": [
    {
      "category": "string - category heading (e.g. 'Database & Models', 'API Routes')",
      "files": [
        { "path": "string - file path", "description": "string - what this file does" }
      ]
    }
  ],
  "phases": [
    {
      "id": "string - e.g. 'Phase 1' or 'Setup'",
      "name": "string - phase name (e.g. 'Foundation & Database Schema')",
      "timeline": "string - timeline if mentioned (e.g. 'Week 1'), empty string if not",
      "tasks": [
        {
          "id": "string - parent task ID (e.g. '1.0')",
          "name": "string - parent task name",
          "subtasks": [
            { "id": "string - subtask ID (e.g. '1.1')", "description": "string - what to do" }
          ]
        }
      ]
    }
  ]
}

Rules:
- Task 0.0 (Project setup) goes into its own phase with id "Setup" and name "Project Setup"
- Group remaining tasks by the markdown phase headings (## Phase 1: ..., ## Phase 2: ...)
- Extract timeline from phase headings if present (e.g. "(Week 1)" -> "Week 1")
- Each parent task (e.g. "- [ ] 1.0 Database schema updates") becomes a task entry
- Each indented sub-task (e.g. "  - [ ] 1.1 Add source field") becomes a subtask
- For relevant files, group by the ### sub-headings under ## Relevant Files

## Task List Content

${taskContent}

Return ONLY the JSON object. No explanation, no markdown fences.`;

      const taskSections = await parseJsonWithRetry<TaskSections>(
        client,
        taskParsePrompt,
        null, // No Zod schema for tasks yet - just validate JSON parse
        'task sections',
      );

      const taskHtmlContent = generateHtmlTaskList(state, taskSections);
      const taskHtmlPath = `tasks-${projectSlug}.html`;
      await persistence.writeArtifact(projectPath, taskHtmlPath, taskHtmlContent);
      taskDeckPath = taskHtmlPath;

      console.error(`[prc_synthesize] HTML task list deck generated: ${taskHtmlPath}`);
    } catch (taskHtmlErr) {
      const errMsg = taskHtmlErr instanceof Error ? taskHtmlErr.message : String(taskHtmlErr);
      console.error(`[prc_synthesize] HTML task list deck failed (non-blocking): ${errMsg}`);
    }
  }

  // Generate McKinsey-format Word document from PRD
  let docxPath = '';
  if (prdContent) {
    try {
      console.error('[prc_synthesize] Generating McKinsey-format docx from PRD...');
      const docxFilename = `${state.projectName.replace(/[^a-zA-Z0-9]+/g, '_')}_PRD.docx`;
      docxPath = `${projectPath}/pre-rc-research/${docxFilename}`;

      await generatePrdDocx(
        {
          projectName: state.projectName,
          prdContent,
          researchTokens,
          synthesisTokens: prdTokens + taskTokens,
          personaCount: artifacts.length,
          stageCount: new Set(artifacts.map((a) => a.stage)).size,
          cynefinDomain: state.classification?.domain,
          productClass: state.classification?.productClass,
        },
        docxPath,
      );
      console.error(`[prc_synthesize] Docx generated: ${docxPath}`);
    } catch (docxErr) {
      const msg = docxErr instanceof Error ? docxErr.message : String(docxErr);
      console.error(`[prc_synthesize] Docx generation failed (non-fatal): ${msg}`);
      docxPath = '';
    }
  }

  // Update state
  await persistence.save(stateManager.getState());
  audit('artifact.create', 'pre-rc', projectPath, { type: 'prd', sections: 19 }, 'synthesis');

  // Section completeness for output
  const { count: finalSectionCount, missing: finalMissing } = validateSectionCompleteness(prdContent);
  const sectionStatus =
    finalMissing.length === 0
      ? `All 19 sections present`
      : `${finalSectionCount}/19 sections (missing: ${finalMissing.join(', ')})`;

  // Estimate cost from token usage (rough: $0.003/1K input, $0.015/1K output -- blended ~$0.008/1K)
  const totalTokens = researchTokens + prdTokens + taskTokens;
  const estimatedCost = (totalTokens / 1000) * 0.008;

  const webGroundedSpecialists = artifacts.filter((a) =>
    ['market-landscape-analyst', 'business-model-strategist', 'gtm-strategist', 'security-compliance-analyst'].includes(
      a.personaId,
    ),
  );

  return `**Research complete!** Here are your deliverables:

1. **Requirements Document** -- ${sectionStatus} covering your users, market, security, and UX
2. **Visual Presentation** -- ${htmlDeckPath ? 'HTML deck ready for stakeholders' : 'Markdown format available'}
3. **Task Breakdown** -- Prioritized implementation tasks with effort estimates
4. **Research Index** -- Full breakdown of specialist contributions

### Research Summary

- **${artifacts.length} specialists** contributed across ${new Set(artifacts.map((a) => a.stage)).size} research areas
- **${totalTokens.toLocaleString()} AI units** used (estimated cost: ~$${estimatedCost.toFixed(2)})${webGroundedSpecialists.length > 0 ? `\n- **${webGroundedSpecialists.length} specialists** used live web data for market research` : ''}

### What's next?

You can:
- **Continue to build** -- I'll convert this research into a build plan with architecture and task planning
- **Review first** -- Take time to read through the deliverables
- **Stop here** -- The requirements document is a complete standalone document`;
}

/**
 * Extract JSON from LLM response, stripping markdown fences if present.
 */
function extractJson(raw: string): string {
  let str = raw.trim();
  // Strip markdown code fences
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  // Strip any leading/trailing text outside the JSON object
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.slice(firstBrace, lastBrace + 1);
  }
  return str;
}

/**
 * Parse JSON from LLM with retry on failure and optional Zod validation.
 * - Attempt 1: parse + validate
 * - Attempt 2 (on failure): re-prompt with lower temperature + error details
 */
async function parseJsonWithRetry<T>(
  client: any,
  prompt: string,
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: any } } | null,
  label: string,
): Promise<T> {
  const attempts = [
    { temperature: 0.1, isRetry: false },
    { temperature: 0.05, isRetry: true },
  ];

  let lastError = '';

  for (const { temperature, isRetry } of attempts) {
    try {
      const retryPrefix = isRetry
        ? `IMPORTANT: Your previous response was not valid JSON. Error: ${lastError}\n\nPlease return ONLY a valid JSON object with no extra text.\n\n`
        : '';

      const response = await client.chatWithRetry(
        {
          systemPrompt:
            'You are a JSON extraction specialist. Return ONLY valid JSON with no markdown fences, no explanation. Ensure all strings are properly escaped and all arrays/objects are properly closed.',
          messages: [{ role: 'user', content: retryPrefix + prompt }],
          temperature,
          maxTokens: 16384,
        },
        1,
      );

      tokenTracker.record('pre-rc', `prc_synthesize:json_parse_${label}`, response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'pre-rc-session',
        domain: 'pre-rc',
        tool: `prc_synthesize:json_parse_${label}`,
        provider: response.provider,
        model: client.getModel ? client.getModel() : 'unknown',
        inputTokens: 0,
        outputTokens: response.tokensUsed,
      });
      recordModelPerformance({
        provider: response.provider,
        model: client.getModel ? client.getModel() : 'unknown',
        taskType: `prc-synthesize-json-${label}`,
        tokensUsed: response.tokensUsed,
        success: true,
      });

      const jsonStr = extractJson(response.content);
      const parsed = JSON.parse(jsonStr);

      // If a Zod schema is provided, validate and use defaults
      if (schema) {
        const result = schema.safeParse(parsed);
        if (!result.success) {
          const issues = result.error.issues
            .slice(0, 5)
            .map((i: any) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          console.error(`[prc_synthesize] ${label} Zod validation issues (applying defaults): ${issues}`);
        }
        return result.success ? (result.data as T) : parsed;
      }

      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[prc_synthesize] ${label} JSON parse ${isRetry ? 'retry' : 'attempt 1'} failed: ${lastError}`);
      if (isRetry) {
        throw new Error(`Failed to parse ${label} JSON after 2 attempts: ${lastError}`, { cause: err });
      }
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error(`Failed to parse ${label} JSON`);
}

/**
 * Count the number of numbered sections (## N. Title) in PRD markdown.
 * Returns both the count and the missing section numbers.
 */
function validateSectionCompleteness(prdContent: string): { count: number; missing: number[] } {
  const found = new Set<number>();
  for (const match of prdContent.matchAll(/^##\s+(\d+)\.\s+/gm)) {
    found.add(parseInt(match[1], 10));
  }
  const missing: number[] = [];
  for (let i = 1; i <= 19; i++) {
    if (!found.has(i)) missing.push(i);
  }
  return { count: found.size, missing };
}

function buildResearchIndex(state: any): string {
  const lines: string[] = [];
  lines.push(`# Research Index: ${state.projectName}\n`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Pre-RC Status:** Research + Analysis complete`);
  lines.push(`**Complexity Domain:** ${state.classification?.domain || 'N/A'}`);
  lines.push(`**Product Class:** ${state.classification?.productClass || 'N/A'}`);
  lines.push(`**Total Deliverables:** ${state.artifacts.length}`);

  const totalTokens = state.artifacts.reduce((s: number, a: any) => s + (a.tokenCount || 0), 0);
  lines.push(`**Total Research AI Usage:** ${totalTokens.toLocaleString()}\n`);

  lines.push('## AI Usage Summary\n');
  lines.push('| Stage | Phase | Specialists | AI Usage | % of Total |');
  lines.push('|-------|-------|-------------|----------|------------|');

  const byStage = new Map<string, any[]>();
  for (const a of state.artifacts) {
    const list = byStage.get(a.stage) || [];
    list.push(a);
    byStage.set(a.stage, list);
  }

  const phaseLabels: Record<string, string> = {
    'stage-1-meta': 'Research',
    'stage-2-user-intelligence': 'Research',
    'stage-3-business-market': 'Research',
    'stage-4-technical': 'Research',
    'stage-5-ux': 'Research',
    'stage-6-validation': 'Analysis',
  };

  for (const [stage, arts] of byStage) {
    const stageTokens = arts.reduce((s: number, a: any) => s + (a.tokenCount || 0), 0);
    const pct = totalTokens > 0 ? ((stageTokens / totalTokens) * 100).toFixed(1) : '0';
    const phase = phaseLabels[stage] || '--';
    lines.push(`| ${stage} | ${phase} | ${arts.length} | ${stageTokens.toLocaleString()} | ${pct}% |`);
  }
  lines.push('');

  lines.push('## Deliverables by Stage\n');

  for (const [stage, arts] of byStage) {
    lines.push(`### ${stage}\n`);
    for (const a of arts) {
      const webLabel = [
        'market-landscape-analyst',
        'business-model-strategist',
        'gtm-strategist',
        'security-compliance-analyst',
      ].includes(a.personaId)
        ? ' [WEB-GROUNDED]'
        : '';
      lines.push(`- **${a.personaName}** (${a.llmUsed}) - ${a.tokenCount.toLocaleString()} AI units${webLabel}`);
      lines.push(`  File: \`${a.filePath}\``);
    }
    lines.push('');
  }

  lines.push('## Checkpoints\n');
  for (const g of state.gates) {
    lines.push(`- Checkpoint ${g.gateNumber}: ${g.status} (${g.timestamp})`);
  }

  return lines.join('\n');
}
