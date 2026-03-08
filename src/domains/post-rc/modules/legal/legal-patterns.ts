/**
 * Shared utilities for the legal review modules (Claims Auditor + Product Legal Auditor).
 *
 * Provides common types, regex patterns, ID generation, and LLM response parsing
 * used by both legal modules.
 */

import type { Finding, ValidationModule } from '../../types.js';
import { Severity } from '../../types.js';

// ── Legal Categories ─────────────────────────────────────────────────────────

export type LegalCategory =
  | 'terms-of-service'
  | 'privacy-policy'
  | 'data-handling'
  | 'gdpr'
  | 'ccpa'
  | 'hipaa'
  | 'pci-dss'
  | 'coppa'
  | 'ferpa'
  | 'accessibility'
  | 'licensing'
  | 'claims-quantity'
  | 'claims-capability'
  | 'claims-performance'
  | 'claims-value'
  | 'claims-completeness'
  | 'disclaimer'
  | 'ip-risk';

// ── Common Patterns ──────────────────────────────────────────────────────────

/** Patterns indicating user data collection. */
export const USER_DATA_PATTERNS =
  /user\s*(?:data|account|login|signup|sign.?up|registration|auth|profile)|collect(?:s|ing)?\s*(?:personal|user|customer)\s*(?:data|information)/i;

/** Patterns indicating PII fields in feature descriptions. */
export const PII_FIELD_PATTERNS =
  /\b(?:email|phone\s*number|address|ssn|social\s*security|credit\s*card|date\s*of\s*birth|passport|driver.?s?\s*licen[cs]e)\b/i;

/** Patterns indicating healthcare domain. */
export const HEALTHCARE_PATTERNS =
  /\b(?:health|medical|patient|diagnosis|prescription|treatment|clinical|EHR|PHI|ePHI|telehealth|telemedicine|HIPAA)\b/i;

/** Patterns indicating finance/payment domain. */
export const FINANCE_PATTERNS =
  /\b(?:payment|banking|credit|financial|PCI|transaction|stripe|payment\s*processing|checkout|billing|debit\s*card|card\s*number|CVV)\b/i;

/** Patterns indicating children's domain. */
export const CHILDREN_PATTERNS =
  /\b(?:child(?:ren)?|kid|minor|under\s*13|under\s*thirteen|COPPA|K-12|parental\s*consent|youth)\b/i;

/** Patterns indicating education domain. */
export const EDUCATION_PATTERNS = /\b(?:student\s*record|FERPA|school|university|college|transcript|enrollment)\b/i;

/** Patterns indicating a web/mobile UI product. */
export const UI_PRODUCT_PATTERNS =
  /\b(?:web\s*app|mobile\s*app|user\s*interface|dashboard|portal|SPA|single.page|frontend|React|Vue|Angular|Next\.?js|landing\s*page)\b/i;

/** Patterns indicating privacy policy reference. */
export const PRIVACY_POLICY_PATTERNS = /\b(?:privacy\s*policy|data\s*protection|GDPR|data\s*handling)\b/i;

/** Patterns indicating terms of service reference. */
export const TOS_PATTERNS = /\b(?:terms\s*of\s*service|terms\s*of\s*use|user\s*agreement|EULA)\b/i;

/** Patterns indicating accessibility reference. */
export const ACCESSIBILITY_PATTERNS = /\b(?:accessibility|WCAG|ADA|aria|screen\s*reader|a11y|keyboard\s*navigation)\b/i;

/** Patterns indicating AI/ML components. */
export const AI_COMPONENT_PATTERNS =
  /\b(?:AI|artificial\s*intelligence|machine\s*learning|ML|LLM|GPT|Claude|neural\s*network|model\s*training|inference)\b/i;

/** Patterns indicating cookie usage (for EU ePrivacy). */
export const COOKIE_PATTERNS =
  /\b(?:cookie|session\s*storage|local\s*storage|tracking\s*pixel|analytics|Google\s*Analytics|Mixpanel|Segment|Hotjar|Amplitude)\b/i;

/** Patterns indicating cookie consent mechanisms. */
export const COOKIE_CONSENT_PATTERNS =
  /\b(?:cookie\s*(?:consent|banner|policy|notice)|ePrivacy|cookie\s*opt[- ]?in)\b/i;

/** Patterns indicating user-generated content. */
export const UGC_PATTERNS =
  /\b(?:user[- ]?generated|user\s*upload|comment|review|post|forum|social|community|marketplace|UGC|file\s*upload|media\s*upload|profile\s*photo|avatar)\b/i;

/** Patterns indicating DMCA/content moderation. */
export const DMCA_PATTERNS =
  /\b(?:DMCA|takedown|content\s*moderat|copyright\s*(?:report|notice|claim)|prohibited\s*content)\b/i;

