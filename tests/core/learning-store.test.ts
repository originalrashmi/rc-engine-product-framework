import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LearningStore } from '../../src/core/learning/store.js';

describe('LearningStore', () => {
  let store: LearningStore;

  beforeEach(() => {
    store = new LearningStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // ── Gate Outcomes ─────────────────────────────────────────────────────

  describe('gate outcomes', () => {
    it('records and retrieves gate outcomes', () => {
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'Test App',
        domain: 'rc',
        phase: 'Architect',
        gateNumber: 3,
        decision: 'approved',
      });

      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'Test App',
        domain: 'rc',
        phase: 'Architect',
        gateNumber: 3,
        decision: 'rejected',
        feedback: 'Missing API design',
      });

      const rate = store.getPhaseApprovalRate('rc', 'Architect');
      expect(rate.approved).toBe(1);
      expect(rate.rejected).toBe(1);
      expect(rate.rate).toBe(0.5);
    });

    it('returns 100% rate when no data exists', () => {
      const rate = store.getPhaseApprovalRate('rc', 'NonExistent');
      expect(rate.rate).toBe(1.0);
    });

    it('tracks rejection reasons', () => {
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'App',
        domain: 'rc',
        phase: 'Define',
        gateNumber: 2,
        decision: 'rejected',
        feedback: 'Missing user stories',
      });
      store.recordGateOutcome({
        projectId: 'proj-2',
        projectName: 'App 2',
        domain: 'rc',
        phase: 'Define',
        gateNumber: 2,
        decision: 'rejected',
        feedback: 'Missing user stories',
      });

      const reasons = store.getRejectionReasons('rc', 'Define');
      expect(reasons).toContain('Missing user stories');
    });

    it('auto-creates project outcome on first gate', () => {
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'App',
        domain: 'rc',
        phase: 'Illuminate',
        gateNumber: 1,
        decision: 'approved',
      });

      const history = store.getProjectHistory();
      expect(history).toHaveLength(1);
      expect(history[0].projectName).toBe('App');
      expect(history[0].totalGatesApproved).toBe(1);
    });
  });

  // ── Model Performance ─────────────────────────────────────────────────

  describe('model performance', () => {
    it('records and ranks models by quality', () => {
      // Record several data points
      for (let i = 0; i < 3; i++) {
        store.recordModelPerformance({
          provider: 'claude',
          model: 'claude-sonnet-4-5',
          taskType: 'architecture',
          qualityScore: 90,
          latencyMs: 5000,
          costUsd: 0.05,
        });
        store.recordModelPerformance({
          provider: 'openai',
          model: 'gpt-4o',
          taskType: 'architecture',
          qualityScore: 75,
          latencyMs: 3000,
          costUsd: 0.03,
        });
      }

      const ranking = store.getModelRanking('architecture');
      expect(ranking).toHaveLength(2);
      expect(ranking[0].provider).toBe('claude'); // Higher quality
      expect(ranking[0].qualityScore).toBe(90);
      expect(ranking[1].provider).toBe('openai');
    });

    it('getBestModel returns null with no data', () => {
      expect(store.getBestModel('unknown')).toBeNull();
    });

    it('requires minimum 2 samples for ranking', () => {
      store.recordModelPerformance({
        provider: 'claude',
        model: 'claude-sonnet',
        taskType: 'test-task',
        qualityScore: 95,
      });

      const ranking = store.getModelRanking('test-task');
      expect(ranking).toHaveLength(0); // Only 1 sample, need 2
    });

    it('tracks success rate per provider', () => {
      store.recordModelPerformance({
        provider: 'openai',
        model: 'gpt-4o',
        taskType: 'scan',
        success: true,
      });
      store.recordModelPerformance({
        provider: 'openai',
        model: 'gpt-4o',
        taskType: 'scan',
        success: false,
      });

      const rate = store.getProviderSuccessRate('openai', 'scan');
      expect(rate).toBe(0.5);
    });
  });

  // ── Project Outcomes ──────────────────────────────────────────────────

  describe('project outcomes', () => {
    it('updates project outcome status', () => {
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'My App',
        domain: 'rc',
        phase: 'Illuminate',
        gateNumber: 1,
        decision: 'approved',
      });

      store.updateProjectOutcome('proj-1', 'shipped', 'Deployed successfully');

      const history = store.getProjectHistory();
      expect(history[0].outcome).toBe('shipped');
      expect(history[0].notes).toBe('Deployed successfully');
    });

    it('increments gate counters across multiple decisions', () => {
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'App',
        domain: 'rc',
        phase: 'P1',
        gateNumber: 1,
        decision: 'approved',
      });
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'App',
        domain: 'rc',
        phase: 'P2',
        gateNumber: 2,
        decision: 'rejected',
      });
      store.recordGateOutcome({
        projectId: 'proj-1',
        projectName: 'App',
        domain: 'rc',
        phase: 'P2',
        gateNumber: 2,
        decision: 'approved',
      });

      const history = store.getProjectHistory();
      expect(history[0].totalGatesApproved).toBe(2);
      expect(history[0].totalGatesRejected).toBe(1);
    });
  });

  // ── Cross-Project Insights ────────────────────────────────────────────

  describe('insights', () => {
    it('returns empty array with no history', () => {
      const insights = store.getInsights();
      expect(insights).toEqual([]);
    });

    it('generates rejection hotspot insights', () => {
      // Create a phase with high rejection rate
      for (let i = 0; i < 5; i++) {
        store.recordGateOutcome({
          projectId: `proj-${i}`,
          projectName: `App ${i}`,
          domain: 'rc',
          phase: 'Architect',
          gateNumber: 3,
          decision: 'rejected',
          feedback: 'Architecture too complex',
        });
      }
      // One approval so the phase exists
      store.recordGateOutcome({
        projectId: 'proj-ok',
        projectName: 'Good App',
        domain: 'rc',
        phase: 'Architect',
        gateNumber: 3,
        decision: 'approved',
      });

      const insights = store.getInsights();
      const hotspot = insights.find((i) => i.source === 'phase-hotspot');
      expect(hotspot).toBeDefined();
      expect(hotspot!.message).toContain('Architect');
    });

    it('generates cross-project insights from keywords', () => {
      store.recordGateOutcome({
        projectId: 'proj-ecom',
        projectName: 'Ecommerce Dashboard',
        domain: 'rc',
        phase: 'P1',
        gateNumber: 1,
        decision: 'approved',
      });
      store.updateProjectOutcome('proj-ecom', 'shipped');

      const insights = store.getInsights('building an ecommerce platform');
      const crossProject = insights.find((i) => i.source === 'cross-project');
      expect(crossProject).toBeDefined();
      expect(crossProject!.message).toContain('Ecommerce Dashboard');
    });
  });

  // ── Summary ───────────────────────────────────────────────────────────

  describe('summary', () => {
    it('returns correct counts', () => {
      store.recordGateOutcome({
        projectId: 'p1',
        projectName: 'A',
        domain: 'rc',
        phase: 'P1',
        gateNumber: 1,
        decision: 'approved',
      });
      store.recordModelPerformance({
        provider: 'claude',
        model: 'sonnet',
        taskType: 'test',
        qualityScore: 80,
      });

      const summary = store.getSummary();
      expect(summary.totalProjects).toBe(1);
      expect(summary.totalGateDecisions).toBe(1);
      expect(summary.totalModelRecords).toBe(1);
    });
  });
});
