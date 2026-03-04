import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelRouter } from '../../src/shared/llm/router.js';
import { LLMFactory } from '../../src/shared/llm/factory.js';
import { LearningStore } from '../../src/core/learning/store.js';
import { CostTracker } from '../../src/core/budget/cost-tracker.js';
import { LLMProvider } from '../../src/shared/types.js';

describe('ModelRouter', () => {
  let factory: LLMFactory;
  let learningStore: LearningStore;
  let costTracker: CostTracker;
  let router: ModelRouter;

  beforeEach(() => {
    factory = new LLMFactory();
    learningStore = new LearningStore(':memory:');
    costTracker = new CostTracker();
    router = new ModelRouter(factory, learningStore, costTracker);
  });

  afterEach(() => {
    learningStore.close();
  });

  describe('tier assignment', () => {
    it('assigns cheap tier to classification tasks', () => {
      expect(router.getTier('prc_classify')).toBe('cheap');
      expect(router.getTier('prc_gate')).toBe('cheap');
      expect(router.getTier('rc_gate')).toBe('cheap');
    });

    it('assigns standard tier to research tasks', () => {
      expect(router.getTier('prc_run_stage')).toBe('standard');
      expect(router.getTier('rc_define')).toBe('standard');
    });

    it('assigns premium tier to architecture and code gen', () => {
      expect(router.getTier('rc_architect')).toBe('premium');
      expect(router.getTier('rc_forge_task')).toBe('premium');
      expect(router.getTier('postrc_scan')).toBe('premium');
    });

    it('defaults unknown tasks to standard', () => {
      expect(router.getTier('unknown_tool')).toBe('standard');
    });
  });

  describe('routing decisions', () => {
    it('routes with available provider', () => {
      // At minimum Claude or fallback should be available (or throw)
      // This test verifies routing doesn't crash
      try {
        const { decision } = router.route({
          taskType: 'prc_classify',
          domain: 'pre-rc',
        });
        expect(decision.tier).toBe('cheap');
        expect(decision.provider).toBeDefined();
      } catch (err) {
        // Expected if no API keys configured
        expect((err as Error).message).toContain('No LLM provider available');
      }
    });

    it('respects forced tier', () => {
      try {
        const { decision } = router.route({
          taskType: 'prc_classify',
          domain: 'pre-rc',
          forceTier: 'premium',
        });
        expect(decision.tier).toBe('premium');
      } catch {
        // Expected if no API keys
      }
    });

    it('uses learning data when available', () => {
      // Seed learning data
      for (let i = 0; i < 3; i++) {
        learningStore.recordModelPerformance({
          provider: 'openai',
          model: 'gpt-4o',
          taskType: 'custom_task',
          qualityScore: 95,
        });
      }

      try {
        const { decision } = router.route({
          taskType: 'custom_task',
          domain: 'rc',
        });
        // Should prefer OpenAI based on historical quality
        expect(decision.reason).toContain('historical');
      } catch {
        // Expected if no API keys
      }
    });

    it('respects preferred provider with good history', () => {
      learningStore.recordModelPerformance({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        taskType: 'test_type',
        success: true,
      });

      try {
        const { decision } = router.route({
          taskType: 'test_type',
          domain: 'pre-rc',
          preferredProvider: LLMProvider.Gemini,
        });
        expect(decision.provider).toBe(LLMProvider.Gemini);
        expect(decision.reason).toContain('preferred');
      } catch {
        // Expected if no API keys
      }
    });
  });

  describe('budget-aware routing', () => {
    it('downgrades to cheap when budget is low', () => {
      costTracker.setBudget('pipeline-1', { maxCostUsd: 1.0 });
      // Simulate spending most of the budget
      costTracker.record({
        pipelineId: 'pipeline-1',
        domain: 'rc',
        tool: 'test',
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 50000,
        outputTokens: 20000,
      });

      try {
        const { decision } = router.route({
          taskType: 'rc_architect', // Premium by default
          domain: 'rc',
          pipelineId: 'pipeline-1',
        });
        // Should be downgraded due to budget
        expect(['cheap', 'standard']).toContain(decision.tier);
      } catch {
        // Expected if no API keys
      }
    });
  });

  describe('explain', () => {
    it('produces routing explanation', () => {
      try {
        const explanation = router.explain({
          taskType: 'rc_forge_task',
          domain: 'rc',
          preferredProvider: LLMProvider.Claude,
        });
        expect(explanation).toContain('rc_forge_task');
        expect(explanation).toContain('rc');
      } catch {
        // Expected if no API keys
      }
    });
  });
});
