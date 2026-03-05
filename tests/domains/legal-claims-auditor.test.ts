/**
 * Tests for the Claims Auditor module (Agent 1).
 *
 * Layer 1: Static pattern detection against documentation.
 * Layer 2: LLM-based claims analysis (mocked).
 */

import { describe, it, expect } from 'vitest';
import {
  createIdGenerator,
  parseLlmLegalFindings,
  deduplicateFindings,
} from '../../src/domains/post-rc/modules/legal/legal-patterns.js';
import { ValidationModule, Severity } from '../../src/domains/post-rc/types.js';
import type { Finding } from '../../src/domains/post-rc/types.js';

// ── ID Generator ─────────────────────────────────────────────────────────────

describe('Legal ID Generator', () => {
  it('generates sequential IDs with prefix', () => {
    const nextId = createIdGenerator('LGL-CLM');
    expect(nextId()).toBe('LGL-CLM-001');
    expect(nextId()).toBe('LGL-CLM-002');
    expect(nextId()).toBe('LGL-CLM-003');
  });

  it('pads to 3 digits', () => {
    const nextId = createIdGenerator('LGL');
    for (let i = 0; i < 99; i++) nextId();
    expect(nextId()).toBe('LGL-100');
  });
});

// ── LLM Response Parsing ─────────────────────────────────────────────────────

describe('parseLlmLegalFindings', () => {
  it('parses valid JSON array into Finding[]', () => {
    const raw = `[
      {
        "title": "Unqualified specialist count",
        "severity": "medium",
        "description": "Claims 20 but only 3-20 activate",
        "remediation": "Add qualifier",
        "category": "claims-quantity"
      }
    ]`;
    const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL-CLM-LLM');
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Unqualified specialist count');
    expect(findings[0].severity).toBe(Severity.Medium);
    expect(findings[0].module).toBe(ValidationModule.LegalClaims);
    expect(findings[0].id).toBe('LGL-CLM-LLM-001');
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const raw =
      '```json\n[{"title":"Test","severity":"high","description":"Desc","remediation":"Fix","category":"claims"}]\n```';
    const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.High);
  });

  it('returns empty array for invalid JSON', () => {
    const raw = 'This is not JSON at all.';
    const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL');
    expect(findings).toHaveLength(0);
  });

  it('skips entries without title or description', () => {
    const raw = '[{"severity":"high","remediation":"Fix","category":"claims"}]';
    const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL');
    expect(findings).toHaveLength(0);
  });

  it('defaults severity to medium when missing', () => {
    const raw = '[{"title":"Test","description":"Desc","remediation":"Fix","category":"claims"}]';
    const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL');
    expect(findings[0].severity).toBe(Severity.Medium);
  });

  it('maps all severity levels correctly', () => {
    const levels = ['critical', 'high', 'medium', 'low', 'info'];
    const expected = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low, Severity.Info];
    for (let i = 0; i < levels.length; i++) {
      const raw = `[{"title":"T","description":"D","severity":"${levels[i]}","remediation":"R","category":"c"}]`;
      const findings = parseLlmLegalFindings(raw, ValidationModule.LegalClaims, 'LGL');
      expect(findings[0].severity).toBe(expected[i]);
    }
  });
});

// ── De-duplication ───────────────────────────────────────────────────────────

describe('deduplicateFindings', () => {
  const makeFinding = (title: string, category: string): Finding => ({
    id: 'LGL-001',
    module: ValidationModule.LegalClaims,
    severity: Severity.Medium,
    title,
    description: 'Test',
    remediation: 'Fix',
    category,
  });

  it('removes duplicates with same category and similar title', () => {
    const existing = [makeFinding('Unqualified specialist count claim', 'claims-quantity')];
    const llm = [makeFinding('Unqualified specialist count', 'claims-quantity')];
    const result = deduplicateFindings(existing, llm);
    expect(result).toHaveLength(0);
  });

  it('keeps findings with different categories', () => {
    const existing = [makeFinding('Test finding', 'claims-quantity')];
    const llm = [makeFinding('Test finding', 'claims-capability')];
    const result = deduplicateFindings(existing, llm);
    expect(result).toHaveLength(1);
  });

  it('keeps findings with different titles', () => {
    const existing = [makeFinding('First finding', 'claims-quantity')];
    const llm = [makeFinding('Completely different finding', 'claims-quantity')];
    const result = deduplicateFindings(existing, llm);
    expect(result).toHaveLength(1);
  });

  it('handles empty arrays', () => {
    expect(deduplicateFindings([], [])).toHaveLength(0);
    const finding = makeFinding('Test', 'claims');
    expect(deduplicateFindings([], [finding])).toHaveLength(1);
    expect(deduplicateFindings([finding], [])).toHaveLength(0);
  });
});
