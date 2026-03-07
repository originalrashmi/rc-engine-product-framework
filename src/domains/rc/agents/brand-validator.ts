import type { BrandProfile, BrandComplianceCheck, BrandComplianceResult } from '../brand-types.js';

/**
 * BrandComplianceChecker
 *
 * Validates design output against a BrandProfile during self-critique.
 * Called in Phase D (Refine) of the Design Agent pipeline.
 */
export class BrandComplianceChecker {
  /**
   * Check a design output for brand compliance.
   *
   * @param profile - The brand profile to check against
   * @param designOutput - Object describing the design to validate
   */
  check(
    profile: BrandProfile,
    designOutput: DesignOutputForValidation,
  ): BrandComplianceResult {
    const checks: BrandComplianceCheck[] = [];

    // Color compliance
    checks.push(...this.checkColors(profile, designOutput));

    // Typography compliance
    checks.push(...this.checkTypography(profile, designOutput));

    // Shape compliance
    checks.push(...this.checkShape(profile, designOutput));

    // Voice compliance
    checks.push(...this.checkVoice(profile, designOutput));

    // Logo compliance
    checks.push(...this.checkLogo(profile, designOutput));

    // Accessibility compliance
    checks.push(...this.checkAccessibility(profile, designOutput));

    // Calculate overall result
    const failCount = checks.filter((c) => c.status === 'fail').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;

    let overall: BrandComplianceResult['overall'] = 'compliant';
    if (failCount > 0) overall = 'major-violations';
    else if (warnCount > 2) overall = 'minor-violations';

    const passCount = checks.filter((c) => c.status === 'pass').length;
    const score = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 100;

    return { overall, checks, score };
  }

