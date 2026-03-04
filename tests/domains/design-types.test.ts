import { describe, it, expect } from 'vitest';
import {
  DesignStyleSchema,
  DesignOptionSchema,
  DesignSpecSchema,
  estimateDesignCost,
} from '../../src/domains/rc/design-types.js';

describe('Design Types', () => {
  const validStyle = {
    name: 'Minimal Modern',
    colorPalette: {
      primary: '#2563EB',
      secondary: '#7C3AED',
      background: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#1E293B',
      muted: '#94A3B8',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      scale: 'standard' as const,
    },
    layout: {
      maxWidth: '1200px',
      spacing: 'comfortable' as const,
      borderRadius: 'rounded' as const,
    },
    personality: 'Clean and professional with subtle warmth',
  };

  const validOption = {
    id: 'A',
    name: 'Clean Professional',
    style: validStyle,
    rationale: 'Fits the enterprise B2B audience',
    icpAlignment: 85,
    keyScreens: [
      { name: 'Dashboard', description: 'Main overview with key metrics' },
      { name: 'Settings', description: 'User preferences and config' },
    ],
    tradeoffs: {
      strengths: ['Professional look', 'Good readability'],
      weaknesses: ['Less visually distinctive'],
    },
  };

  describe('DesignStyleSchema', () => {
    it('validates a complete style object', () => {
      const result = DesignStyleSchema.safeParse(validStyle);
      expect(result.success).toBe(true);
    });

    it('rejects invalid typography scale', () => {
      const bad = { ...validStyle, typography: { ...validStyle.typography, scale: 'huge' } };
      const result = DesignStyleSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects invalid border radius', () => {
      const bad = { ...validStyle, layout: { ...validStyle.layout, borderRadius: 'massive' } };
      const result = DesignStyleSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects missing color palette fields', () => {
      const bad = {
        ...validStyle,
        colorPalette: { primary: '#000' },
      };
      const result = DesignStyleSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('accepts all valid spacing values', () => {
      for (const spacing of ['tight', 'comfortable', 'airy'] as const) {
        const style = { ...validStyle, layout: { ...validStyle.layout, spacing } };
        expect(DesignStyleSchema.safeParse(style).success).toBe(true);
      }
    });
  });

  describe('DesignOptionSchema', () => {
    it('validates a complete option', () => {
      const result = DesignOptionSchema.safeParse(validOption);
      expect(result.success).toBe(true);
    });

    it('rejects ICP alignment over 100', () => {
      const bad = { ...validOption, icpAlignment: 150 };
      const result = DesignOptionSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects negative ICP alignment', () => {
      const bad = { ...validOption, icpAlignment: -5 };
      const result = DesignOptionSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('allows empty key screens array', () => {
      const opt = { ...validOption, keyScreens: [] };
      const result = DesignOptionSchema.safeParse(opt);
      expect(result.success).toBe(true);
    });
  });

  describe('DesignSpecSchema', () => {
    const validSpec = {
      projectName: 'Test App',
      icpSummary: 'Small business owners aged 30-50',
      competitorGaps: ['No mobile support', 'Complex onboarding'],
      designTrends: ['Bento grids', 'Glassmorphism'],
      options: [validOption],
      recommendation: { optionId: 'A', reason: 'Best ICP alignment' },
    };

    it('validates a complete spec with 1 option', () => {
      const result = DesignSpecSchema.safeParse(validSpec);
      expect(result.success).toBe(true);
    });

    it('validates a spec with 3 options', () => {
      const threeOptions = {
        ...validSpec,
        options: [
          validOption,
          { ...validOption, id: 'B', name: 'Bold Enterprise', icpAlignment: 72 },
          { ...validOption, id: 'C', name: 'Playful Consumer', icpAlignment: 60 },
        ],
      };
      const result = DesignSpecSchema.safeParse(threeOptions);
      expect(result.success).toBe(true);
    });

    it('rejects empty options array', () => {
      const bad = { ...validSpec, options: [] };
      const result = DesignSpecSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects more than 3 options', () => {
      const bad = {
        ...validSpec,
        options: [validOption, validOption, validOption, validOption],
      };
      const result = DesignSpecSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('estimateDesignCost', () => {
    it('estimates cost for 1 option', () => {
      const cost = estimateDesignCost(1);
      expect(cost.calls).toBe(3); // 2 per option + 1 overhead
      expect(cost.estimatedTokens).toBe(14000); // 12000 + 2000
      expect(cost.estimatedUsd).toBeCloseTo(0.21, 1);
    });

    it('estimates cost for 3 options', () => {
      const cost = estimateDesignCost(3);
      expect(cost.calls).toBe(7); // 6 per option + 1 overhead
      expect(cost.estimatedTokens).toBe(38000); // 36000 + 2000
      expect(cost.estimatedUsd).toBeCloseTo(0.57, 1);
    });

    it('3 options cost more than 1 option', () => {
      const cost1 = estimateDesignCost(1);
      const cost3 = estimateDesignCost(3);
      expect(cost3.estimatedUsd).toBeGreaterThan(cost1.estimatedUsd);
      expect(cost3.calls).toBeGreaterThan(cost1.calls);
    });
  });
});
