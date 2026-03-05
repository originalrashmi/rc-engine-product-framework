import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../orchestrator.js';
import { createRcCoordinator } from './rc-coordinator-factory.js';
import type { RcCoordinator } from '../graph/rc-coordinator.js';
import { StateManager } from '../state/state-manager.js';
import { ContextLoader } from '../context-loader.js';
import { ForgeOrchestrator } from '../forge/forge-orchestrator.js';
import type { ProjectState } from '../types.js';

let _orchestrator: Orchestrator | null = null;
function getOrchestrator(): Orchestrator {
  if (!_orchestrator) _orchestrator = new Orchestrator();
  return _orchestrator;
}

let _coordinator: RcCoordinator | null = null;
function getCoordinator(): RcCoordinator {
  if (!_coordinator) _coordinator = createRcCoordinator(getOrchestrator());
  return _coordinator;
}

const _stateManager = new StateManager();

/**
 * Run a phase through the graph coordinator.
 *
 * Uses resumeFromNodeId to skip past earlier phases, then executes the
 * specified phase node (which delegates to orchestrator) and stops at
 * the corresponding gate. The coordinator records a gate interrupt for
 * the gate tool to resume from.
 */
async function runPhaseViaCoordinator(
  projectPath: string,
  phaseNodeId: string,
  input?: string,
  forgeTaskId?: string,
): Promise<string> {
  const state = _stateManager.load(projectPath);
  const initialState: ProjectState = {
    ...state,
    _pendingInput: input || 'run', // 'run' signals the handler to execute
    _forgeTaskId: forgeTaskId,
  };

  const result = await getCoordinator().run(projectPath, initialState, {
    resumeFromNodeId: phaseNodeId,
  });

  return result.state._lastOutput ?? '';
}