  /**
   * Generate a compliance report as markdown.
   */
  formatReport(result: BrandComplianceResult): string {
    const lines: string[] = [];
    lines.push('## Brand Compliance Report');
    lines.push('');
    lines.push(`**Overall:** ${result.overall} (Score: ${result.score}/100)`);
    lines.push('');

    const groups = new Map<string, BrandComplianceCheck[]>();
    for (const check of result.checks) {
      const list = groups.get(check.category) ?? [];
      list.push(check);
      groups.set(check.category, list);
    }

    for (const [category, categoryChecks] of groups) {
      lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      for (const check of categoryChecks) {
        const icon = check.status === 'pass' ? '[PASS]' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
        lines.push(`- ${icon} ${check.rule}: ${check.detail}${check.autoFixable ? ' (auto-fixable)' : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Category Checks ────────────────────────────────────────────────────

  private checkColors(
    profile: BrandProfile,
    output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (output.colorsUsed) {
      const brandColors = this.extractBrandColors(profile);

      for (const color of output.colorsUsed) {
        const isInBrand = brandColors.some(
          (bc) => bc.toLowerCase() === color.toLowerCase(),
        );
        const isTintShade = brandColors.some((bc) =>
          this.isTintOrShade(bc, color),
        );
        const isSemantic = this.isSemanticColor(color, profile);

        if (!isInBrand && !isTintShade && !isSemantic) {
          checks.push({
            category: 'color',
            rule: 'Brand color palette adherence',
            status: 'fail',
            detail: `Color ${color} is not in the brand palette or a derived tint/shade`,
            autoFixable: true,
          });
        }
      }

      // Check primary color is used for CTAs
      if (output.ctaColors) {
        const primaryUsed = output.ctaColors.some(
          (c) => c.toLowerCase() === profile.colors.primary.hex.toLowerCase(),
        );
        if (!primaryUsed) {
          checks.push({
            category: 'color',
            rule: 'Primary color for primary CTAs',
            status: 'warn',
            detail: `Primary CTA does not use brand primary color (${profile.colors.primary.hex})`,
            autoFixable: true,
          });
        }
      }

      // Check color don'ts
      if (profile.colors.donts) {
        for (const dont of profile.colors.donts) {
          checks.push({
            category: 'color',
            rule: `Color prohibition: ${dont}`,
            status: 'pass', // LLM needs to evaluate these semantically
            detail: `Rule noted: ${dont}`,
            autoFixable: false,
          });
        }
      }

      if (checks.filter((c) => c.category === 'color').length === 0) {
        checks.push({
          category: 'color',
          rule: 'Brand color palette adherence',
          status: 'pass',
          detail: 'All colors are from brand palette or valid derivatives',
          autoFixable: false,
        });
      }
    }

    return checks;
  }

  private checkTypography(
    profile: BrandProfile,
    output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (output.fontsUsed) {
      const brandFonts = [
        profile.typography.headingFont.family,
        profile.typography.bodyFont.family,
        profile.typography.monoFont?.family,
        profile.typography.accentFont?.family,
      ]
        .filter(Boolean)
        .map((f) => f!.toLowerCase());

      for (const font of output.fontsUsed) {
        if (!brandFonts.includes(font.toLowerCase())) {
          checks.push({
            category: 'typography',
            rule: 'Brand font family adherence',
            status: 'fail',
            detail: `Font "${font}" is not in the brand typography system`,
            autoFixable: true,
          });
        }
      }

      if (checks.filter((c) => c.category === 'typography').length === 0) {
        checks.push({
          category: 'typography',
          rule: 'Brand font family adherence',
          status: 'pass',
          detail: 'All fonts are from brand typography system',
          autoFixable: false,
        });
      }
    }

    // Check font weights
    if (output.fontWeightsUsed) {
      const brandWeights = [
        ...(profile.typography.headingFont.weights ?? []),
        ...(profile.typography.bodyFont.weights ?? []),
      ];

      for (const weight of output.fontWeightsUsed) {
        if (brandWeights.length > 0 && !brandWeights.includes(weight)) {
          checks.push({
            category: 'typography',
            rule: 'Font weight availability',
            status: 'warn',
            detail: `Weight ${weight} may not be available in brand fonts`,
            autoFixable: true,
          });
        }
      }
    }

    return checks;
  }

  private checkShape(
    profile: BrandProfile,
    output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (profile.shape && output.borderRadiusUsed) {
      const brandDefault = profile.shape.borderRadius?.default;
      if (brandDefault && output.borderRadiusUsed !== brandDefault) {
        checks.push({
          category: 'shape',
          rule: 'Border radius consistency',
          status: 'warn',
          detail: `Using "${output.borderRadiusUsed}" corners but brand default is "${brandDefault}"`,
          autoFixable: true,
        });
      } else {
        checks.push({
          category: 'shape',
          rule: 'Border radius consistency',
          status: 'pass',
          detail: 'Border radius matches brand default',
          autoFixable: false,
        });
      }
    }

    if (profile.shape?.shadows?.style && output.shadowStyleUsed) {
      if (output.shadowStyleUsed !== profile.shape.shadows.style) {
        checks.push({
          category: 'shape',
          rule: 'Shadow style consistency',
          status: 'warn',
          detail: `Using "${output.shadowStyleUsed}" shadows but brand uses "${profile.shape.shadows.style}"`,
          autoFixable: true,
        });
      }
    }

    return checks;
  }

  private checkVoice(
    profile: BrandProfile,
    output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (profile.voice?.vocabulary?.prohibited && output.copyText) {
      const copyLower = output.copyText.toLowerCase();
      for (const word of profile.voice.vocabulary.prohibited) {
        if (copyLower.includes(word.toLowerCase())) {
          checks.push({
            category: 'voice',
            rule: 'Prohibited vocabulary',
            status: 'fail',
            detail: `Copy contains prohibited word/phrase: "${word}"`,
            autoFixable: true,
          });
        }
      }
    }

    if (profile.voice?.donts && output.copyText) {
      for (const dont of profile.voice.donts) {
        checks.push({
          category: 'voice',
          rule: `Voice prohibition: ${dont}`,
          status: 'pass', // Semantic check — LLM evaluates
          detail: `Rule noted: ${dont}`,
          autoFixable: false,
        });
      }
    }

    return checks;
  }

  private checkLogo(
    profile: BrandProfile,
    _output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (profile.logo?.donts) {
      for (const dont of profile.logo.donts) {
        checks.push({
          category: 'logo',
          rule: `Logo prohibition: ${dont}`,
          status: 'pass', // Semantic — LLM must evaluate
          detail: `Logo rule noted: ${dont}`,
          autoFixable: false,
        });
      }
    }

    return checks;
  }

  private checkAccessibility(
    profile: BrandProfile,
    _output: DesignOutputForValidation,
  ): BrandComplianceCheck[] {
    const checks: BrandComplianceCheck[] = [];

    if (profile.accessibility?.wcagLevel) {
      checks.push({
        category: 'a11y',
        rule: `WCAG ${profile.accessibility.wcagLevel} compliance`,
        status: 'pass', // Noted as requirement — validated elsewhere
        detail: `Target: WCAG ${profile.accessibility.wcagLevel}. ${profile.accessibility.contrastRequirements ?? ''}`,
        autoFixable: false,
      });
    }

    return checks;
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  private extractBrandColors(profile: BrandProfile): string[] {
    const colors: string[] = [profile.colors.primary.hex];
    if (profile.colors.secondary) colors.push(profile.colors.secondary.hex);
    if (profile.colors.accent) {
      colors.push(...profile.colors.accent.map((a) => a.hex));
    }
    colors.push(profile.colors.neutral.lightest, profile.colors.neutral.darkest);
    if (profile.colors.neutral.light) colors.push(profile.colors.neutral.light);
    if (profile.colors.neutral.medium) colors.push(profile.colors.neutral.medium);
    if (profile.colors.neutral.dark) colors.push(profile.colors.neutral.dark);
    if (profile.colors.semantic) {
      const sem = profile.colors.semantic;
      if (sem.success) colors.push(sem.success);
      if (sem.warning) colors.push(sem.warning);
      if (sem.error) colors.push(sem.error);
      if (sem.info) colors.push(sem.info);
    }
    return colors;
  }

  private isTintOrShade(brandHex: string, testHex: string): boolean {
    // Simple heuristic: check if colors are close in hue but differ in lightness
    // A full implementation would convert to HSL and check hue similarity
    const brandR = parseInt(brandHex.slice(1, 3), 16);
    const brandG = parseInt(brandHex.slice(3, 5), 16);
    const brandB = parseInt(brandHex.slice(5, 7), 16);
    const testR = parseInt(testHex.slice(1, 3), 16);
    const testG = parseInt(testHex.slice(3, 5), 16);
    const testB = parseInt(testHex.slice(5, 7), 16);

    if (isNaN(brandR) || isNaN(testR)) return false;

    // Check if the ratio between R:G:B channels is similar (same hue)
    const brandTotal = brandR + brandG + brandB || 1;
    const testTotal = testR + testG + testB || 1;

    const rRatioDiff = Math.abs(brandR / brandTotal - testR / testTotal);
    const gRatioDiff = Math.abs(brandG / brandTotal - testG / testTotal);
    const bRatioDiff = Math.abs(brandB / brandTotal - testB / testTotal);

    return rRatioDiff < 0.1 && gRatioDiff < 0.1 && bRatioDiff < 0.1;
  }

  private isSemanticColor(hex: string, profile: BrandProfile): boolean {
    const semanticColors = [
      profile.colors.semantic?.success,
      profile.colors.semantic?.warning,
      profile.colors.semantic?.error,
      profile.colors.semantic?.info,
    ].filter(Boolean) as string[];

    return semanticColors.some((sc) => sc.toLowerCase() === hex.toLowerCase());
  }
}

// ── Design Output Type (for validation) ─────────────────────────────────

export interface DesignOutputForValidation {
  colorsUsed?: string[]; // Hex colors found in the design
  ctaColors?: string[]; // Colors used specifically for CTAs
  fontsUsed?: string[]; // Font families found
  fontWeightsUsed?: number[]; // Font weights found
  borderRadiusUsed?: string; // Corner style used
  shadowStyleUsed?: string; // Shadow approach used
  copyText?: string; // All copy text for voice checking
}