/** Patterns indicating subscription/recurring billing. */
export const SUBSCRIPTION_PATTERNS =
  /\b(?:subscri|recurring|auto[- ]?renew|monthly\s*(?:plan|fee|billing)|annual\s*(?:plan|fee|billing)|free\s*trial|SaaS|pricing\s*(?:tier|plan))\b/i;

/** Patterns indicating auto-renewal disclosure. */
export const RENEWAL_DISCLOSURE_PATTERNS =
  /\b(?:auto[- ]?renewal\s*disclos|cancel(?:lation)?\s*(?:policy|process|flow)|refund\s*policy)\b/i;

/** Patterns indicating data breach response plan. */
export const BREACH_PLAN_PATTERNS =
  /\b(?:breach\s*(?:notification|response|plan|procedure)|incident\s*response|security\s*incident)\b/i;

/** Patterns indicating third-party service integrations. */
export const THIRD_PARTY_PATTERNS =
  /\b(?:Stripe|AWS|Firebase|Twilio|SendGrid|Mailgun|Braintree|PayPal|Shopify|Heroku|Vercel|Supabase|Auth0|Okta|Datadog|Sentry|Intercom|Zendesk|Slack\s*(?:API|integration)|Salesforce)\b/i;

/** Patterns indicating data processing agreements with third parties. */
export const DPA_PATTERNS =
  /\b(?:data\s*processing\s*agreement|DPA|sub[- ]?processor|vendor\s*(?:agreement|compliance|security))\b/i;

/** Patterns indicating liability/indemnification clauses. */
export const LIABILITY_PATTERNS =
  /\b(?:limit(?:ation)?\s*(?:of\s*)?liability|indemnif|hold\s*harmless|disclaim(?:er)?\s*(?:of\s*)?warrant)\b/i;

// ── ID Generation ────────────────────────────────────────────────────────────

/**
 * Create a sequential ID generator with a given prefix.
 * @param prefix - e.g., 'LGL', 'LGL-CLM', 'LGL-LIC'
 */
export function createIdGenerator(prefix: string): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `${prefix}-${String(counter).padStart(3, '0')}`;
  };
}

// ── LLM Response Parsing ─────────────────────────────────────────────────────

interface LlmLegalFinding {
  title: string;
  severity: string;
  description: string;
  remediation: string;
  category: string;
  filePath?: string;
}

/**
 * Parse LLM JSON response into Finding[].
 * Expects a JSON array of objects with title, severity, description, remediation, category.
 */
export function parseLlmLegalFindings(raw: string, module: ValidationModule, idPrefix: string): Finding[] {
  const findings: Finding[] = [];
  const nextId = createIdGenerator(idPrefix);

  try {
    // Extract JSON array from response (may be wrapped in markdown code fences)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return findings;

    const parsed = JSON.parse(jsonMatch[0]) as LlmLegalFinding[];
    if (!Array.isArray(parsed)) return findings;

    for (const item of parsed) {
      if (!item.title || !item.description) continue;

      findings.push({
        id: nextId(),
        module,
        severity: mapSeverity(item.severity),
        title: item.title,
        description: item.description,
        remediation: item.remediation || 'Review and address this finding.',
        category: item.category || 'legal',
        filePath: item.filePath,
      });
    }
  } catch {
    // LLM response was not valid JSON -- return empty
  }

  return findings;
}

/**
 * Map severity string from LLM to Severity enum.
 */
function mapSeverity(s: string | undefined): Severity {
  if (!s) return Severity.Medium;
  const lower = s.toLowerCase().trim();
  if (lower === 'critical') return Severity.Critical;
  if (lower === 'high') return Severity.High;
  if (lower === 'medium') return Severity.Medium;
  if (lower === 'low') return Severity.Low;
  if (lower === 'info') return Severity.Info;
  return Severity.Medium;
}

// ── De-duplication ───────────────────────────────────────────────────────────

/**
 * De-duplicate LLM findings against existing static findings.
 * Considers same category + similar title as duplicate.
 */
export function deduplicateFindings(existing: Finding[], llmFindings: Finding[]): Finding[] {
  const unique: Finding[] = [];
  for (const lf of llmFindings) {
    const isDuplicate = existing.some(
      (ef) =>
        ef.category === lf.category &&
        (ef.title.toLowerCase().includes(lf.title.toLowerCase().slice(0, 30)) ||
          lf.title.toLowerCase().includes(ef.title.toLowerCase().slice(0, 30))),
    );
    if (!isDuplicate) {
      unique.push(lf);
    }
  }
  return unique;
}