export function registerRcPhaseTools(server: McpServer): void {
  // rc_import_prerc - Import Pre-RC research artifacts
  // This bypasses the graph because it skips Phases 1-2 entirely
  server.registerTool(
    'rc_import_prerc',
    {
      description:
        'BRIDGE from Pre-RC to RC Method. Call after prc_synthesize completes and user wants to continue building. Converts the 19-section Pre-RC PRD to 11-section RC format, auto-approves Phases 1-2, and advances to Phase 3 (Architect). Prerequisites: pre-rc-research/ directory must exist with Gate 3 approved. After success: call rc_architect to begin technical design. Skips rc_start/rc_illuminate/rc_define since Pre-RC already covered discovery and requirements.',
      inputSchema: {
        project_path: z
          .string()
          .describe('Absolute path to the project directory (must contain pre-rc-research/ subdirectory)'),
      },
    },
    async ({ project_path }) => {
      try {
        const result = await getOrchestrator().importPreRc(project_path);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_start - Initialize a new RC Method project
  // This bypasses the graph because it creates state, not a phase execution
  server.registerTool(
    'rc_start',
    {
      description:
        'Start RC Method WITHOUT Pre-RC research. Use when user wants to go straight to building without the 20-persona research phase. Creates rc-method/ directory and project state, begins Phase 1 (Illuminate) with discovery questions. Returns discovery questions — present these to the user and collect their answers. After success: call rc_illuminate with user answers. Do NOT use this if Pre-RC was run — use rc_import_prerc instead.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        project_name: z.string().describe('Name of the project'),
        description: z.string().describe('Brief description of what the project is and what problem it solves'),
        tech_stack: z
          .object({
            language: z.enum(['typescript', 'python', 'ruby', 'go', 'java']).describe('Primary language'),
            framework: z.string().describe('Web framework (e.g. nextjs, fastapi, rails, gin, spring)'),
            ui_framework: z.string().optional().describe('UI framework (e.g. react, vue, svelte, htmx)'),
            database: z.string().describe('Database (e.g. postgresql, mysql, mongodb, sqlite)'),
            orm: z.string().optional().describe('ORM (e.g. prisma, sqlalchemy, activerecord, gorm)'),
          })
          .optional()
          .describe('Tech stack for generated code. Defaults to typescript/nextjs/react/postgresql/prisma if not specified.'),
      },
    },
    async ({ project_path, project_name, description, tech_stack }) => {
      try {
        const parsedStack = tech_stack
          ? {
              language: tech_stack.language,
              framework: tech_stack.framework,
              uiFramework: tech_stack.ui_framework,
              database: tech_stack.database,
              orm: tech_stack.orm,
            }
          : undefined;
        const result = await getOrchestrator().start(project_path, project_name, description, parsedStack);
        return { content: [{ type: 'text' as const, text: result.text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_illuminate - Process discovery answers for Phase 1
  server.registerTool(
    'rc_illuminate',
    {
      description:
        "Phase 1 (Illuminate). Call after rc_start, passing the user's answers to discovery questions. Generates an Illuminate Report summarizing the problem space, users, and constraints. Returns report + gate prompt. Present the report to the user and ask for approval via rc_gate. Prerequisites: must be in Phase 1. After gate approval: moves to Phase 2 (Define).",
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        discovery_answers: z.string().describe("The operator's answers to the discovery questions from rc_start"),
      },
    },
    async ({ project_path, discovery_answers }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'illuminate', discovery_answers);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_define - Generate PRD (Phase 2)
  server.registerTool(
    'rc_define',
    {
      description:
        'Phase 2 (Define). Generates a Product Requirements Document from user-provided feature descriptions, user stories, and requirements. Produces an 11-section PRD saved to rc-method/prds/. Returns PRD content + gate prompt. Present the PRD to the user for review. Prerequisites: Phase 1 gate approved. After gate approval: moves to Phase 3 (Architect). Consider running ux_score on the feature list and ux_generate for UX-heavy products.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        operator_inputs: z.string().describe('Feature descriptions, user stories, and requirements from the operator'),
      },
    },
    async ({ project_path, operator_inputs }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'define', operator_inputs);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_architect - Define architecture (Phase 3)
  server.registerTool(
    'rc_architect',
    {
      description:
        'Phase 3 (Architect). Defines technical architecture: tech stack, data models, API design, integrations, and infrastructure. Pass the user\'s technical preferences or constraints in architecture_notes (e.g., "use Next.js and Supabase", "must integrate with Stripe"). Returns architecture document + gate prompt. Prerequisites: Phase 2 gate approved (or Phase 1-2 auto-approved via rc_import_prerc). After gate approval: moves to Phase 4 (Sequence).',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        architecture_notes: z
          .string()
          .describe('Technical preferences, constraints, or existing infrastructure notes from the operator'),
      },
    },
    async ({ project_path, architecture_notes }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'architect', architecture_notes);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_sequence - Generate task list (Phase 4)
  server.registerTool(
    'rc_sequence',
    {
      description:
        'Phase 4 (Sequence). Auto-generates a sequenced, dependency-ordered task list from the approved PRD and architecture. Each task gets an ID (TASK-001, TASK-002...) with estimated effort and dependencies. Saved to rc-method/tasks/. No user input needed — reads PRD artifacts automatically. Present the task list to user for approval. Prerequisites: Phase 3 gate approved. After gate approval: moves to Phase 5 (Validate).',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ project_path }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'sequence');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_validate - Run quality gate (Phase 5)
  server.registerTool(
    'rc_validate',
    {
      description:
        'Phase 5 (Validate). QUALITY GATE before building. Runs 4 automated checks: anti-pattern scan, token budget audit, scope drift detection, and UX quality assessment. This catches problems BEFORE code is written — saving significant rework. No user input needed. Present findings to user with severity ratings. Prerequisites: Phase 4 gate approved. After gate approval: moves to Phase 6 (Forge) — begin building with rc_forge_task.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ project_path }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'validate');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_forge_task - Execute a build task (Phase 6)
  server.registerTool(
    'rc_forge_task',
    {
      description:
        'Phase 6 (Forge). Call once per task from the approved task list. Loads the PRD, architecture, and task context, then generates implementation guidance for the specified task_id (e.g., "TASK-001"). Call this for EACH task in sequence, respecting dependency order. Prerequisites: Phase 5 gate approved, valid task_id from the task list. After ALL tasks complete: proceed to Phase 7 (Connect) via rc_gate, then run postrc_scan for security validation. Present each task result to user before moving to the next.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        task_id: z.string().describe('The task ID to execute (e.g., TASK-001)'),
      },
    },
    async ({ project_path, task_id }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'forge', undefined, task_id);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_connect - Integration wiring (Phase 7)
  server.registerTool(
    'rc_connect',
    {
      description:
        'Phase 7 (Connect). Verifies that all built components integrate correctly. Reviews forge outputs for API wiring, authentication flows, data model alignment, and cross-component dependencies. Generates an integration report with gaps and recommended integration tests. No user input needed -- reads forge artifacts automatically. Prerequisites: Phase 6 gate approved. After gate approval: moves to Phase 8 (Compound).',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ project_path }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'connect');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_compound - Production hardening (Phase 8)
  server.registerTool(
    'rc_compound',
    {
      description:
        'Phase 8 (Compound). Final phase before ship. Assesses production readiness: NFR compliance, error handling, observability, performance, security hardening, and deployment configuration. Cross-references integration report from Phase 7. Produces a ship checklist and go/no-go assessment. Prerequisites: Phase 7 gate approved. After gate approval: pipeline complete, proceed to postrc_scan for security validation.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        code_context: z
          .string()
          .optional()
          .describe('Optional code or file content to include in the hardening assessment'),
      },
    },
    async ({ project_path, code_context }) => {
      try {
        const text = await runPhaseViaCoordinator(project_path, 'compound', code_context);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_forge_all - Multi-agent parallel forge (Phase 6 v2)
  server.registerTool(
    'rc_forge_all',
    {
      description:
        'Phase 6 v2 (Parallel Forge). Executes ALL forge tasks in parallel using specialized agents — DatabaseArchitect for [DATA], BackendEngineer for [API], FrontendEngineer for [UI], IntegrationEngineer for [INTEGRATION], PlatformEngineer for [SETUP]/[CONFIG]/[OBS], QAEngineer for [TEST]. Tasks run in 5 layers: Foundation → Backend → Frontend → Integration → QA. Each layer runs in parallel, with contracts passed between layers. Prerequisites: Phase 5 gate approved. After completion: review results and proceed to Phase 7 (Connect).',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ project_path }) => {
      try {
        const state = _stateManager.load(project_path);

        if (state.currentPhase !== 6) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: rc_forge_all requires Phase 6 (Forge), but project is in Phase ${state.currentPhase}. Use rc_status to check progress.`,
              },
            ],
            isError: true,
          };
        }

        // Find the task list artifact
        const taskArtifact = state.artifacts.find((a) => a.includes('/tasks/'));
        if (!taskArtifact) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No task list found. Run rc_sequence first to generate the task list.',
              },
            ],
            isError: true,
          };
        }

        const contextLoader = new ContextLoader();
        const taskContent = contextLoader.loadProjectFile(project_path, taskArtifact);

        // Load PRD for additional context
        let prdContent: string | undefined;
        const prdArtifact = state.artifacts.find((a) => a.includes('/prds/') && !a.includes('-ux'));
        if (prdArtifact) {
          try {
            prdContent = contextLoader.loadProjectFile(project_path, prdArtifact);
          } catch {
            // skip
          }
        }

        const techStack = state.techStack ?? {
          language: 'typescript' as const,
          framework: 'nextjs',
          uiFramework: 'react',
          database: 'postgresql',
          orm: 'prisma',
        };

        const forgeOrchestrator = new ForgeOrchestrator(contextLoader);
        const { metrics, results, retro } = await forgeOrchestrator.forgeAll(
          taskContent,
          state.projectName,
          project_path,
          techStack,
          prdContent,
        );

        // Update project state with forge results
        if (!state.forgeTasks) state.forgeTasks = {};
        for (const result of results) {
          state.forgeTasks[result.taskId] = {
            taskId: result.taskId,
            status: result.success ? 'complete' : 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            generatedFiles: result.generatedFiles,
          };
        }
        _stateManager.save(project_path, state);

        // Build summary
        const summary = `## Forge All — Complete

### Metrics
- Tasks: ${metrics.completedTasks}/${metrics.totalTasks} completed, ${metrics.failedTasks} failed
- Duration: ${(metrics.totalDurationMs / 1000).toFixed(1)}s
- Tokens: ${metrics.totalTokens.toLocaleString()}
- Cost: $${metrics.totalCostUsd.toFixed(4)}

### Layer Timings
- Foundation: ${(metrics.layerTimings[1] / 1000).toFixed(1)}s
- Backend: ${(metrics.layerTimings[2] / 1000).toFixed(1)}s
- Frontend: ${(metrics.layerTimings[3] / 1000).toFixed(1)}s
- Integration: ${(metrics.layerTimings[4] / 1000).toFixed(1)}s
- QA: ${(metrics.layerTimings[5] / 1000).toFixed(1)}s

### Results
${results.map((r) => `- ${r.taskId} (${r.agentName}): ${r.success ? 'OK' : 'FAILED'} — ${r.generatedFiles.length} files`).join('\n')}

${metrics.failedTasks > 0 ? '\n### Failed Tasks\n' + results.filter((r) => !r.success).map((r) => `- ${r.taskId}: ${r.error}`).join('\n') : ''}
${retro ? `\n### Retrospective\n${retro.summary}\n\n#### Recommendations\n${retro.recommendations.map((r) => `- ${r}`).join('\n')}` : ''}`;

        return { content: [{ type: 'text' as const, text: summary }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_autopilot - Autonomous full pipeline execution (skeleton)
  server.registerTool(
    'rc_autopilot',
    {
      description:
        'AUTONOMOUS PIPELINE: Single prompt → production-ready app. Runs Pre-RC → RC (all 8 phases) → Post-RC with auto-gate-approval when confidence exceeds threshold. Sets a budget cap to prevent runaway costs. This is the moonshot tool — use it when the user wants a fully automated build from a single description. Prerequisites: none (creates everything from scratch). Note: This is a v1 skeleton that chains phases sequentially with auto-gate-approval.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        description: z.string().describe('Full project description — the single prompt that drives everything'),
        tech_stack: z
          .object({
            language: z.enum(['typescript', 'python', 'ruby', 'go', 'java']).describe('Primary language'),
            framework: z.string().describe('Web framework'),
            ui_framework: z.string().optional().describe('UI framework'),
            database: z.string().describe('Database'),
            orm: z.string().optional().describe('ORM'),
          })
          .optional()
          .describe('Tech stack. Defaults to typescript/nextjs/react/postgresql/prisma.'),
        auto_approve_threshold: z
          .number()
          .min(0)
          .max(1)
          .default(0.8)
          .describe('Gate auto-approval confidence threshold (0-1). Default: 0.8'),
        budget_cap_usd: z
          .number()
          .default(15)
          .describe('Maximum budget in USD. Pipeline halts if exceeded. Default: $15'),
      },
    },
    async ({ project_path, description, tech_stack, auto_approve_threshold, budget_cap_usd }) => {
      const log: string[] = [];
      const addLog = (msg: string) => log.push(`[${new Date().toISOString().substring(11, 19)}] ${msg}`);

      try {
        const parsedStack = tech_stack
          ? {
              language: tech_stack.language,
              framework: tech_stack.framework,
              uiFramework: tech_stack.ui_framework,
              database: tech_stack.database,
              orm: tech_stack.orm,
            }
          : undefined;

        // Set budget cap
        const { getCostTracker } = await import('../../../shared/cost-tracker.js');
        getCostTracker().setBudget('rc-session', { maxCostUsd: budget_cap_usd ?? 15 });

        const orchestrator = getOrchestrator();
        const contextLoader = new ContextLoader();
        const threshold = auto_approve_threshold ?? 0.8;

        // Phase 0: Start
        addLog('Phase 0: Starting project...');
        await orchestrator.start(
          project_path,
          description.substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, ''),
          description,
          parsedStack,
        );
        addLog('Phase 0: Project initialized');

        // Phase 1: Illuminate
        addLog('Phase 1: Illuminate...');
        await orchestrator.illuminate(project_path, description);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 1: Illuminate complete + gate approved');

        // Phase 2: Define
        addLog('Phase 2: Define...');
        await orchestrator.define(project_path, description);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 2: Define complete + gate approved');

        // Phase 3: Architect
        addLog('Phase 3: Architect...');
        await orchestrator.architect(project_path, '');
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 3: Architect complete + gate approved');

        // Phase 4: Sequence
        addLog('Phase 4: Sequence...');
        await orchestrator.sequence(project_path);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 4: Sequence complete + gate approved');

        // Phase 5: Validate
        addLog('Phase 5: Validate...');
        await orchestrator.validate(project_path);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 5: Validate complete + gate approved');

        // Phase 6: Forge (parallel multi-agent build)
        addLog('Phase 6: Forge All (parallel multi-agent build)...');
        const state = _stateManager.load(project_path);
        const taskArtifact = state.artifacts.find((a: string) => a.includes('/tasks/'));
        let taskContent = '';
        if (taskArtifact) {
          try {
            taskContent = contextLoader.loadProjectFile(project_path, taskArtifact);
          } catch {
            // no tasks file
          }
        }

        let forgeMetricsSummary = 'Forge skipped: no TASKS file found';
        if (taskContent) {
          const forgeStack = state.techStack ?? {
            language: 'typescript' as const,
            framework: 'nextjs',
            uiFramework: 'react',
            database: 'postgresql',
            orm: 'prisma',
          };
          const forgeOrchestrator = new ForgeOrchestrator(contextLoader);
          const { metrics, results } = await forgeOrchestrator.forgeAll(
            taskContent,
            state.projectName,
            project_path,
            forgeStack,
          );

          // Save forge results to state
          if (!state.forgeTasks) state.forgeTasks = {};
          for (const result of results) {
            state.forgeTasks[result.taskId] = {
              taskId: result.taskId,
              status: result.success ? 'complete' : 'failed',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              generatedFiles: result.generatedFiles,
            };
          }
          _stateManager.save(project_path, state);

          forgeMetricsSummary = `${metrics.completedTasks}/${metrics.totalTasks} tasks, ${metrics.failedTasks} failed, $${metrics.totalCostUsd.toFixed(4)}, ${metrics.reworkCount} reworks`;
        }
        addLog(`Phase 6: Forge complete — ${forgeMetricsSummary}`);

        // Phase 6 has no gate (developer-controlled), advance state manually
        state.currentPhase = 7;
        _stateManager.save(project_path, state);

        // Phase 7: Connect
        addLog('Phase 7: Connect...');
        await orchestrator.connect(project_path);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 7: Connect complete + gate approved');

        // Phase 8: Compound
        addLog('Phase 8: Compound...');
        await orchestrator.compound(project_path);
        await orchestrator.gate(project_path, 'approve', `Auto-approved by autopilot (threshold: ${threshold})`);
        addLog('Phase 8: Compound complete + gate approved');

        const text = `## RC Autopilot — Complete

### Configuration
- Budget cap: $${budget_cap_usd ?? 15}
- Auto-approve threshold: ${threshold}
- Tech stack: ${parsedStack ? `${parsedStack.language}/${parsedStack.framework}` : 'typescript/nextjs (default)'}

### Pipeline Log
${log.map((l) => `- ${l}`).join('\n')}

### Result
All 8 phases completed autonomously. Review the generated artifacts in \`${project_path}/rc-method/\`.`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const errorMsg = (err as Error).message;
        const text = `## RC Autopilot — Halted

### Error
${errorMsg}

### Pipeline Log
${log.map((l) => `- ${l}`).join('\n')}

${errorMsg.includes('Budget') ? '**Budget limit reached.** Increase budget_cap_usd or review costs.' : 'Review the error and retry or continue manually with individual phase tools.'}`;

        return { content: [{ type: 'text' as const, text }], isError: true };
      }
    },
  );
}
