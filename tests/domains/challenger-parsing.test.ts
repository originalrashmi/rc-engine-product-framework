import { describe, it, expect } from 'vitest';

/**
 * Tests the ChallengerAgent's parsing logic for findings and ratings.
 * These are extracted from the private methods for testability.
 */

type ChallengerLens = 'icp_alignment' | 'copy' | 'design_decisions' | 'conversion_path' | 'accessibility';

interface ChallengeFinding {
  id: string;
  lens: string;
  element: string;
  problem: string;
  evidence?: string;
  fix: string;
  severity: 'critical' | 'high' | 'recommendation';
}

const LENS_DISPLAY_NAMES: Record<ChallengerLens, string> = {
  icp_alignment: 'ICP Alignment',
  copy: 'Copy',
  design_decisions: 'Design Decisions',
  conversion_path: 'Conversion Path',
  accessibility: 'Accessibility & Inclusion',
};

function parseFindings(text: string, lens: ChallengerLens): ChallengeFinding[] {
  const findings: ChallengeFinding[] = [];
  const blocks = text.split(/FINDING:\s*/i).slice(1);

  for (const block of blocks) {
    const id = block.match(/^([CHR]\d+)/i)?.[1] ?? `${lens[0].toUpperCase()}?`;
    const severity = block.match(/SEVERITY:\s*(critical|high|recommendation)/i)?.[1] as
      | 'critical' | 'high' | 'recommendation' | undefined;
    const element = block.match(/ELEMENT:\s*(.+)/i)?.[1]?.trim() ?? 'Unknown';
    const problem = block.match(/PROBLEM:\s*(.+)/i)?.[1]?.trim() ?? block.slice(0, 200);
    const evidence = block.match(/EVIDENCE:\s*(.+)/i)?.[1]?.trim();
    const fix = block.match(/FIX:\s*(.+)/i)?.[1]?.trim() ?? 'Review and address';

    findings.push({
      id,
      lens: LENS_DISPLAY_NAMES[lens],
      element,
      problem,
      evidence,
      fix,
      severity: severity ?? 'high',
    });
  }

  if (findings.length === 0 && text.length > 100) {
    findings.push({
      id: 'U1',
      lens: LENS_DISPLAY_NAMES[lens],
      element: 'Overall',
      problem: 'See detailed analysis below',
      fix: 'Address findings in the analysis',
      severity: 'high',
    });
  }

  return findings;
}

function parseRating(text: string, lens: ChallengerLens): string {
  const ratingMatch = text.match(/RATING:\s*(\w+)/i);
  if (ratingMatch) return ratingMatch[1].toUpperCase();

  const ratingMap: Record<ChallengerLens, string[]> = {
    icp_alignment: ['ALIGNED', 'DRIFTED', 'DISCONNECTED'],
    copy: ['SHARP', 'SOFT', 'HOLLOW'],
    design_decisions: ['JUSTIFIED', 'FASHIONABLE', 'DECORATIVE'],
    conversion_path: ['CONVERTING', 'LEAKING', 'BROKEN'],
    accessibility: ['INCLUSIVE', 'EXCLUDING', 'HOSTILE'],
  };

  for (const rating of ratingMap[lens]) {
    if (text.toUpperCase().includes(rating)) return rating;
  }

  return 'UNRATED';
}

describe('Challenger Finding Parser', () => {
  it('parses well-formatted findings', () => {
    const text = `
FINDING: C1
SEVERITY: critical
ELEMENT: Hero section
PROBLEM: CTA is invisible on mobile
EVIDENCE: 60% of ICP users are mobile-first
FIX: Increase CTA size to 48px min and add contrast
---

FINDING: H1
SEVERITY: high
ELEMENT: Pricing page
PROBLEM: Too many tiers overwhelm users
FIX: Reduce from 5 to 3 tiers
---`;

    const findings = parseFindings(text, 'icp_alignment');
    expect(findings).toHaveLength(2);

    expect(findings[0].id).toBe('C1');
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].element).toBe('Hero section');
    expect(findings[0].problem).toBe('CTA is invisible on mobile');
    expect(findings[0].evidence).toBe('60% of ICP users are mobile-first');
    expect(findings[0].fix).toContain('48px');
    expect(findings[0].lens).toBe('ICP Alignment');

    expect(findings[1].id).toBe('H1');
    expect(findings[1].severity).toBe('high');
    expect(findings[1].evidence).toBeUndefined();
  });

  it('handles recommendation severity', () => {
    const text = `FINDING: R1
SEVERITY: recommendation
ELEMENT: Footer
PROBLEM: Social links could use hover states
FIX: Add hover color transition`;

    const findings = parseFindings(text, 'copy');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('recommendation');
    expect(findings[0].lens).toBe('Copy');
  });

  it('defaults to high severity when missing', () => {
    const text = `FINDING: X1
ELEMENT: Something
PROBLEM: No severity specified
FIX: Add it`;

    const findings = parseFindings(text, 'design_decisions');
    expect(findings[0].severity).toBe('high');
  });

  it('creates fallback finding for unstructured long text', () => {
    const longText = 'A'.repeat(200);
    const findings = parseFindings(longText, 'accessibility');
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('U1');
    expect(findings[0].element).toBe('Overall');
  });

  it('returns empty for short text with no findings', () => {
    const findings = parseFindings('Short text', 'copy');
    expect(findings).toHaveLength(0);
  });
});

describe('Challenger Rating Parser', () => {
  it('extracts explicit RATING line', () => {
    expect(parseRating('Some analysis...\n\nRATING: DRIFTED', 'icp_alignment')).toBe('DRIFTED');
  });

  it('is case-insensitive for RATING keyword', () => {
    expect(parseRating('rating: sharp', 'copy')).toBe('SHARP');
  });

  it('falls back to detecting rating words in text', () => {
    expect(parseRating('The design is clearly DECORATIVE in nature', 'design_decisions')).toBe('DECORATIVE');
  });

  it('returns UNRATED when no rating found', () => {
    expect(parseRating('Nothing relevant here', 'conversion_path')).toBe('UNRATED');
  });

  it('matches the correct rating for each lens', () => {
    expect(parseRating('RATING: ALIGNED', 'icp_alignment')).toBe('ALIGNED');
    expect(parseRating('RATING: HOLLOW', 'copy')).toBe('HOLLOW');
    expect(parseRating('RATING: JUSTIFIED', 'design_decisions')).toBe('JUSTIFIED');
    expect(parseRating('RATING: BROKEN', 'conversion_path')).toBe('BROKEN');
    expect(parseRating('RATING: INCLUSIVE', 'accessibility')).toBe('INCLUSIVE');
  });
});
