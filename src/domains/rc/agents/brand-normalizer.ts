import type { BrandProfile } from '../brand-types.js';

/**
 * BrandNormalizer
 *
 * Fills gaps in a partial BrandProfile to produce a complete, usable profile.
 * Two modes:
 * - 'strict': only use what was provided, mark gaps but don't fill them
 * - 'infer': fill reasonable defaults based on available context
 */
export class BrandNormalizer {
  /**
   * Normalize a partial brand profile into a complete one.
   * Returns the filled profile and a list of fields that were inferred.
   */
  normalize(partial: Partial<BrandProfile>, mode: 'strict' | 'infer'): { profile: BrandProfile; gaps: string[] } {
    const gaps: string[] = [];

    // Name (required)
    const name = partial.name ?? this.inferOrGap('name', 'Untitled Project', mode, gaps);

    // Colors
    const colors = this.normalizeColors(partial, mode, gaps);

    // Typography
    const typography = this.normalizeTypography(partial, mode, gaps);

    const profile: BrandProfile = {
      name,
      tagline: partial.tagline,
      logo: partial.logo,
      colors,
      typography,
      spacing: partial.spacing ?? this.inferSpacing(mode, gaps),
      shape: partial.shape ?? this.inferShape(partial, mode, gaps),
      imagery: partial.imagery,
      motion: partial.motion ?? this.inferMotion(mode, gaps),
      voice: partial.voice,
      accessibility: partial.accessibility ?? this.inferAccessibility(mode, gaps),
      principles: partial.principles,
      existingSystem: partial.existingSystem,
      version: partial.version,
      lastUpdated: partial.lastUpdated ?? new Date().toISOString().split('T')[0],
      owner: partial.owner,
    };

    return { profile, gaps };
  }

  // ── Color Normalization ─────────────────────────────────────────────────

  private normalizeColors(
    partial: Partial<BrandProfile>,
    mode: 'strict' | 'infer',
    gaps: string[],
  ): BrandProfile['colors'] {
    if (partial.colors) {
      // Fill neutral gaps
      const neutral = partial.colors.neutral ?? {
        lightest: '#FFFFFF',
        darkest: '#111111',
      };

      return {
        ...partial.colors,
        neutral,
      };
    }

    if (mode === 'strict') {
      gaps.push('colors.primary', 'colors.neutral');
      return {
        primary: { hex: '#3B82F6', name: 'Default Blue' },
        neutral: { lightest: '#FFFFFF', darkest: '#111111' },
      };
    }

    // Infer: use a safe default palette
    gaps.push('colors (inferred default)');
    return {
      primary: { hex: '#3B82F6', name: 'Blue', usage: 'Primary actions, CTAs' },
      secondary: { hex: '#6366F1', name: 'Indigo', usage: 'Secondary actions' },
      neutral: {
        lightest: '#FFFFFF',
        light: '#F5F5F5',
        medium: '#D4D4D4',
        dark: '#737373',
        darkest: '#171717',
      },
      semantic: {
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
    };
  }

  // ── Typography Normalization ────────────────────────────────────────────

  private normalizeTypography(
    partial: Partial<BrandProfile>,
    mode: 'strict' | 'infer',
    gaps: string[],
  ): BrandProfile['typography'] {
    if (partial.typography) {
      return {
        ...partial.typography,
        headingFont: {
          ...partial.typography.headingFont,
          source: partial.typography.headingFont.source ?? 'google',
          weights: partial.typography.headingFont.weights ?? [500, 600, 700],
        },
        bodyFont: {
          ...partial.typography.bodyFont,
          source: partial.typography.bodyFont.source ?? 'google',
          weights: partial.typography.bodyFont.weights ?? [400, 500],
        },
        scale: partial.typography.scale ?? {
          base: '16px',
          ratio: 1.25,
        },
        lineHeight: partial.typography.lineHeight ?? {
          heading: 1.2,
          body: 1.6,
        },
      };
    }

    if (mode === 'strict') {
      gaps.push('typography.headingFont', 'typography.bodyFont');
    } else {
      gaps.push('typography (inferred Inter)');
    }

    return {
      headingFont: { family: 'Inter', source: 'google', weights: [500, 600, 700] },
      bodyFont: { family: 'Inter', source: 'google', weights: [400, 500] },
      scale: { base: '16px', ratio: 1.25 },
      lineHeight: { heading: 1.2, body: 1.6 },
    };
  }

  // ── Shape Normalization ─────────────────────────────────────────────────

  private inferShape(partial: Partial<BrandProfile>, mode: 'strict' | 'infer', gaps: string[]): BrandProfile['shape'] {
    if (mode === 'strict') {
      gaps.push('shape');
      return undefined;
    }

    gaps.push('shape (inferred)');

    // If we have shadow style hints, infer corners
    // Hard offset shadows → sharper corners (brutalist)
    // Soft shadows → rounder corners (modern)
    const shadowStyle = partial.shape?.shadows?.style;
    if (shadowStyle?.includes('hard') || shadowStyle?.includes('offset')) {
      return {
        borderRadius: { default: 'sm' },
        borders: { width: '2px', style: 'solid', color: '#000000' },
        shadows: partial.shape?.shadows ?? { style: 'hard offset' },
      };
    }

    return {
      borderRadius: { default: 'md' },
      borders: { width: '1px', style: 'solid' },
      shadows: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.1)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        style: 'soft diffused',
      },
    };
  }

  // ── Spacing ─────────────────────────────────────────────────────────────

  private inferSpacing(mode: 'strict' | 'infer', gaps: string[]): BrandProfile['spacing'] {
    if (mode === 'strict') {
      gaps.push('spacing');
      return undefined;
    }

    gaps.push('spacing (inferred 4px base)');
    return {
      unit: 4,
      scale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
      containerMaxWidth: '1280px',
      sectionPadding: '96px vertical, 24px horizontal',
    };
  }

  // ── Motion ──────────────────────────────────────────────────────────────

  private inferMotion(mode: 'strict' | 'infer', gaps: string[]): BrandProfile['motion'] {
    if (mode === 'strict') {
      gaps.push('motion');
      return undefined;
    }

    gaps.push('motion (inferred purposeful)');
    return {
      philosophy: 'purposeful',
      duration: { fast: '100ms', normal: '200ms', slow: '400ms' },
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      reducedMotion: true,
    };
  }

  // ── Accessibility ───────────────────────────────────────────────────────

  private inferAccessibility(mode: 'strict' | 'infer', gaps: string[]): BrandProfile['accessibility'] {
    if (mode === 'strict') {
      gaps.push('accessibility');
      return undefined;
    }

    gaps.push('accessibility (inferred WCAG AA)');
    return {
      wcagLevel: 'AA',
      contrastRequirements: '4.5:1 for text, 3:1 for large text and UI components',
    };
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  private inferOrGap<T>(field: string, defaultValue: T, mode: 'strict' | 'infer', gaps: string[]): T {
    gaps.push(mode === 'strict' ? field : `${field} (inferred)`);
    return defaultValue;
  }
}
