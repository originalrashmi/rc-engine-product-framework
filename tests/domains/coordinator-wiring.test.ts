/**
 * Coordinator wiring tests -- verify domain graphs execute correctly
 * when tools call coordinators with real (stubbed) handlers.
 *
 * These tests use in-memory CheckpointStore with domain graph builders
 * to validate the wiring between tools and the graph engine.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { z } from 'zod';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';
import { GraphCoordinator } from '../../src/core/graph/coordinator.js';
import { derivePipelineId } from '../../src/shared/state/pipeline-id.js';

// ── Domain graph builders ─────────────────────────────────────────────────

import { buildPostRcGraph } from '../../src/domains/post-rc/graph/postrc-graph.js';
import type { PostRcNodeHandlers } from '../../src/domains/post-rc/graph/postrc-graph.js';
import { buildPreRcGraph } from '../../src/domains/pre-rc/graph/pre-rc-graph.js';
import type { PreRcNodeHandlers } from '../../src/domains/pre-rc/graph/pre-rc-graph.js';
import { buildRcGraph } from '../../src/domains/rc/graph/rc-graph.js';
import type { RcNodeHandlers } from '../../src/domains/rc/graph/rc-graph.js';

// ── Domain schemas ────────────────────────────────────────────────────────

import { PostRCStateSchema } from '../../src/domains/post-rc/state/schemas.js';
import { ResearchStateSchema } from '../../src/domains/pre-rc/state/schemas.js';
import { ProjectStateSchema } from '../../src/domains/rc/state/schemas.js';

// ── Domain types ──────────────────────────────────────────────────────────

import type { PostRCState, Finding } from '../../src/domains/post-rc/types.js';
import {
  ValidationModule,
  Severity,
  ScanStatus,
  GateDecision as PostRCGateDecision,
} from '../../src/domains/post-rc/types.js';
import type { ResearchState } from '../../src/domains/pre-rc/types.js';
import { ComplexityDomain, ResearchStage, StageStatus, PersonaId } from '../../src/domains/pre-rc/types.js';
import { LLMProvider } from '../../src/shared/types.js';
import type { ProjectState } from '../../src/domains/rc/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

const stores: CheckpointStore[] = [];

function createStoreFactory() {
  const store = new CheckpointStore(':memory:');
  stores.push(store);
  return (_projectPath: string) => ({
    store,
    pipelineId: derivePipelineId('/test/project'),
  });
}

afterEach(() => {
  for (const s of stores) {
    s.close();
  }
  stores.length = 0;
});

// ── Fixtures ──────────────────────────────────────────────────────────────

function makePostRcState(overrides?: Partial<PostRCState>): PostRCState {
  return {
    projectPath: '/test/project',
    projectName: 'Test',
    config: {
      projectPath: '/test/project',
      projectName: 'Test',
      activeModules: [ValidationModule.Security, ValidationModule.Monitoring],
      securityPolicy: {
        enabled: true,
        blockOnCritical: true,
        blockOnHigh: false,
        suppressedCWEs: [],
        customPatterns: [],
      },
      monitoringPolicy: {
        enabled: true,
        requireErrorTracking: true,
        requireAnalytics: false,
        requireDashboards: false,
        requireAlerts: false,
      },
    },
    scans: [],
    overrides: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePreRcState(overrides?: Partial<ResearchState>): ResearchState {
  return {
    projectPath: '/test/project',
    projectName: 'Test Product',
    brief: {
      name: 'Test Product',
      description: 'A test product',
      rawInput: 'Build me a thing',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    classification: null,
    personaSelection: null,
    currentStage: null,
    stageStatus: {
      [ResearchStage.MetaOrchestration]: StageStatus.NotStarted,
      [ResearchStage.UserIntelligence]: StageStatus.NotStarted,
      [ResearchStage.BusinessMarket]: StageStatus.NotStarted,
      [ResearchStage.Technical]: StageStatus.NotStarted,
      [ResearchStage.UXCognitive]: StageStatus.NotStarted,
      [ResearchStage.Validation]: StageStatus.NotStarted,
    },
    artifacts: [],
    gates: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRcState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    projectName: 'Test Product',
    projectPath: '/test/project',
    currentPhase: 1,
    gates: {},
    artifacts: [],
    uxScore: null,
    uxMode: null,
    ...overrides,
  };
}

// ── Post-RC Wiring ──────────────────────────────────────────────────────

describe('Post-RC coordinator wiring', () => {
  function makePostRcHandlers(executionLog: string[]): PostRcNodeHandlers {
    const securityFinding: Finding = {
      id: 'f-001',
      module: ValidationModule.Security,
      severity: Severity.Medium,
      title: 'Test finding',
      description: 'Test description',
      remediation: 'Fix it',
      category: 'test',
    };

    return {
      scanSecurity: async (state) => {
        executionLog.push('security');
        return {
          state: {
            ...state,
            _pendingFindings: [securityFinding],
          },
        };
      },
      scanMonitoring: async (state) => {
        executionLog.push('monitoring');
        return {
          state: {
            ...state,
            _pendingFindings: [
              {
                ...securityFinding,
                id: 'f-002',
                module: ValidationModule.Monitoring,
                title: 'Missing error tracking',
              },
            ],
          },
        };
      },
      mergeScans: (states, original) => {
        executionLog.push('merge');
        const allFindings = states.flatMap((s) => s._pendingFindings ?? []);
        const scanResult = {
          id: 'scan-test',
          timestamp: new Date().toISOString(),
          status: ScanStatus.Completed,
          modules: [ValidationModule.Security, ValidationModule.Monitoring],
          findings: allFindings,
          summary: {
            totalFindings: allFindings.length,
            critical: 0,
            high: 0,
            medium: allFindings.length,
            low: 0,
            info: 0,
            moduleSummaries: [],
          },
          gateDecision: PostRCGateDecision.Warn,
          duration_ms: 100,
        };
        return {
          ...original,
          scans: [...original.scans, scanResult],
          lastScan: scanResult,
          updatedAt: new Date().toISOString(),
        };
      },
    };
  }

  it('runs scan handlers through fan-out/fan-in and stops at ship gate', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const handlers = makePostRcHandlers(executionLog);
    const graph = buildPostRcGraph(handlers);
    const initialState = makePostRcState();

    const result = await coordinator.run('/test/project', graph, initialState);

    // Both scans executed (parallel) then merged
    expect(executionLog).toContain('security');
    expect(executionLog).toContain('monitoring');
    expect(executionLog).toContain('merge');
    // Merge happens after both scans
    expect(executionLog.indexOf('merge')).toBeGreaterThan(executionLog.indexOf('security'));
    expect(executionLog.indexOf('merge')).toBeGreaterThan(executionLog.indexOf('monitoring'));

    // Stops at ship gate
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('ship-gate');

    // State reflects merged scan results
    expect(result.state.scans).toHaveLength(1);
    expect(result.state.lastScan).toBeDefined();
    expect(result.state.lastScan!.findings).toHaveLength(2);
  });

  it('persists state to CheckpointStore after run', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const graph = buildPostRcGraph(makePostRcHandlers(executionLog));

    await coordinator.run('/test/project', graph, makePostRcState());

    const loaded = coordinator.loadState('/test/project');
    expect(loaded.scans).toHaveLength(1);
    expect(loaded.projectName).toBe('Test');
  });

  it('persists gate interrupt for ship gate', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const graph = buildPostRcGraph(makePostRcHandlers(executionLog));

    await coordinator.run('/test/project', graph, makePostRcState());

    const interrupt = coordinator.loadPendingInterrupt('/test/project');
    expect(interrupt).not.toBeNull();
    expect(interrupt!.gateNodeId).toBe('ship-gate');
    expect(interrupt!.graphId).toBe('post-rc-pipeline');
  });

  it('resumes from ship gate with approval and completes', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const graph = buildPostRcGraph(makePostRcHandlers(executionLog));

    await coordinator.run('/test/project', graph, makePostRcState());
    const result = await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // No more gates -- pipeline complete
    expect(result.gateInterrupt).toBeUndefined();
    expect(result.trace.status).toBe('completed');

    // Interrupt cleared
    expect(coordinator.loadPendingInterrupt('/test/project')).toBeNull();
  });
});

// ── Pre-RC Wiring ────────────────────────────────────────────────────────

describe('Pre-RC coordinator wiring', () => {
  function makePreRcHandlers(executionLog: string[]): PreRcNodeHandlers {
    return {
      classify: async (state) => {
        executionLog.push('classify');
        return {
          state: {
            ...state,
            classification: {
              domain: ComplexityDomain.Complicated,
              confidence: 0.85,
              reasoning: 'Test classification',
              productClass: 'saas-b2b',
              complexityFactors: ['auth', 'billing'],
            },
            personaSelection: {
              activePersonas: [PersonaId.MetaProductArchitect, PersonaId.SystemsArchitect],
              skippedPersonas: [{ id: PersonaId.AIMLSpecialist, reason: 'Not relevant' }],
              totalActive: 2,
              totalSkipped: 1,
            },
            updatedAt: new Date().toISOString(),
          },
        };
      },
      runStage: (stage: ResearchStage) => async (state) => {
        executionLog.push(`stage:${stage}`);
        return {
          state: {
            ...state,
            currentStage: stage,
            stageStatus: { ...state.stageStatus, [stage]: StageStatus.Completed },
            artifacts: [
              ...state.artifacts,
              {
                personaId: PersonaId.MetaProductArchitect,
                personaName: 'Meta-Product Architect',
                stage,
                content: `Research for ${stage}`,
                tokenCount: 100,
                llmUsed: LLMProvider.Claude,
                timestamp: new Date().toISOString(),
                filePath: `pre-rc-research/${stage}/test.md`,
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        };
      },
      synthesize: async (state) => {
        executionLog.push('synthesize');
        return { state };
      },
    };
  }

  it('runs classify and stops at gate-1', async () => {
    const factory = createStoreFactory();
    // Use z.record() cast like the real PreRcCoordinator does
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makePreRcHandlers(executionLog));

    const result = await coordinator.run('/test/project', graph, makePreRcState());

    // Only classify should have executed
    expect(executionLog).toEqual(['classify']);

    // Should stop at gate-1
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-1');

    // State should have classification
    expect(result.state.classification).not.toBeNull();
    expect(result.state.classification!.domain).toBe(ComplexityDomain.Complicated);
    expect(result.state.personaSelection).not.toBeNull();
  });

  it('persists gate interrupt after classification', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makePreRcHandlers(executionLog));

    await coordinator.run('/test/project', graph, makePreRcState());

    const interrupt = coordinator.loadPendingInterrupt('/test/project');
    expect(interrupt).not.toBeNull();
    expect(interrupt!.gateNodeId).toBe('gate-1');
    expect(interrupt!.graphId).toBe('pre-rc-pipeline');
  });

  it('resumes from gate-1 approval and runs stages until gate-2', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makePreRcHandlers(executionLog));

    // Run -> stops at gate-1
    await coordinator.run('/test/project', graph, makePreRcState());
    executionLog.length = 0;

    // Approve gate-1 -> runs stages 1-4 -> stops at gate-2
    const result = await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // Stages 1-4 should have executed (gate-2 is after stage-4-technical)
    expect(executionLog).toEqual([
      `stage:${ResearchStage.MetaOrchestration}`,
      `stage:${ResearchStage.UserIntelligence}`,
      `stage:${ResearchStage.BusinessMarket}`,
      `stage:${ResearchStage.Technical}`,
    ]);

    // Should stop at gate-2
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-2');

    // State should have artifacts from 4 stages
    expect(result.state.artifacts).toHaveLength(4);
  });

  it('completes full pipeline through all 3 gates', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makePreRcHandlers(executionLog));

    // Run -> gate-1
    await coordinator.run('/test/project', graph, makePreRcState());

    // Approve gate-1 -> stages 1-4 -> gate-2
    await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // Approve gate-2 -> stages 5 -> gate-3 (gate-3 is after stage-5-ux)
    const r3 = await coordinator.resume('/test/project', graph, { decision: 'approve' });
    expect(r3.gateInterrupt).toBeDefined();
    expect(r3.gateInterrupt!.gateNodeId).toBe('gate-3');

    // Approve gate-3 -> stage 6 -> synthesize -> complete
    const r4 = await coordinator.resume('/test/project', graph, { decision: 'approve' });
    expect(r4.gateInterrupt).toBeUndefined();
    expect(r4.trace.status).toBe('completed');

    // All stages + synthesize should have executed
    expect(executionLog).toContain('synthesize');
    // 6 stages total + classify + synthesize = 8 entries
    expect(executionLog.filter((e) => e.startsWith('stage:')).length).toBe(6);
  });
});

// ── RC Method Wiring ─────────────────────────────────────────────────────

describe('RC Method coordinator wiring', () => {
  function makeRcHandlers(executionLog: string[]): RcNodeHandlers {
    const makeHandler = (phase: string) => async (state: ProjectState) => {
      if (!state._pendingInput) {
        executionLog.push(`${phase}:skipped`);
        return { state };
      }
      executionLog.push(`${phase}:executed`);
      return {
        state: {
          ...state,
          _lastOutput: `${phase} output for: ${state._pendingInput}`,
          _pendingInput: undefined,
        },
      };
    };

    return {
      illuminate: makeHandler('illuminate'),
      define: makeHandler('define'),
      architect: makeHandler('architect'),
      sequence: makeHandler('sequence'),
      validate: makeHandler('validate'),
      forge: async (state: ProjectState) => {
        if (!state._forgeTaskId) {
          executionLog.push('forge:skipped');
          return { state };
        }
        executionLog.push(`forge:${state._forgeTaskId}`);
        return {
          state: {
            ...state,
            _lastOutput: `Built ${state._forgeTaskId}`,
            _forgeTaskId: undefined,
          },
        };
      },
      connect: makeHandler('connect'),
      compound: makeHandler('compound'),
    };
  }

  it('runs illuminate with _pendingInput and stops at gate-1', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));
    const initialState = makeRcState({ _pendingInput: 'discovery answers' });

    const result = await coordinator.run('/test/project', graph, initialState);

    expect(executionLog).toEqual(['illuminate:executed']);
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-1');
    expect(result.state._lastOutput).toBe('illuminate output for: discovery answers');
    expect(result.state._pendingInput).toBeUndefined();
  });

  it('skips handler when _pendingInput is absent', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));
    const initialState = makeRcState(); // no _pendingInput

    const result = await coordinator.run('/test/project', graph, initialState);

    expect(executionLog).toEqual(['illuminate:skipped']);
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-1');
    expect(result.state._lastOutput).toBeUndefined();
  });

  it('uses resumeFromNodeId to skip to a specific phase', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));
    const initialState = makeRcState({
      currentPhase: 3,
      _pendingInput: 'tech stack preferences',
    });

    const result = await coordinator.run('/test/project', graph, initialState, {
      resumeFromNodeId: 'architect',
    });

    // Only architect should have executed (illuminate and define skipped)
    expect(executionLog).toEqual(['architect:executed']);
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-3');
    expect(result.state._lastOutput).toBe('architect output for: tech stack preferences');
  });

  it('resumes from gate and advances to next phase node', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    // Run illuminate -> gate-1
    await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'answers' }));
    executionLog.length = 0;

    // Approve gate-1 -> define executes (no input, so skipped) -> gate-2
    const result = await coordinator.resume('/test/project', graph, { decision: 'approve' });

    expect(executionLog).toEqual(['define:skipped']);
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-2');
  });

  it('forge handler reads _forgeTaskId and writes _lastOutput', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));
    const initialState = makeRcState({
      currentPhase: 6,
      _forgeTaskId: 'TASK-001',
    });

    const result = await coordinator.run('/test/project', graph, initialState, {
      resumeFromNodeId: 'forge',
    });

    expect(executionLog).toEqual(['forge:TASK-001']);
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-6');
    expect(result.state._lastOutput).toBe('Built TASK-001');
    expect(result.state._forgeTaskId).toBeUndefined();
  });

  it('persists state with transient fields through CheckpointStore', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'test' }));

    const loaded = coordinator.loadState('/test/project');
    // _lastOutput persists (it's in the schema)
    expect(loaded._lastOutput).toBe('illuminate output for: test');
    // _pendingInput was cleared by handler
    expect(loaded._pendingInput).toBeUndefined();
  });

  it('walks through multiple phases with resumeFromNodeId per phase', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    // Phase 1: illuminate
    await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'answers' }));
    expect(executionLog).toEqual(['illuminate:executed']);
    executionLog.length = 0;

    // Phase 2: define (skip to define via resumeFromNodeId)
    const stateAfterG1 = coordinator.loadState('/test/project');
    await coordinator.run(
      '/test/project',
      graph,
      { ...stateAfterG1, _pendingInput: 'features' },
      { resumeFromNodeId: 'define' },
    );
    expect(executionLog).toEqual(['define:executed']);
    executionLog.length = 0;

    // Phase 3: architect
    const stateAfterG2 = coordinator.loadState('/test/project');
    await coordinator.run(
      '/test/project',
      graph,
      { ...stateAfterG2, _pendingInput: 'next.js + supabase' },
      { resumeFromNodeId: 'architect' },
    );
    expect(executionLog).toEqual(['architect:executed']);

    const finalState = coordinator.loadState('/test/project');
    expect(finalState._lastOutput).toBe('architect output for: next.js + supabase');
  });
});
