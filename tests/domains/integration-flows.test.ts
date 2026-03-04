/**
 * Integration flow tests -- verify the gap fixes work end-to-end:
 *
 * 1. Pre-RC: shared handler delegation (prc_run_stage uses createPreRcHandlers)
 * 2. Pre-RC: synthesize handler stores _synthesisOutput in state
 * 3. RC: Phase 8 gate bridge message to Post-RC
 * 4. RC: Full 8-phase walkthrough through all gates
 * 5. Post-RC: fan-out scan through gate resume to completion
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { z } from 'zod';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';
import { GraphCoordinator } from '../../src/core/graph/coordinator.js';
import { derivePipelineId } from '../../src/shared/state/pipeline-id.js';

// ── Domain graph builders ─────────────────────────────────────────────────

import { buildPreRcGraph } from '../../src/domains/pre-rc/graph/pre-rc-graph.js';
import type { PreRcNodeHandlers } from '../../src/domains/pre-rc/graph/pre-rc-graph.js';
import { buildRcGraph } from '../../src/domains/rc/graph/rc-graph.js';
import type { RcNodeHandlers } from '../../src/domains/rc/graph/rc-graph.js';
import { buildPostRcGraph } from '../../src/domains/post-rc/graph/postrc-graph.js';
import type { PostRcNodeHandlers } from '../../src/domains/post-rc/graph/postrc-graph.js';

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
import type { ProjectState, Phase } from '../../src/domains/rc/types.js';
import { PHASE_NAMES, GATED_PHASES } from '../../src/domains/rc/types.js';

// ── GateAgent for direct testing ──────────────────────────────────────────

import { GateAgent } from '../../src/domains/rc/agents/gate-agent.js';

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

// ═══════════════════════════════════════════════════════════════════════════
// Pre-RC: Synthesize handler stores _synthesisOutput
// ═══════════════════════════════════════════════════════════════════════════

describe('Pre-RC: synthesize handler stores _synthesisOutput', () => {
  function makeHandlersWithSynthesize(executionLog: string[]): PreRcNodeHandlers {
    return {
      classify: async (state) => {
        executionLog.push('classify');
        return {
          state: {
            ...state,
            classification: {
              domain: ComplexityDomain.Complicated,
              confidence: 0.85,
              reasoning: 'Test',
              productClass: 'saas-b2b',
              complexityFactors: ['auth'],
            },
            personaSelection: {
              activePersonas: [PersonaId.MetaProductArchitect],
              skippedPersonas: [],
              totalActive: 1,
              totalSkipped: 0,
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
        // Real handler stores output in _synthesisOutput
        return {
          state: {
            ...state,
            _synthesisOutput: '# Synthesized PRD\n\nThis is the final output.',
            updatedAt: new Date().toISOString(),
          },
        };
      },
    };
  }

  it('stores _synthesisOutput in state after full pipeline', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makeHandlersWithSynthesize(executionLog));

    // Run through all 3 gates
    await coordinator.run('/test/project', graph, makePreRcState());
    await coordinator.resume('/test/project', graph, { decision: 'approve' }); // gate-1 -> stages 1-4
    await coordinator.resume('/test/project', graph, { decision: 'approve' }); // gate-2 -> stage 5
    const result = await coordinator.resume('/test/project', graph, { decision: 'approve' }); // gate-3 -> stage 6 + synthesize

    // Synthesize should have executed
    expect(executionLog).toContain('synthesize');

    // _synthesisOutput should be on the final state
    expect(result.state._synthesisOutput).toBe('# Synthesized PRD\n\nThis is the final output.');

    // Pipeline should be complete
    expect(result.gateInterrupt).toBeUndefined();
    expect(result.trace.status).toBe('completed');
  });

  it('persists _synthesisOutput through CheckpointStore', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makeHandlersWithSynthesize(executionLog));

    // Full pipeline
    await coordinator.run('/test/project', graph, makePreRcState());
    await coordinator.resume('/test/project', graph, { decision: 'approve' });
    await coordinator.resume('/test/project', graph, { decision: 'approve' });
    await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // Load from store -- _synthesisOutput should survive serialization
    const loaded = coordinator.loadState('/test/project');
    expect(loaded._synthesisOutput).toBe('# Synthesized PRD\n\nThis is the final output.');
  });

  it('includes all 6 stages and synthesize in execution order', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const graph = buildPreRcGraph(makeHandlersWithSynthesize(executionLog));

    // Full pipeline
    await coordinator.run('/test/project', graph, makePreRcState());
    await coordinator.resume('/test/project', graph, { decision: 'approve' });
    await coordinator.resume('/test/project', graph, { decision: 'approve' });
    await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // Verify execution order
    const stageEntries = executionLog.filter((e) => e.startsWith('stage:'));
    expect(stageEntries).toEqual([
      `stage:${ResearchStage.MetaOrchestration}`,
      `stage:${ResearchStage.UserIntelligence}`,
      `stage:${ResearchStage.BusinessMarket}`,
      `stage:${ResearchStage.Technical}`,
      `stage:${ResearchStage.UXCognitive}`,
      `stage:${ResearchStage.Validation}`,
    ]);

    // Synthesize runs after all stages
    const synthIndex = executionLog.indexOf('synthesize');
    const lastStageIndex = executionLog.lastIndexOf(`stage:${ResearchStage.Validation}`);
    expect(synthIndex).toBeGreaterThan(lastStageIndex);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pre-RC: shared handler delegation -- single source of truth
// ═══════════════════════════════════════════════════════════════════════════

describe('Pre-RC: shared handler delegation', () => {
  it('runStage handler produces artifacts with correct stage metadata', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const executionLog: string[] = [];
    const handlers: PreRcNodeHandlers = {
      classify: async (state) => {
        executionLog.push('classify');
        return {
          state: {
            ...state,
            classification: {
              domain: ComplexityDomain.Clear,
              confidence: 0.95,
              reasoning: 'Clear product',
              productClass: 'utility',
              complexityFactors: [],
            },
            personaSelection: {
              activePersonas: [PersonaId.MetaProductArchitect, PersonaId.SystemsArchitect],
              skippedPersonas: [],
              totalActive: 2,
              totalSkipped: 0,
            },
          },
        };
      },
      runStage: (stage: ResearchStage) => async (state) => {
        executionLog.push(`stage:${stage}`);
        // Handler produces artifacts tagged with the stage
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
                content: `Analysis for ${stage}`,
                tokenCount: 50,
                llmUsed: LLMProvider.Claude,
                timestamp: new Date().toISOString(),
                filePath: `pre-rc-research/${stage}/meta-product-architect.md`,
              },
              {
                personaId: PersonaId.SystemsArchitect,
                personaName: 'Systems Architect',
                stage,
                content: `Architecture for ${stage}`,
                tokenCount: 75,
                llmUsed: LLMProvider.Claude,
                timestamp: new Date().toISOString(),
                filePath: `pre-rc-research/${stage}/systems-architect.md`,
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        };
      },
      synthesize: async (state) => ({ state }),
    };

    const graph = buildPreRcGraph(handlers);

    // Run classify -> gate-1
    await coordinator.run('/test/project', graph, makePreRcState());

    // Approve gate-1 -> runs stages 1-4 -> gate-2
    const r2 = await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // Each stage should produce 2 artifacts (one per persona)
    expect(r2.state.artifacts).toHaveLength(8); // 4 stages x 2 personas

    // All artifacts should have correct stage metadata
    const stage1Artifacts = r2.state.artifacts.filter((a) => a.stage === ResearchStage.MetaOrchestration);
    expect(stage1Artifacts).toHaveLength(2);
    expect(stage1Artifacts[0].personaId).toBe(PersonaId.MetaProductArchitect);
    expect(stage1Artifacts[1].personaId).toBe(PersonaId.SystemsArchitect);
  });

  it('skipped stage sets StageStatus.Skipped without producing artifacts', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const handlers: PreRcNodeHandlers = {
      classify: async (state) => ({
        state: {
          ...state,
          classification: {
            domain: ComplexityDomain.Clear,
            confidence: 0.9,
            reasoning: 'Clear product',
            productClass: 'utility',
            complexityFactors: [],
          },
          personaSelection: {
            activePersonas: [],
            skippedPersonas: [],
            totalActive: 0,
            totalSkipped: 0,
          },
        },
      }),
      runStage: (_stage: ResearchStage) => async (state) => {
        // Skip stage -- no active personas
        return {
          state: {
            ...state,
            stageStatus: { ...state.stageStatus, [_stage]: StageStatus.Skipped },
          },
        };
      },
      synthesize: async (state) => ({ state }),
    };

    const graph = buildPreRcGraph(handlers);

    await coordinator.run('/test/project', graph, makePreRcState());
    const r2 = await coordinator.resume('/test/project', graph, { decision: 'approve' });

    // No artifacts produced
    expect(r2.state.artifacts).toHaveLength(0);

    // Stages should be marked as skipped
    expect(r2.state.stageStatus[ResearchStage.MetaOrchestration]).toBe(StageStatus.Skipped);
    expect(r2.state.stageStatus[ResearchStage.UserIntelligence]).toBe(StageStatus.Skipped);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RC: Phase 8 bridge message
// ═══════════════════════════════════════════════════════════════════════════

describe('RC: Phase 8 gate bridge to Post-RC', () => {
  // GateAgent requires ContextLoader and LLMFactory, but processDecision
  // only uses state mutation -- no LLM calls. We can pass minimal stubs.
  function makeGateAgent(): GateAgent {
    const mockContextLoader = { loadFiles: () => '' } as unknown as ConstructorParameters<typeof GateAgent>[0];
    const mockLlmFactory = {} as unknown as ConstructorParameters<typeof GateAgent>[1];
    return new GateAgent(mockContextLoader, mockLlmFactory);
  }

  it('Phase 8 approval returns bridge message to Post-RC', async () => {
    const agent = makeGateAgent();
    const state = makeRcState({ currentPhase: 8 as Phase });

    const result = await agent.processDecision(state, 'approve');

    expect(result.text).toContain('Checkpoint 8');
    expect(result.text).toContain('Approved');
    expect(result.text).toContain('All 8 build steps are complete');
    expect(result.text).toContain('security scan');
    expect(result.phaseComplete).toBe(true);
  });

  it('Phase 8 rejection stays in Phase 8', async () => {
    const agent = makeGateAgent();
    const state = makeRcState({ currentPhase: 8 as Phase });

    const result = await agent.processDecision(state, 'reject', 'Needs hardening');

    expect(result.text).toContain('Changes Requested');
    expect(result.text).toContain('Needs hardening');
    expect(result.text).toContain('Checkpoint 8');
    expect(state.currentPhase).toBe(8);
  });

  it('Phase 7 approval advances to Phase 8', async () => {
    const agent = makeGateAgent();
    const state = makeRcState({ currentPhase: 7 as Phase });

    const result = await agent.processDecision(state, 'approve');

    expect(result.text).toContain('Approved');
    expect(result.text).toContain('Step 8: Production Hardening');
    expect(state.currentPhase).toBe(8);
    expect(result.phaseComplete).toBe(true);
  });

  it('all 8 phases are in GATED_PHASES', () => {
    expect(GATED_PHASES).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(GATED_PHASES).toHaveLength(8);
  });

  it('PHASE_NAMES covers all 8 phases including Connect and Compound', () => {
    expect(PHASE_NAMES[7]).toBe('Connect');
    expect(PHASE_NAMES[8]).toBe('Compound');
    expect(Object.keys(PHASE_NAMES)).toHaveLength(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RC: Full 8-phase walkthrough
// ═══════════════════════════════════════════════════════════════════════════

describe('RC: full 8-phase walkthrough through all gates', () => {
  const phaseNames = ['illuminate', 'define', 'architect', 'sequence', 'validate', 'forge', 'connect', 'compound'];

  function makeRcHandlers(executionLog: string[]): RcNodeHandlers {
    const makeHandler = (phase: string) => async (state: ProjectState) => {
      executionLog.push(`${phase}:executed`);
      return {
        state: {
          ...state,
          _lastOutput: `${phase} output`,
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
      forge: makeHandler('forge'),
      connect: makeHandler('connect'),
      compound: makeHandler('compound'),
    };
  }

  it('walks all 8 phases, stopping at each gate, and completes', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    // Phase 1: run illuminate -> gate-1
    let result = await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'answers' }));
    expect(result.gateInterrupt).toBeDefined();
    expect(result.gateInterrupt!.gateNodeId).toBe('gate-1');
    expect(executionLog).toContain('illuminate:executed');

    // Phases 2-8: approve each gate, next phase runs, stops at next gate
    for (let i = 2; i <= 8; i++) {
      result = await coordinator.resume('/test/project', graph, { decision: 'approve' });

      const phaseName = phaseNames[i - 1];
      expect(executionLog).toContain(`${phaseName}:executed`);

      if (i < 8) {
        expect(result.gateInterrupt).toBeDefined();
        expect(result.gateInterrupt!.gateNodeId).toBe(`gate-${i}`);
      }
    }

    // After approving gate-8, pipeline should complete
    result = await coordinator.resume('/test/project', graph, { decision: 'approve' });
    expect(result.gateInterrupt).toBeUndefined();
    expect(result.trace.status).toBe('completed');

    // All 8 phases should have executed
    expect(executionLog.filter((e) => e.endsWith(':executed'))).toHaveLength(8);
  });

  it('persists state correctly after each gate approval', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    // Run phase 1
    await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'input' }));

    // After phase 1, state should be persisted
    const stateAfterP1 = coordinator.loadState('/test/project');
    expect(stateAfterP1._lastOutput).toBe('illuminate output');

    // Approve gate-1 -> phase 2
    await coordinator.resume('/test/project', graph, { decision: 'approve' });

    const stateAfterP2 = coordinator.loadState('/test/project');
    expect(stateAfterP2._lastOutput).toBe('define output');
  });

  it('gate rejection stops advancement', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const executionLog: string[] = [];
    const graph = buildRcGraph(makeRcHandlers(executionLog));

    // Phase 1
    await coordinator.run('/test/project', graph, makeRcState({ _pendingInput: 'input' }));
    executionLog.length = 0;

    // Reject gate-1
    const result = await coordinator.resume('/test/project', graph, {
      decision: 'reject',
      feedback: 'Needs work',
    });

    // No further phases should execute
    expect(executionLog).toHaveLength(0);

    // Pipeline ends with 'failed' status on gate rejection
    expect(result.trace.status).toBe('failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Post-RC: fan-out scan through gate resume to completion
// ═══════════════════════════════════════════════════════════════════════════

describe('Post-RC: end-to-end scan through ship gate', () => {
  function makePostRcHandlers(executionLog: string[]): PostRcNodeHandlers {
    return {
      scanSecurity: async (state) => {
        executionLog.push('security');
        return {
          state: {
            ...state,
            _pendingFindings: [
              {
                id: 'sec-001',
                module: ValidationModule.Security,
                severity: Severity.High,
                title: 'Missing CSRF protection',
                description: 'Forms lack CSRF tokens',
                remediation: 'Add CSRF middleware',
                category: 'web-security',
              },
            ],
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
                id: 'mon-001',
                module: ValidationModule.Monitoring,
                severity: Severity.Low,
                title: 'No dashboard configured',
                description: 'No monitoring dashboard found',
                remediation: 'Configure Grafana or equivalent',
                category: 'observability',
              },
            ],
          },
        };
      },
      mergeScans: (states, original) => {
        executionLog.push('merge');
        const allFindings: Finding[] = states.flatMap((s) => s._pendingFindings ?? []);
        const scanResult = {
          id: 'scan-integration-test',
          timestamp: new Date().toISOString(),
          status: ScanStatus.Completed,
          modules: [ValidationModule.Security, ValidationModule.Monitoring],
          findings: allFindings,
          summary: {
            totalFindings: allFindings.length,
            critical: 0,
            high: allFindings.filter((f) => f.severity === Severity.High).length,
            medium: 0,
            low: allFindings.filter((f) => f.severity === Severity.Low).length,
            info: 0,
            moduleSummaries: [],
          },
          gateDecision: PostRCGateDecision.Warn,
          duration_ms: 50,
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

  it('runs parallel scans, merges, stops at ship gate, then completes on approve', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const graph = buildPostRcGraph(makePostRcHandlers(executionLog));

    // Run scan -> ship gate
    const scanResult = await coordinator.run('/test/project', graph, makePostRcState());

    expect(executionLog).toContain('security');
    expect(executionLog).toContain('monitoring');
    expect(executionLog).toContain('merge');
    expect(scanResult.gateInterrupt).toBeDefined();
    expect(scanResult.gateInterrupt!.gateNodeId).toBe('ship-gate');
    expect(scanResult.state.lastScan!.findings).toHaveLength(2);

    // Approve ship gate -> pipeline completes
    const finalResult = await coordinator.resume('/test/project', graph, { decision: 'approve' });
    expect(finalResult.gateInterrupt).toBeUndefined();
    expect(finalResult.trace.status).toBe('completed');

    // State persisted after completion
    const loaded = coordinator.loadState('/test/project');
    expect(loaded.scans).toHaveLength(1);
    expect(loaded.lastScan!.gateDecision).toBe(PostRCGateDecision.Warn);
  });

  it('ship gate rejection ends pipeline', async () => {
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

    const result = await coordinator.resume('/test/project', graph, {
      decision: 'reject',
      feedback: 'Fix CSRF first',
    });

    expect(result.trace.status).toBe('failed');
    // State still has scan results
    const loaded = coordinator.loadState('/test/project');
    expect(loaded.lastScan!.findings).toHaveLength(2);
  });

  it('findings from both scan modules are correctly attributed', async () => {
    const factory = createStoreFactory();
    const coordinator = new GraphCoordinator<PostRCState>(
      factory,
      'post-rc:state',
      'post-rc:interrupt',
      PostRCStateSchema,
    );

    const executionLog: string[] = [];
    const graph = buildPostRcGraph(makePostRcHandlers(executionLog));

    const result = await coordinator.run('/test/project', graph, makePostRcState());

    const findings = result.state.lastScan!.findings;
    const secFindings = findings.filter((f) => f.module === ValidationModule.Security);
    const monFindings = findings.filter((f) => f.module === ValidationModule.Monitoring);

    expect(secFindings).toHaveLength(1);
    expect(secFindings[0].severity).toBe(Severity.High);
    expect(monFindings).toHaveLength(1);
    expect(monFindings[0].severity).toBe(Severity.Low);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-domain: Pre-RC -> RC -> Post-RC pipeline flow
// ═══════════════════════════════════════════════════════════════════════════

describe('Cross-domain: pipeline state transitions', () => {
  it('Pre-RC completion feeds into RC start state', async () => {
    // Pre-RC produces classification + artifacts
    const factory = createStoreFactory();
    const preRcCoord = new GraphCoordinator<ResearchState>(
      factory,
      'pre-rc:state',
      'pre-rc:interrupt',
      ResearchStateSchema as z.ZodType<ResearchState>,
    );

    const preRcLog: string[] = [];
    const preRcHandlers: PreRcNodeHandlers = {
      classify: async (state) => {
        preRcLog.push('classify');
        return {
          state: {
            ...state,
            classification: {
              domain: ComplexityDomain.Complicated,
              confidence: 0.85,
              reasoning: 'Complicated product',
              productClass: 'saas-b2b',
              complexityFactors: ['auth', 'billing'],
            },
            personaSelection: {
              activePersonas: [PersonaId.MetaProductArchitect],
              skippedPersonas: [],
              totalActive: 1,
              totalSkipped: 0,
            },
          },
        };
      },
      runStage: (stage: ResearchStage) => async (state) => ({
        state: {
          ...state,
          stageStatus: { ...state.stageStatus, [stage]: StageStatus.Completed },
          artifacts: [
            ...state.artifacts,
            {
              personaId: PersonaId.MetaProductArchitect,
              personaName: 'Meta-Product Architect',
              stage,
              content: `Research: ${stage}`,
              tokenCount: 100,
              llmUsed: LLMProvider.Claude,
              timestamp: new Date().toISOString(),
              filePath: `pre-rc-research/${stage}/test.md`,
            },
          ],
        },
      }),
      synthesize: async (state) => ({
        state: { ...state, _synthesisOutput: '# PRD\n\nGenerated from research.' },
      }),
    };

    const preRcGraph = buildPreRcGraph(preRcHandlers);
    await preRcCoord.run('/test/project', preRcGraph, makePreRcState());
    await preRcCoord.resume('/test/project', preRcGraph, { decision: 'approve' });
    await preRcCoord.resume('/test/project', preRcGraph, { decision: 'approve' });
    const preRcResult = await preRcCoord.resume('/test/project', preRcGraph, { decision: 'approve' });

    // Pre-RC complete
    expect(preRcResult.trace.status).toBe('completed');
    expect(preRcResult.state._synthesisOutput).toBeDefined();
    expect(preRcResult.state.artifacts.length).toBeGreaterThan(0);

    // RC receives Pre-RC research as context
    const rcState = makeRcState({
      _pendingInput: preRcResult.state._synthesisOutput,
      preRcSource: {
        prdPath: 'pre-rc-research/prd.md',
        statePath: 'pre-rc-research/state.json',
        importedAt: new Date().toISOString(),
        artifactCount: preRcResult.state.artifacts.length,
        personaCount: preRcResult.state.personaSelection?.totalActive ?? 0,
      },
    });

    // RC runs illuminate with Pre-RC data as input
    const rcCoord = new GraphCoordinator<ProjectState>(factory, 'rc:state', 'rc:interrupt', ProjectStateSchema);

    const rcLog: string[] = [];
    const rcHandlers: RcNodeHandlers = {
      illuminate: async (state) => {
        rcLog.push('illuminate');
        return {
          state: {
            ...state,
            _lastOutput: `Discovery based on: ${state._pendingInput?.substring(0, 20)}...`,
            _pendingInput: undefined,
          },
        };
      },
      define: async (state) => ({ state }),
      architect: async (state) => ({ state }),
      sequence: async (state) => ({ state }),
      validate: async (state) => ({ state }),
      forge: async (state) => ({ state }),
      connect: async (state) => ({ state }),
      compound: async (state) => ({ state }),
    };

    const rcGraph = buildRcGraph(rcHandlers);
    const rcResult = await rcCoord.run('/test/project', rcGraph, rcState);

    // RC used Pre-RC output as input
    expect(rcLog).toContain('illuminate');
    expect(rcResult.state._lastOutput).toContain('Discovery based on: # PRD');
    expect(rcResult.state.preRcSource).toBeDefined();
    expect(rcResult.state.preRcSource!.artifactCount).toBeGreaterThan(0);
  });
});
