import { describe, it, expect } from 'vitest';
import {
  ChallengeFindingSchema,
  ChallengeLensResultSchema,
  ChallengeReportSchema,
  COMMUNITY_LENSES,
  PRO_LENSES,
  CHALLENGER_LENSES,
} from '../../src/domains/rc/challenger-types.js';

describe('Challenger Types', () => {
  const validFinding = {
    id: 'C1',
    lens: 'ICP Alignment',
    element: 'Hero section',
    problem: 'CTA is too small on mobile',
    evidence: '60% of users are on mobile',
    fix: 'Increase to 48px minimum touch target',
    severity: 'critical' as const,
  };

  describe('ChallengeFindingSchema', () => {
    it('validates a complete finding', () => {
      expect(ChallengeFindingSchema.safeParse(validFinding).success).toBe(true);
    });

    it('allows optional evidence', () => {
      const { evidence: _, ...noEvidence } = validFinding;
      expect(ChallengeFindingSchema.safeParse(noEvidence).success).toBe(true);
    });

    it('validates all severity levels', () => {
      for (const severity of ['critical', 'high', 'recommendation'] as const) {
        const finding = { ...validFinding, severity };
        expect(ChallengeFindingSchema.safeParse(finding).success).toBe(true);
      }
    });

    it('rejects invalid severity', () => {
      const bad = { ...validFinding, severity: 'low' };
      expect(ChallengeFindingSchema.safeParse(bad).success).toBe(false);
    });
  });

  describe('ChallengeLensResultSchema', () => {
    it('validates a lens result', () => {
      const result = {
        lens: 'ICP Alignment',
        rating: 'DRIFTED',
        criticalCount: 1,
        findings: [validFinding],
      };
      expect(ChallengeLensResultSchema.safeParse(result).success).toBe(true);
    });

    it('allows empty findings array', () => {
      const result = {
        lens: 'Copy',
        rating: 'SHARP',
        criticalCount: 0,
        findings: [],
      };
      expect(ChallengeLensResultSchema.safeParse(result).success).toBe(true);
    });
  });

  describe('ChallengeReportSchema', () => {
    it('validates a complete report', () => {
      const report = {
        projectName: 'Test App',
        verdict: 'NOT_READY' as const,
        lenses: [
          { lens: 'ICP Alignment', rating: 'DRIFTED', criticalCount: 1, findings: [validFinding] },
        ],
        criticalIssues: [validFinding],
        highPriorityIssues: [],
        recommendations: [],
        survivors: ['Clean typography choices'],
      };
      expect(ChallengeReportSchema.safeParse(report).success).toBe(true);
    });

    it('validates all verdict types', () => {
      for (const verdict of ['READY', 'NOT_READY', 'CRITICAL_FAILURES'] as const) {
        const report = {
          projectName: 'Test',
          verdict,
          lenses: [],
          criticalIssues: [],
          highPriorityIssues: [],
          recommendations: [],
          survivors: [],
        };
        expect(ChallengeReportSchema.safeParse(report).success).toBe(true);
      }
    });
  });

  describe('Lens Constants', () => {
    it('community has 3 lenses', () => {
      expect(COMMUNITY_LENSES).toHaveLength(3);
      expect(COMMUNITY_LENSES).toContain('icp_alignment');
      expect(COMMUNITY_LENSES).toContain('copy');
      expect(COMMUNITY_LENSES).toContain('design_decisions');
    });

    it('pro has 5 lenses', () => {
      expect(PRO_LENSES).toHaveLength(5);
      expect(PRO_LENSES).toContain('conversion_path');
      expect(PRO_LENSES).toContain('accessibility');
    });

    it('community lenses are a subset of pro lenses', () => {
      for (const lens of COMMUNITY_LENSES) {
        expect(PRO_LENSES).toContain(lens);
      }
    });

    it('all challenger lenses are defined', () => {
      expect(CHALLENGER_LENSES).toHaveLength(5);
    });
  });
});
