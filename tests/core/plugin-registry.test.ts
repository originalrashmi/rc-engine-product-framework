import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../../src/core/plugins/registry.js';
import type { RcPlugin, CustomSecurityRule } from '../../src/core/plugins/types.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('registration', () => {
    it('registers a plugin', async () => {
      const plugin: RcPlugin = {
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'A test plugin',
          capabilities: ['personas'],
        },
        personas: [
          {
            id: 'custom-analyst',
            name: 'Custom Analyst',
            stage: 'meta-orchestration',
            systemPrompt: 'You are a custom analyst.',
          },
        ],
      };

      const ok = await registry.register(plugin);
      expect(ok).toBe(true);
      expect(registry.getLoadedPlugins()).toHaveLength(1);
      expect(registry.getLoadedPlugins()[0].id).toBe('test-plugin');
    });

    it('rejects duplicate plugin IDs', async () => {
      const plugin: RcPlugin = {
        manifest: { id: 'dup', name: 'Dup', version: '1.0.0', description: '', capabilities: [] },
      };

      await registry.register(plugin);
      const ok = await registry.register(plugin);
      expect(ok).toBe(false);
    });

    it('calls initialize and respects false return', async () => {
      const plugin: RcPlugin = {
        manifest: { id: 'blocked', name: 'Blocked', version: '1.0.0', description: '', capabilities: [] },
        initialize: () => false,
      };

      const ok = await registry.register(plugin);
      expect(ok).toBe(false);
      expect(registry.getLoadedPlugins()).toHaveLength(0);
    });

    it('unregisters and calls destroy', async () => {
      let destroyed = false;
      const plugin: RcPlugin = {
        manifest: { id: 'destroyable', name: 'D', version: '1.0.0', description: '', capabilities: [] },
        destroy: () => {
          destroyed = true;
        },
      };

      await registry.register(plugin);
      await registry.unregister('destroyable');
      expect(destroyed).toBe(true);
      expect(registry.getLoadedPlugins()).toHaveLength(0);
    });
  });

  describe('custom personas', () => {
    it('aggregates personas from multiple plugins', async () => {
      await registry.register({
        manifest: { id: 'p1', name: 'P1', version: '1.0.0', description: '', capabilities: ['personas'] },
        personas: [{ id: 'analyst-1', name: 'Analyst 1', stage: 's1', systemPrompt: 'prompt1' }],
      });
      await registry.register({
        manifest: { id: 'p2', name: 'P2', version: '1.0.0', description: '', capabilities: ['personas'] },
        personas: [
          { id: 'analyst-2', name: 'Analyst 2', stage: 's2', systemPrompt: 'prompt2' },
          { id: 'analyst-3', name: 'Analyst 3', stage: 's2', systemPrompt: 'prompt3' },
        ],
      });

      const personas = registry.getCustomPersonas();
      expect(personas).toHaveLength(3);
    });
  });

  describe('custom security rules', () => {
    it('aggregates security rules from plugins', async () => {
      const rule: CustomSecurityRule = {
        id: 'HIPAA-001',
        pattern: /patient.*data.*unencrypted/gi,
        title: 'Unencrypted patient data',
        severity: 'critical',
        cweId: 'CWE-311',
        category: 'hipaa',
        remediation: 'Encrypt all patient data at rest and in transit.',
      };

      await registry.register({
        manifest: {
          id: 'hipaa',
          name: 'HIPAA Rules',
          version: '1.0.0',
          description: '',
          capabilities: ['security-rules'],
        },
        securityRules: [rule],
      });

      const rules = registry.getCustomSecurityRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('HIPAA-001');
    });
  });

  describe('custom gate criteria', () => {
    it('evaluates gate criteria and returns failures', async () => {
      await registry.register({
        manifest: { id: 'strict', name: 'Strict', version: '1.0.0', description: '', capabilities: ['gate-criteria'] },
        gateCriteria: [
          {
            id: 'min-words',
            name: 'Minimum word count',
            domain: 'rc',
            gates: [2],
            evaluate: (ctx) => ({
              passed: ctx.phaseOutput.split(' ').length >= 100,
              reason: 'Phase output must be at least 100 words',
              overridable: true,
            }),
          },
        ],
      });

      const failures = await registry.evaluateGateCriteria({
        domain: 'rc',
        phase: 'Define',
        gateNumber: 2,
        phaseOutput: 'Too short',
        projectPath: '/tmp/test',
      });

      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toContain('100 words');
    });

    it('skips criteria for non-matching gates', async () => {
      await registry.register({
        manifest: { id: 'gate5-only', name: 'G5', version: '1.0.0', description: '', capabilities: ['gate-criteria'] },
        gateCriteria: [
          {
            id: 'g5-check',
            name: 'Gate 5 check',
            domain: 'rc',
            gates: [5],
            evaluate: () => ({ passed: false, reason: 'Always fails' }),
          },
        ],
      });

      // Gate 3 should not trigger gate-5-only criterion
      const failures = await registry.evaluateGateCriteria({
        domain: 'rc',
        phase: 'Architect',
        gateNumber: 3,
        phaseOutput: 'output',
        projectPath: '/tmp/test',
      });

      expect(failures).toHaveLength(0);
    });
  });

  describe('lifecycle hooks', () => {
    it('fires onBeforePhase and blocks on false', async () => {
      await registry.register({
        manifest: {
          id: 'blocker',
          name: 'Blocker',
          version: '1.0.0',
          description: '',
          capabilities: ['lifecycle-hooks'],
        },
        hooks: {
          onBeforePhase: () => false,
        },
      });

      const allowed = await registry.fireBeforePhase({
        domain: 'rc',
        phase: 'Forge',
        projectPath: '/tmp',
        projectName: 'Test',
        timestamp: new Date().toISOString(),
      });

      expect(allowed).toBe(false);
    });

    it('fires onAfterGate for all plugins', async () => {
      const events: string[] = [];

      await registry.register({
        manifest: { id: 'logger1', name: 'L1', version: '1.0.0', description: '', capabilities: ['lifecycle-hooks'] },
        hooks: {
          onAfterGate: (e) => {
            events.push(`l1:${e.decision}`);
          },
        },
      });
      await registry.register({
        manifest: { id: 'logger2', name: 'L2', version: '1.0.0', description: '', capabilities: ['lifecycle-hooks'] },
        hooks: {
          onAfterGate: (e) => {
            events.push(`l2:${e.decision}`);
          },
        },
      });

      await registry.fireAfterGate({
        domain: 'rc',
        phase: 'Define',
        gateNumber: 2,
        decision: 'approved',
        projectPath: '/tmp',
        projectName: 'Test',
        timestamp: new Date().toISOString(),
      });

      expect(events).toEqual(['l1:approved', 'l2:approved']);
    });

    it('handles hook errors gracefully', async () => {
      await registry.register({
        manifest: {
          id: 'crashy',
          name: 'Crashy',
          version: '1.0.0',
          description: '',
          capabilities: ['lifecycle-hooks'],
        },
        hooks: {
          onAfterPhase: () => {
            throw new Error('boom');
          },
        },
      });

      // Should not throw
      await registry.fireAfterPhase({
        domain: 'rc',
        phase: 'Architect',
        projectPath: '/tmp',
        projectName: 'Test',
        timestamp: new Date().toISOString(),
      });
    });
  });

  describe('summary', () => {
    it('returns correct summary', async () => {
      await registry.register({
        manifest: {
          id: 'full',
          name: 'Full',
          version: '1.0.0',
          description: '',
          capabilities: ['personas', 'security-rules'],
        },
        personas: [{ id: 'p1', name: 'P1', stage: 's1', systemPrompt: 'p' }],
        securityRules: [
          { id: 'R1', pattern: /test/g, title: 'T', severity: 'low', category: 'test', remediation: 'fix' },
          { id: 'R2', pattern: /test2/g, title: 'T2', severity: 'low', category: 'test', remediation: 'fix' },
        ],
        hooks: {
          onBeforePhase: () => true,
          onAfterGate: () => {},
        },
      });

      const summary = registry.getSummary();
      expect(summary.loaded).toBe(1);
      expect(summary.personas).toBe(1);
      expect(summary.securityRules).toBe(2);
      expect(summary.hooks).toBe(2);
    });
  });
});
