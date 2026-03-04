/**
 * Tests for domain state Zod schemas -- roundtrip through CheckpointStore.
 *
 * Each domain gets a minimal valid fixture, saved to an in-memory CheckpointStore,
 * loaded back with Zod validation, and verified for equality. Also tests that
 * schemas reject invalid data.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';
import { NODE_IDS } from '../../src/shared/state/pipeline-id.js';

// ── Domain schemas ──────────────────────────────────────────────────────────

import { ResearchStateSchema } from '../../src/domains/pre-rc/state/schemas.js';
import { ProjectStateSchema } from '../../src/domains/rc/state/schemas.js';
import { PostRCStateSchema } from '../../src/domains/post-rc/state/schemas.js';
import { TraceabilityMatrixSchema } from '../../src/domains/traceability/state/schemas.js';

// ── Domain enums (for fixtures) ─────────────────────────────────────────────

import { ComplexityDomain, ResearchStage, StageStatus, PersonaId } from '../../src/domains/pre-rc/types.js';
import { LLMProvider, GateStatus } from '../../src/shared/types.js';
import { ValidationModule, Severity, ScanStatus, OverrideStatus } from '../../src/domains/post-rc/types.js';
import { GateDecision as PostRCGateDecision } from '../../src/domains/post-rc/types.js';
import { RequirementCategory } from '../../src/domains/traceability/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

let store: CheckpointStore;

function freshStore(): CheckpointStore {
  store = new CheckpointStore(':memory:');
  return store;
}

afterEach(() => {
  store?.close();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const preRcFixture = {
  projectPath: '/tmp/test-project',
  projectName: 'Test Product',
  brief: {
    name: 'Test Product',
    description: 'A test product for schema validation',
    rawInput: 'Build me a thing',
    timestamp: '2026-01-01T00:00:00.000Z',
  },
  classification: {
    domain: ComplexityDomain.Complicated,
    confidence: 0.85,
    reasoning: 'Moderate complexity',
    productClass: 'saas-b2b',
    complexityFactors: ['auth', 'billing'],
  },
  personaSelection: {
    activePersonas: [PersonaId.MetaProductArchitect, PersonaId.SystemsArchitect],
    skippedPersonas: [{ id: PersonaId.AIMLSpecialist, reason: 'Not relevant' }],
    totalActive: 2,
    totalSkipped: 1,
  },
  currentStage: ResearchStage.MetaOrchestration,
  stageStatus: {
    [ResearchStage.MetaOrchestration]: StageStatus.Completed,
    [ResearchStage.UserIntelligence]: StageStatus.NotStarted,
    [ResearchStage.BusinessMarket]: StageStatus.NotStarted,
    [ResearchStage.Technical]: StageStatus.NotStarted,
    [ResearchStage.UXCognitive]: StageStatus.NotStarted,
    [ResearchStage.Validation]: StageStatus.NotStarted,
  },
  artifacts: [
    {
      personaId: PersonaId.MetaProductArchitect,
      personaName: 'Meta-Product Architect',
      stage: ResearchStage.MetaOrchestration,
      content: 'Research output here',
      tokenCount: 1500,
      llmUsed: LLMProvider.Claude,
      timestamp: '2026-01-01T00:01:00.000Z',
      filePath: 'pre-rc-research/stage-1/meta-product-architect.md',
    },
  ],
  gates: [
    {
      gateNumber: 1 as const,
      status: GateStatus.Approved,
      feedback: 'Looks good',
      timestamp: '2026-01-01T00:02:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:02:00.000Z',
};

const rcFixture = {
  projectName: 'Test Product',
  projectPath: '/tmp/test-project',
  currentPhase: 3 as const,
  gates: {
    '1': { status: GateStatus.Approved, date: '2026-01-01', feedback: 'Good' },
    '2': { status: GateStatus.Approved, date: '2026-01-02' },
  },
  artifacts: ['rc-method/prds/PRD.md', 'rc-method/tasks/TASKS.md'],
  uxScore: 78,
  uxMode: 'standard' as const,
  preRcSource: {
    prdPath: 'pre-rc-research/PRD.md',
    statePath: 'pre-rc-research/state/PRC-STATE.md',
    importedAt: '2026-01-01T00:00:00.000Z',
    artifactCount: 12,
    personaCount: 15,
  },
};

const postRcFixture = {
  projectPath: '/tmp/test-project',
  projectName: 'Test Product',
  config: {
    projectPath: '/tmp/test-project',
    projectName: 'Test Product',
    activeModules: [ValidationModule.Security, ValidationModule.Monitoring],
    securityPolicy: {
      enabled: true,
      blockOnCritical: true,
      blockOnHigh: false,
      suppressedCWEs: ['CWE-79'],
      customPatterns: [],
    },
    monitoringPolicy: {
      enabled: true,
      requireErrorTracking: true,
      requireAnalytics: true,
      requireDashboards: true,
      requireAlerts: true,
    },
  },
  scans: [
    {
      id: 'scan-001',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: ScanStatus.Completed,
      modules: [ValidationModule.Security],
      findings: [
        {
          id: 'f-001',
          module: ValidationModule.Security,
          severity: Severity.Medium,
          title: 'XSS in login form',
          description: 'User input not sanitized',
          cweId: 'CWE-79',
          filePath: 'src/login.ts',
          lineRange: { start: 10, end: 15 },
          remediation: 'Sanitize input',
          category: 'injection',
        },
      ],
      summary: {
        totalFindings: 1,
        critical: 0,
        high: 0,
        medium: 1,
        low: 0,
        info: 0,
        moduleSummaries: [
          {
            module: ValidationModule.Security,
            findings: 1,
            passed: false,
            details: '1 medium finding',
          },
        ],
      },
      gateDecision: PostRCGateDecision.Warn,
      duration_ms: 1200,
    },
  ],
  overrides: [
    {
      id: 'ovr-001',
      findingId: 'f-001',
      reason: 'Accepted risk for MVP',
      overriddenBy: 'user',
      timestamp: '2026-01-01T01:00:00.000Z',
      expiresAt: '2026-04-01T00:00:00.000Z',
      status: OverrideStatus.Active,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T01:00:00.000Z',
};

const traceFixture = {
  projectName: 'Test Product',
  enhancedPrdPath: 'rc-traceability/enhanced-prd.md',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T01:00:00.000Z',
  requirements: [
    {
      id: 'REQ-FUNC-001',
      category: RequirementCategory.FUNC,
      title: 'User login',
      description: 'Users can log in with email/password',
      acceptanceCriteria: 'Login form submits and redirects',
      sourceSection: 'Authentication',
      status: 'implemented' as const,
      mappedTasks: ['TASK-001'],
      mappedFindings: ['f-001'],
      mappedFiles: ['src/login.ts'],
      verificationResult: 'pass' as const,
    },
  ],
  summary: {
    totalRequirements: 1,
    implemented: 1,
    verified: 1,
    failed: 0,
    orphanRequirements: [],
    orphanTasks: [],
    coveragePercent: 100,
  },
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Domain state schemas -- roundtrip through CheckpointStore', () => {
  describe('Pre-RC (ResearchStateSchema)', () => {
    it('roundtrips a full ResearchState through save/load', () => {
      const s = freshStore();
      s.save('pipe-1', NODE_IDS.PRE_RC_STATE, preRcFixture);
      const loaded = s.load('pipe-1', NODE_IDS.PRE_RC_STATE, ResearchStateSchema);
      expect(loaded.state).toEqual(preRcFixture);
    });

    it('rejects state missing required fields', () => {
      const s = freshStore();
      s.save('pipe-1', NODE_IDS.PRE_RC_STATE, { projectPath: '/tmp', projectName: 'X' });
      expect(() => s.load('pipe-1', NODE_IDS.PRE_RC_STATE, ResearchStateSchema)).toThrow(
        /Checkpoint validation failed/,
      );
    });

    it('rejects invalid enum values', () => {
      const s = freshStore();
      const bad = { ...preRcFixture, currentStage: 'bogus-stage' };
      s.save('pipe-1', NODE_IDS.PRE_RC_STATE, bad);
      expect(() => s.load('pipe-1', NODE_IDS.PRE_RC_STATE, ResearchStateSchema)).toThrow(
        /Checkpoint validation failed/,
      );
    });

    it('accepts null classification (pre-classify state)', () => {
      const s = freshStore();
      const preClassify = { ...preRcFixture, classification: null, personaSelection: null, currentStage: null };
      s.save('pipe-1', NODE_IDS.PRE_RC_STATE, preClassify);
      const loaded = s.load('pipe-1', NODE_IDS.PRE_RC_STATE, ResearchStateSchema);
      expect(loaded.state.classification).toBeNull();
    });
  });

  describe('RC Method (ProjectStateSchema)', () => {
    it('roundtrips a full ProjectState through save/load', () => {
      const s = freshStore();
      s.save('pipe-1', NODE_IDS.RC_STATE, rcFixture);
      const loaded = s.load('pipe-1', NODE_IDS.RC_STATE, ProjectStateSchema);
      expect(loaded.state).toEqual(rcFixture);
    });

    it('rejects invalid phase number', () => {
      const s = freshStore();
      const bad = { ...rcFixture, currentPhase: 99 };
      s.save('pipe-1', NODE_IDS.RC_STATE, bad);
      expect(() => s.load('pipe-1', NODE_IDS.RC_STATE, ProjectStateSchema)).toThrow(/Checkpoint validation failed/);
    });

    it('accepts minimal state (new project)', () => {
      const s = freshStore();
      const minimal = {
        projectName: 'New',
        projectPath: '/tmp/new',
        currentPhase: 1,
        gates: {},
        artifacts: [],
        uxScore: null,
        uxMode: null,
      };
      s.save('pipe-1', NODE_IDS.RC_STATE, minimal);
      const loaded = s.load('pipe-1', NODE_IDS.RC_STATE, ProjectStateSchema);
      expect(loaded.state.projectName).toBe('New');
      expect(loaded.state.uxScore).toBeNull();
    });

    it('accepts state with forgeTasks and selectedDesign', () => {
      const s = freshStore();
      const withForge = {
        ...rcFixture,
        forgeTasks: {
          'task-1': {
            taskId: 'task-1',
            status: 'complete' as const,
            startedAt: '2026-01-01',
            completedAt: '2026-01-02',
            generatedFiles: ['src/auth.ts'],
          },
        },
        selectedDesign: {
          optionId: 'opt-a',
          specPath: 'rc-method/prds/design-a.md',
          selectedAt: '2026-01-01',
        },
      };
      s.save('pipe-1', NODE_IDS.RC_STATE, withForge);
      const loaded = s.load('pipe-1', NODE_IDS.RC_STATE, ProjectStateSchema);
      expect(loaded.state.forgeTasks).toBeDefined();
      expect(loaded.state.selectedDesign).toBeDefined();
    });
  });

  describe('Post-RC (PostRCStateSchema)', () => {
    it('roundtrips a full PostRCState through save/load', () => {
      const s = freshStore();
      s.save('pipe-1', NODE_IDS.POST_RC_STATE, postRcFixture);
      const loaded = s.load('pipe-1', NODE_IDS.POST_RC_STATE, PostRCStateSchema);
      expect(loaded.state).toEqual(postRcFixture);
    });

    it('rejects missing config', () => {
      const s = freshStore();
      const bad = { projectPath: '/tmp', projectName: 'X', scans: [], overrides: [] };
      s.save('pipe-1', NODE_IDS.POST_RC_STATE, bad);
      expect(() => s.load('pipe-1', NODE_IDS.POST_RC_STATE, PostRCStateSchema)).toThrow(/Checkpoint validation failed/);
    });

    it('accepts state with lastScan and gateHistory', () => {
      const s = freshStore();
      const withHistory = {
        ...postRcFixture,
        lastScan: postRcFixture.scans[0],
        gateHistory: [
          {
            decision: 'approved' as const,
            scanId: 'scan-001',
            feedback: 'Ship it',
            timestamp: '2026-01-01T02:00:00.000Z',
          },
        ],
      };
      s.save('pipe-1', NODE_IDS.POST_RC_STATE, withHistory);
      const loaded = s.load('pipe-1', NODE_IDS.POST_RC_STATE, PostRCStateSchema);
      expect(loaded.state.lastScan).toBeDefined();
      expect(loaded.state.gateHistory).toHaveLength(1);
    });
  });

  describe('Traceability (TraceabilityMatrixSchema)', () => {
    it('roundtrips a full TraceabilityMatrix through save/load', () => {
      const s = freshStore();
      s.save('pipe-1', NODE_IDS.TRACEABILITY, traceFixture);
      const loaded = s.load('pipe-1', NODE_IDS.TRACEABILITY, TraceabilityMatrixSchema);
      expect(loaded.state).toEqual(traceFixture);
    });

    it('rejects invalid requirement category', () => {
      const s = freshStore();
      const bad = {
        ...traceFixture,
        requirements: [{ ...traceFixture.requirements[0], category: 'INVALID' }],
      };
      s.save('pipe-1', NODE_IDS.TRACEABILITY, bad);
      expect(() => s.load('pipe-1', NODE_IDS.TRACEABILITY, TraceabilityMatrixSchema)).toThrow(
        /Checkpoint validation failed/,
      );
    });

    it('accepts empty requirements and summary', () => {
      const s = freshStore();
      const empty = {
        ...traceFixture,
        requirements: [],
        summary: {
          totalRequirements: 0,
          implemented: 0,
          verified: 0,
          failed: 0,
          orphanRequirements: [],
          orphanTasks: [],
          coveragePercent: 0,
        },
      };
      s.save('pipe-1', NODE_IDS.TRACEABILITY, empty);
      const loaded = s.load('pipe-1', NODE_IDS.TRACEABILITY, TraceabilityMatrixSchema);
      expect(loaded.state.requirements).toHaveLength(0);
    });
  });

  describe('cross-domain isolation', () => {
    it('stores all 4 domain states in the same CheckpointStore without conflict', () => {
      const s = freshStore();
      const pipelineId = 'shared-pipeline';

      s.save(pipelineId, NODE_IDS.PRE_RC_STATE, preRcFixture);
      s.save(pipelineId, NODE_IDS.RC_STATE, rcFixture);
      s.save(pipelineId, NODE_IDS.POST_RC_STATE, postRcFixture);
      s.save(pipelineId, NODE_IDS.TRACEABILITY, traceFixture);

      // Each loads independently with its own schema
      const preRc = s.load(pipelineId, NODE_IDS.PRE_RC_STATE, ResearchStateSchema);
      const rc = s.load(pipelineId, NODE_IDS.RC_STATE, ProjectStateSchema);
      const postRc = s.load(pipelineId, NODE_IDS.POST_RC_STATE, PostRCStateSchema);
      const trace = s.load(pipelineId, NODE_IDS.TRACEABILITY, TraceabilityMatrixSchema);

      expect(preRc.state.projectName).toBe('Test Product');
      expect(rc.state.currentPhase).toBe(3);
      expect(postRc.state.scans).toHaveLength(1);
      expect(trace.state.requirements).toHaveLength(1);
    });
  });
});
