import { describe, it, expect } from 'vitest';
import { ValueCalculator, getRoleRegistry } from '../../src/core/value/index.js';

describe('Value Calculator', () => {
  describe('RoleRegistry', () => {
    const registry = getRoleRegistry();

    it('looks up persona roles by ID', () => {
      const role = registry.getPersonaRole('primary-user-researcher');
      expect(role).not.toBeNull();
      expect(role!.roleTitle).toBe('UX Researcher');
      expect(role!.hourlyRateUsd).toBe(85);
      expect(role!.estimatedHours).toBe(16);
      expect(role!.category).toBe('research');
    });

    it('normalizes persona IDs', () => {
      const role = registry.getPersonaRole('Meta Product Architect');
      expect(role).not.toBeNull();
      expect(role!.roleTitle).toBe('Product Strategy Consultant');
    });

    it('returns null for unknown persona', () => {
      expect(registry.getPersonaRole('nonexistent-persona')).toBeNull();
    });

    it('looks up phase roles', () => {
      const role = registry.getPhaseRole('architect');
      expect(role).not.toBeNull();
      expect(role!.roleTitle).toBe('Senior Software Architect');
      expect(role!.hourlyRateUsd).toBe(175);
      expect(role!.estimatedHours).toBe(40);
    });

    it('looks up Post-RC roles', () => {
      const role = registry.getPostRcRole('security-scan');
      expect(role).not.toBeNull();
      expect(role!.roleTitle).toBe('Security Engineer / Pen Tester');
      expect(role!.hourlyRateUsd).toBe(160);
    });

    it('excludes zero-hour personas from getAllPersonaRoles', () => {
      const all = registry.getAllPersonaRoles();
      const tokenOptimizer = all.find((r) => r.personaId === 'token-economics-optimizer');
      expect(tokenOptimizer).toBeUndefined();
      expect(all.length).toBeGreaterThan(15);
    });

    it('returns all phase roles', () => {
      const phases = registry.getAllPhaseRoles();
      expect(phases.length).toBe(8);
      const phaseNames = phases.map((p) => p.phase);
      expect(phaseNames).toContain('illuminate');
      expect(phaseNames).toContain('forge');
    });

    it('calculates maximum value', () => {
      const max = registry.getMaximumValue();
      expect(max.totalHours).toBeGreaterThan(300);
      expect(max.totalCostUsd).toBeGreaterThan(25000);
      expect(max.roleCount).toBeGreaterThan(25);
    });
  });

  describe('ValueCalculator', () => {
    const calc = new ValueCalculator();

    it('calculates value for a full pipeline run', () => {
      const report = calc.calculate({
        projectName: 'Test App',
        activatedPersonas: [
          'primary-user-researcher',
          'market-landscape-analyst',
          'systems-architect',
          'security-analyst',
          'ux-systems-designer',
        ],
        completedPhases: ['illuminate', 'define', 'architect', 'sequence', 'validate', 'forge'],
        forgeTaskCount: 5,
        postRcTools: ['security-scan', 'traceability'],
        aiCostUsd: 8.5,
        aiDurationMinutes: 45,
        pipelineDurationMinutes: 120,
      });

      expect(report.projectName).toBe('Test App');
      expect(report.rolesReplaced.length).toBeGreaterThan(10);
      expect(report.totalHumanHours).toBeGreaterThan(100);
      expect(report.totalHumanCostUsd).toBeGreaterThan(15000);
      expect(report.costSavingsUsd).toBeGreaterThan(15000);
      expect(report.costSavingsPercent).toBeGreaterThan(99);
      expect(report.speedMultiplier).toBeGreaterThan(100);
      expect(report.equivalentTeamSize).toBeGreaterThan(10);
      expect(report.annualSavingsUsd).toBeGreaterThan(100000);
    });

    it('handles empty input', () => {
      const report = calc.calculate({ projectName: 'Empty' });
      expect(report.rolesReplaced).toHaveLength(0);
      expect(report.totalHumanHours).toBe(0);
      expect(report.totalHumanCostUsd).toBe(0);
      expect(report.costSavingsPercent).toBe(0);
      expect(report.speedMultiplier).toBe(0);
    });

    it('multiplies forge tasks', () => {
      const oneTask = calc.calculate({
        projectName: 'One',
        completedPhases: ['forge'],
        forgeTaskCount: 1,
      });
      const fiveTasks = calc.calculate({
        projectName: 'Five',
        completedPhases: ['forge'],
        forgeTaskCount: 5,
      });

      const forgeOneHours = oneTask.rolesReplaced.find((r) => r.pipelineKey === 'forge')!.estimatedHours;
      const forgeFiveHours = fiveTasks.rolesReplaced.find((r) => r.pipelineKey === 'forge')!.estimatedHours;
      expect(forgeFiveHours).toBe(forgeOneHours * 5);
    });

    it('skips unknown personas gracefully', () => {
      const report = calc.calculate({
        projectName: 'Partial',
        activatedPersonas: ['primary-user-researcher', 'nonexistent-one', 'systems-architect'],
      });
      expect(report.rolesReplaced.length).toBe(2);
    });

    it('skips token-economics-optimizer (zero hours)', () => {
      const report = calc.calculate({
        projectName: 'With Internal',
        activatedPersonas: ['token-economics-optimizer', 'primary-user-researcher'],
      });
      expect(report.rolesReplaced.length).toBe(1);
      expect(report.rolesReplaced[0].roleTitle).toBe('UX Researcher');
    });

    it('computes category breakdown', () => {
      const report = calc.calculate({
        projectName: 'Categories',
        activatedPersonas: ['primary-user-researcher', 'systems-architect', 'security-analyst'],
        completedPhases: ['architect'],
      });

      expect(report.byCategory['research']).toBeDefined();
      expect(report.byCategory['engineering']).toBeDefined();
      expect(report.byCategory['security']).toBeDefined();
      expect(report.byCategory['research'].roles).toBe(1);
      expect(report.byCategory['security'].roles).toBe(1);
    });

    it('calculates speed multiplier correctly', () => {
      const report = calc.calculate({
        projectName: 'Speed',
        activatedPersonas: ['primary-user-researcher'], // 16 hours
        aiDurationMinutes: 5, // 5 min = 0.0833 hours
      });

      // 16 / 0.0833 = ~192
      expect(report.speedMultiplier).toBeGreaterThan(150);
    });

    it('handles zero AI duration with Infinity speed', () => {
      const report = calc.calculate({
        projectName: 'Instant',
        activatedPersonas: ['primary-user-researcher'],
        aiDurationMinutes: 0,
      });
      expect(report.speedMultiplier).toBe(Infinity);
    });

    it('uses custom projects per year for annual projection', () => {
      const report = calc.calculate({
        projectName: 'Custom Annual',
        activatedPersonas: ['primary-user-researcher'],
        aiCostUsd: 1,
        projectsPerYear: 24,
      });

      const singleSavings = report.costSavingsUsd;
      expect(report.annualSavingsUsd).toBeCloseTo(singleSavings * 24, 0);
    });

    it('formats plain-text summary', () => {
      const report = calc.calculate({
        projectName: 'Summary Test',
        activatedPersonas: ['primary-user-researcher', 'systems-architect'],
        completedPhases: ['define', 'architect'],
        aiCostUsd: 5,
        aiDurationMinutes: 30,
      });

      const text = calc.formatSummary(report);
      expect(text).toContain('Summary Test');
      expect(text).toContain('professionals replaced');
      expect(text).toContain('hours of work saved');
      expect(text).toContain('AI cost');
      expect(text).toContain('faster than a human team');
    });

    it('formats markdown report', () => {
      const report = calc.calculate({
        projectName: 'MD Test',
        activatedPersonas: ['primary-user-researcher'],
        completedPhases: ['define'],
        aiCostUsd: 2,
      });

      const md = calc.formatMarkdown(report);
      expect(md).toContain('# Value Report');
      expect(md).toContain('| Role | Hours | Cost |');
      expect(md).toContain('UX Researcher');
      expect(md).toContain('Product Manager');
      expect(md).toContain('By Category');
    });

    it('calculates maximum possible value', () => {
      const max = calc.calculateMaximum();
      expect(max.totalHours).toBeGreaterThan(300);
      expect(max.totalCostUsd).toBeGreaterThan(25000);
      expect(max.roleCount).toBeGreaterThan(25);
    });
  });
});
