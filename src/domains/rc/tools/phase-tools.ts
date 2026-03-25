import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../orchestrator.js';
import { createRcCoordinator } from './rc-coordinator-factory.js';
import type { RcCoordinator } from '../graph/rc-coordinator.js';
import { StateManager } from '../state/state-manager.js';
import { PHASE_NAMES, GateStatus } from '../types.js';
import type { ProjectState, Phase } from '../types.js';
import { audit } from '../../../shared/audit.js';
import fs from 'node:fs';
import path from 'node:path';

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
 * Parse task IDs from task list files in rc-method/tasks/.
 * Returns sorted array of task IDs like ['TASK-001', 'TASK-002', ...].
 */
function parseTaskIdsFromFiles(projectPath: string): string[] {
  const tasksDir = path.join(projectPath, 'rc-method', 'tasks');
  if (!fs.existsSync(tasksDir)) return [];

  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.md'));
  const taskIds: Set<string> = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(tasksDir, file), 'utf-8');
    // Match task headers: ### TASK-001 [TYPE] Title
    const matches = content.matchAll(/^###\s+(TASK-\d+)\s+/gm);
    for (const m of matches) {
      taskIds.add(m[1]);
    }
  }

  return Array.from(taskIds).sort();
}

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
        'Start RC Method WITHOUT Pre-RC research. Use when user wants to go straight to building without the 20-persona research phase. Creates rc-method/ directory and project state, begins Phase 1 (Illuminate) with discovery questions. Returns discovery questions - present these to the user and collect their answers. After success: call rc_illuminate with user answers. Do NOT use this if Pre-RC was run - use rc_import_prerc instead.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        project_name: z.string().describe('Name of the project'),
        description: z.string().describe('Brief description of what the project is and what problem it solves'),
      },
    },
    async ({ project_path, project_name, description }) => {
      try {
        const result = await getOrchestrator().start(project_path, project_name, description);
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
        'Phase 4 (Sequence). Auto-generates a sequenced, dependency-ordered task list from the approved PRD and architecture. Each task gets an ID (TASK-001, TASK-002...) with estimated effort and dependencies. Saved to rc-method/tasks/. No user input needed - reads PRD artifacts automatically. Present the task list to user for approval. Prerequisites: Phase 3 gate approved. After gate approval: moves to Phase 5 (Validate).',
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
        'Phase 5 (Validate). QUALITY GATE before building. Runs 4 automated checks: anti-pattern scan, token budget audit, scope drift detection, and UX quality assessment. This catches problems BEFORE code is written - saving significant rework. No user input needed. Present findings to user with severity ratings. Prerequisites: Phase 4 gate approved. After gate approval: moves to Phase 6 (Forge) - begin building with rc_forge_task.',
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
        'Phase 7 (Connect). Verifies that all built components integrate correctly. Reviews forge outputs for API wiring, authentication flows, data model alignment, and cross-component dependencies. Generates an integration report with gaps and recommended integration tests. No user input needed - reads forge artifacts automatically. Prerequisites: Phase 6 gate approved. After gate approval: moves to Phase 8 (Compound).',
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

  // rc_forge_all - Build all pending tasks in sequence (Phase 6 batch)
  server.registerTool(
    'rc_forge_all',
    {
      description:
        'Phase 6 (Forge) BATCH MODE. Builds ALL pending tasks from the approved task list in one call, respecting dependency order. Equivalent to calling rc_forge_task for each task sequentially. If a task fails, it is recorded as failed and the next task continues. Returns a summary of all tasks with success/failure status. Prerequisites: Phase 5 gate approved, task list must exist in rc-method/tasks/. After completion: proceed to rc_gate to approve Phase 6, then rc_connect for integration check.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory (must contain rc-method/tasks/)'),
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
                text: `rc_forge_all requires Step 6 (Build), but project is in Step ${state.currentPhase} (${PHASE_NAMES[state.currentPhase]}). Use rc_status to check progress.`,
              },
            ],
            isError: true,
          };
        }

        // Discover all task IDs from task list files
        const allTaskIds = parseTaskIdsFromFiles(project_path);
        if (allTaskIds.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No tasks found in rc-method/tasks/. Run rc_sequence first to generate the task list.',
              },
            ],
            isError: true,
          };
        }

        // Filter to only pending tasks (not already complete)
        const pendingTaskIds = allTaskIds.filter((id) => {
          const record = state.forgeTasks?.[id];
          return !record || record.status !== 'complete';
        });

        if (pendingTaskIds.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `All ${allTaskIds.length} tasks are already complete. Use rc_gate to approve Step 6 and continue to integration check.`,
              },
            ],
          };
        }

        const orchestrator = getOrchestrator();
        const results: Array<{ taskId: string; status: 'complete' | 'failed'; error?: string }> = [];

        for (const taskId of pendingTaskIds) {
          try {
            await orchestrator.forgeTask(project_path, taskId);
            results.push({ taskId, status: 'complete' });
          } catch (err) {
            results.push({ taskId, status: 'failed', error: (err as Error).message });
            // Mark the task as failed in state so it can be retried
            const currentState = _stateManager.load(project_path);
            if (!currentState.forgeTasks) currentState.forgeTasks = {};
            currentState.forgeTasks[taskId] = {
              taskId,
              status: 'failed',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
            _stateManager.save(project_path, currentState);
          }
        }

        const succeeded = results.filter((r) => r.status === 'complete').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const totalComplete = allTaskIds.length - (pendingTaskIds.length - succeeded);

        // Build summary
        const lines: string[] = [
          `## Build All Tasks - Complete`,
          '',
          `**Results:** ${succeeded} built successfully, ${failed} failed, ${totalComplete}/${allTaskIds.length} total complete`,
          '',
        ];

        if (succeeded > 0) {
          lines.push('### Completed');
          for (const r of results.filter((r) => r.status === 'complete')) {
            lines.push(`- ${r.taskId}: built successfully`);
          }
          lines.push('');
        }

        if (failed > 0) {
          lines.push('### Failed');
          for (const r of results.filter((r) => r.status === 'failed')) {
            lines.push(`- ${r.taskId}: ${r.error ?? 'unknown error'}`);
          }
          lines.push('');
          lines.push('Failed tasks can be retried individually with rc_forge_task.');
          lines.push('');
        }

        if (totalComplete === allTaskIds.length) {
          lines.push(
            'All tasks are now complete. Use rc_gate with decision "approve" to pass the Step 6 checkpoint, then proceed to rc_connect for integration verification.',
          );
        } else {
          lines.push(
            `${allTaskIds.length - totalComplete} tasks remain. Fix failed tasks with rc_forge_task, then approve the Step 6 checkpoint.`,
          );
        }

        audit('phase.complete', 'rc', project_path, { succeeded, failed, total: allTaskIds.length }, 'forge-all');

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // rc_autopilot - Run remaining phases automatically with gate checks
  server.registerTool(
    'rc_autopilot',
    {
      description:
        'Run remaining RC Method steps automatically from the current step through Step 8 (Production Hardening). Auto-approves checkpoints between steps with a note that they were auto-approved. IMPORTANT: Does NOT auto-approve the Post-RC ship decision - that always requires human review. Use when the user wants to fast-track the build pipeline. If any step fails, stops and reports where it stopped. Prerequisites: at least rc_start or rc_import_prerc must have been called. Not recommended for first-time users - prefer step-by-step flow.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ project_path }) => {
      try {
        const state = _stateManager.load(project_path);
        const startPhase = state.currentPhase;
        const orchestrator = getOrchestrator();

        // Phase-to-handler mapping. Each returns the phase output text.
        // Phases 1 and 2 require user input, so autopilot can only run them
        // if they are already complete (gate approved).
        const phaseHandlers: Record<number, () => Promise<string>> = {
          3: async () => {
            const text = await runPhaseViaCoordinator(
              project_path,
              'architect',
              'Use best practices for the chosen tech stack',
            );
            return text;
          },
          4: async () => {
            const text = await runPhaseViaCoordinator(project_path, 'sequence');
            return text;
          },
          5: async () => {
            const text = await runPhaseViaCoordinator(project_path, 'validate');
            return text;
          },
          6: async () => {
            // Run all forge tasks
            const taskIds = parseTaskIdsFromFiles(project_path);
            const currentState = _stateManager.load(project_path);
            const pending = taskIds.filter((id) => {
              const record = currentState.forgeTasks?.[id];
              return !record || record.status !== 'complete';
            });
            let completed = 0;
            let failed = 0;
            for (const taskId of pending) {
              try {
                await orchestrator.forgeTask(project_path, taskId);
                completed++;
              } catch {
                failed++;
              }
            }
            return `Build phase complete: ${completed} tasks built, ${failed} failed out of ${taskIds.length} total.`;
          },
          7: async () => {
            const text = await runPhaseViaCoordinator(project_path, 'connect');
            return text;
          },
          8: async () => {
            const text = await runPhaseViaCoordinator(project_path, 'compound');
            return text;
          },
        };

        // Phases 1 and 2 need user input - cannot autopilot through them
        if (startPhase <= 2) {
          const currentGate = state.gates[state.currentPhase];
          if (!currentGate || currentGate.status !== GateStatus.Approved) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Autopilot cannot run Steps 1-2 (Discovery and Requirements) because they require your input. Please complete Step ${state.currentPhase} (${PHASE_NAMES[state.currentPhase]}) manually first, then run rc_autopilot to fast-track the remaining steps.`,
                },
              ],
            };
          }
        }

        const completedPhases: Array<{ phase: number; name: string }> = [];
        let stoppedAt: { phase: number; name: string; error: string } | null = null;

        // Run from current phase through phase 8
        for (let p = startPhase; p <= 8; p++) {
          const phase = p as Phase;
          const currentState = _stateManager.load(project_path);

          // If this phase's gate is already approved, skip it
          if (currentState.gates[phase]?.status === GateStatus.Approved) {
            completedPhases.push({ phase: p, name: PHASE_NAMES[phase] });
            continue;
          }

          // If this phase needs to be executed
          const handler = phaseHandlers[p];
          if (!handler) {
            // Phases 1-2 without a handler - should already be approved or caught above
            continue;
          }

          // Execute the phase
          try {
            await handler();
          } catch (err) {
            stoppedAt = { phase: p, name: PHASE_NAMES[phase], error: (err as Error).message };
            break;
          }

          // Auto-approve the gate
          try {
            await orchestrator.gate(
              project_path,
              'approve',
              `Auto-approved by rc_autopilot. Original step: ${PHASE_NAMES[phase]}.`,
            );
            completedPhases.push({ phase: p, name: PHASE_NAMES[phase] });
            audit('gate.approve', 'rc', project_path, { phase: p, autopilot: true }, `autopilot-gate-${p}`);
          } catch (err) {
            stoppedAt = {
              phase: p,
              name: PHASE_NAMES[phase],
              error: `Gate approval failed: ${(err as Error).message}`,
            };
            break;
          }
        }

        // Build summary
        const lines: string[] = [
          '## Autopilot Summary',
          '',
          `**Started at:** Step ${startPhase} (${PHASE_NAMES[startPhase as Phase]})`,
          `**Steps completed:** ${completedPhases.length}`,
          '',
        ];

        if (completedPhases.length > 0) {
          lines.push('### Completed Steps');
          for (const cp of completedPhases) {
            lines.push(`- Step ${cp.phase}: ${cp.name} - auto-approved`);
          }
          lines.push('');
        }

        if (stoppedAt) {
          lines.push('### Stopped');
          lines.push(`Autopilot stopped at Step ${stoppedAt.phase} (${stoppedAt.name}).`);
          lines.push(`Reason: ${stoppedAt.error}`);
          lines.push('');
          lines.push(
            'You can fix the issue and either re-run rc_autopilot or continue manually with the appropriate step tool.',
          );
        } else {
          lines.push(
            '### All RC Method steps complete!',
            '',
            'The build pipeline is finished. Next step: run postrc_scan for security and quality validation.',
            '',
            '**Important:** The Post-RC ship decision requires your explicit approval - it is never auto-approved.',
          );
        }

        audit(
          'phase.complete',
          'rc',
          project_path,
          {
            startPhase,
            completedCount: completedPhases.length,
            stopped: stoppedAt?.phase ?? null,
          },
          'autopilot',
        );

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
