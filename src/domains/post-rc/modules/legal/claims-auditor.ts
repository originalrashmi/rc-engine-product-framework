/**
 * Claims Auditor Module (Agent 1) -- "Dirty Lawyer"
 *
 * Scans the RC Engine framework repository itself for marketing claims
 * that do not match the actual implementation. Two layers:
 *
 * Layer 1: Static pattern matching against docs (deterministic)
 * Layer 2: LLM-based claims analysis (if Anthropic key available)
 *
 * Produces Finding[] with LGL-CLM- prefix IDs.
 */

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Finding, LegalPolicy } from '../../types.js';
import { ValidationModule, Severity } from '../../types.js';
import { hasAnthropicKey, resolveFromRoot } from '../../../../shared/config.js';
import { llmFactory } from '../../../../shared/llm/factory.js';
import { LLMProvider } from '../../../../shared/types.js';
import { tokenTracker } from '../../../../shared/token-tracker.js';
import { createIdGenerator, parseLlmLegalFindings, deduplicateFindings } from './legal-patterns.js';

// Maximum content size sent to LLM
const MAX_CONTENT_SIZE = 30_000;

// ── Files to scan for claims ─────────────────────────────────────────────────

const DOCS_TO_SCAN = [
  'README.md',
  'CLAUDE.md',
  'SECURITY.md',
  '.claude/rules/conversation-ux.md',
  '.claude/rules/onboarding.md',
  'docs/QUICKSTART-GUIDE.md',
  'docs/USAGE-AND-COST-GUIDE.md',
];

// ── Static Claim Patterns ────────────────────────────────────────────────────

interface ClaimPattern {
  /** Regex to detect the claim in documentation. */
  pattern: RegExp;
  /** Category for grouping. */
  category: string;
  /** Finding title if pattern matches. */
  title: string;
  /** Finding severity. */
  severity: Severity;
  /** Why this is a problem. */
  description: string;
  /** How to fix it. */
  remediation: string;
  /** Optional: function to verify the claim against code. Returns true if claim is accurate. */
  verify?: (repoRoot: string) => Promise<boolean>;
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  // Quantity: exact specialist count without qualifier
  {
    pattern: /\b20\s+(?:AI\s+)?(?:research\s+)?specialists?\b/i,
    category: 'claims-quantity',
    title: 'Unqualified specialist count claim',
    severity: Severity.Medium,
    description:
      'Claims "20 specialists" without qualifier. Actual count is 3-20 depending on product complexity classification. Simple products activate 3-6 specialists.',
    remediation:
      'Change to "up to 20 AI research specialists (3-20 based on complexity)" or similar qualified language.',
  },

  // Quantity: tool count mismatch
  {
    pattern: /\b3[12]\s+(?:orchestrated\s+)?tools?\b/i,
    category: 'claims-quantity',
    title: 'Incorrect tool count',
    severity: Severity.Low,
    description: 'Claims "31" or "32" tools but actual tool registration count is 35.',
    remediation: 'Update to correct count (35 tools) or use "35+ tools" for future-proofing.',
  },

  // Quantity: gate count without qualifier
  {
    pattern: /\b11\s+(?:quality\s+)?gates?\b/i,
    category: 'claims-quantity',
    title: 'Unqualified gate count claim',
    severity: Severity.Low,
    description:
      'Claims "11 quality gates" without qualifier. Actual count is 9-11 depending on pipeline path (import vs fresh start).',
    remediation: 'Change to "up to 11 quality gates" or "9-11 quality gates depending on path".',
  },

  // Performance: value claims without methodology
  {
    pattern: /\$[\d,]+\+?\s*(?:equivalent|value|savings|worth|consulting)/i,
    category: 'claims-value',
    title: 'Value claim without methodology',
    severity: Severity.High,
    description:
      'Dollar value claim (e.g., "$32K+ equivalent") with no documented methodology, comparison baseline, or data source. Could be challenged under FTC guidelines.',
    remediation:
      'Either document the methodology (consulting rates, time estimates, sample data) or remove/qualify the claim with "estimated based on [method]".',
  },

  // Performance: multiplier claims without baseline
  {
    pattern: /\b\d+[xX]\s*(?:faster|cheaper|more\s+efficient)/i,
    category: 'claims-performance',
    title: 'Performance multiplier without baseline',
    severity: Severity.High,
    description:
      'Claims like "100x faster" without stating what the comparison baseline is, measurement methodology, or conditions.',
    remediation: 'Add comparison baseline: "100x faster than [what], measured by [method]" or remove the claim.',
  },

  // Performance: percentage claims without data
  {
    pattern: /\b\d+%\s*(?:cost|time|reduction|savings|improvement)/i,
    category: 'claims-performance',
    title: 'Percentage claim without supporting data',
    severity: Severity.Medium,
    description: 'Percentage reduction/savings claim without methodology or data source.',
    remediation: 'Document the methodology or qualify with "estimated" / "typical" / "based on [N] projects".',
  },

  // Capability: "full" completeness claims
  {
    pattern: /\bfull\s+(?:traceability|coverage|pipeline|integration)\b/i,
    category: 'claims-completeness',
    title: 'Absolute completeness claim',
    severity: Severity.Medium,
    description:
      'Uses "full" to describe coverage/traceability/integration. Known gaps exist: Forge outputs to staging (not source tree), model router is dormant, audit trail is not wired.',
    remediation: 'Qualify with specific scope or replace "full" with "end-to-end" or "structured".',
  },

  // Capability: "production-ready" claims
  {
    pattern: /\bproduction[- ]ready\b/i,
    category: 'claims-capability',
    title: '"Production-ready" claim needs qualifier',
    severity: Severity.Medium,
    description:
      'Claims product output is "production-ready". Forge outputs to staging directory, security scanning has coverage gaps, and the tool provides assessment guidance rather than deployment-ready code.',
    remediation: 'Qualify: "production-readiness assessment" or "structured guidance toward production readiness".',
  },

  // Capability: OWASP/security completeness
  {
    pattern: /OWASP\s*(?:scanning|coverage|top\s*\d+|compliance)/i,
    category: 'claims-capability',
    title: 'OWASP coverage claim needs qualification',
    severity: Severity.Medium,
    description:
      'Claims OWASP scanning/coverage. Static analysis covers 11 CWE patterns; missing SSRF, prototype pollution, open redirects, XXE, insecure deserialization, clickjacking, session fixation.',
    remediation:
      'Add: "covers common OWASP patterns; not a replacement for professional security auditing" (SECURITY.md already has this -- propagate to README).',
  },

  // Capability: "enterprise-grade" without definition
  {
    pattern: /\benterprise[- ]grade\b/i,
    category: 'claims-capability',
    title: '"Enterprise-grade" claim without definition',
    severity: Severity.Low,
    description:
      'Uses "enterprise-grade" without defining what enterprise requirements are met (SLA, SSO, audit logging, compliance certifications, etc.).',
    remediation: 'Either define specific enterprise features or remove the term.',
  },

  // Missing AI disclaimer
  {
    pattern: /(?:AI[- ](?:powered|generated|driven)|machine\s+learning|LLM[- ](?:based|powered))/i,
    category: 'disclaimer',
    title: 'AI capability reference may need accuracy disclaimer',
    severity: Severity.Info,
    description:
      'References AI/LLM capabilities. User-facing documentation should include disclaimers about AI output accuracy and the recommendation for human review.',
    remediation: 'Ensure nearby text includes: "AI-generated content should be reviewed by a qualified professional."',
  },
];

// ── Module Entry Point ───────────────────────────────────────────────────────

export async function runClaimsAuditModule(
  _projectPath: string,
  _codeContext: string | undefined,
  policy: LegalPolicy,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];
  const repoRoot = resolveFromRoot();

  // Layer 1: Static pattern scan
  const docsContent = await loadDocumentationContent(repoRoot);
  if (docsContent) {
    const staticFindings = runStaticClaimsScan(docsContent, repoRoot);
    allFindings.push(...staticFindings);
  }

  // Layer 2: LLM-based analysis (if key available)
  if (docsContent && hasAnthropicKey) {
    const llmFindings = await runLlmClaimsAnalysis(docsContent, repoRoot);
    const unique = deduplicateFindings(allFindings, llmFindings);
    allFindings.push(...unique);
  }

  // Filter suppressed findings
  const suppressedSet = new Set(policy.suppressedFindings);
  const activeFindings = allFindings.filter((f) => !suppressedSet.has(f.id));

  // Re-sequence IDs
  const nextId = createIdGenerator('LGL-CLM');
  for (const f of activeFindings) {
    f.id = nextId();
  }

  return activeFindings;
}

// ── Layer 1: Static Pattern Scan ─────────────────────────────────────────────

function runStaticClaimsScan(docsContent: Map<string, string>, _repoRoot: string): Finding[] {
  const findings: Finding[] = [];
  const nextId = createIdGenerator('LGL-CLM');

  for (const [filePath, content] of docsContent) {
    for (const rule of CLAIM_PATTERNS) {
      if (rule.pattern.test(content)) {
        // Avoid duplicate findings for same rule across files
        const existingForRule = findings.find((f) => f.category === rule.category && f.title === rule.title);
        if (existingForRule) {
          // Append file path to existing finding
          if (existingForRule.filePath && !existingForRule.filePath.includes(filePath)) {
            existingForRule.filePath += `, ${filePath}`;
          }
          continue;
        }

        findings.push({
          id: nextId(),
          module: ValidationModule.LegalClaims,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          remediation: rule.remediation,
          category: rule.category,
          filePath,
        });
      }
    }
  }

  return findings;
}

// ── Layer 2: LLM Claims Analysis ─────────────────────────────────────────────

async function runLlmClaimsAnalysis(docsContent: Map<string, string>, repoRoot: string): Promise<Finding[]> {
  try {
    // Load knowledge
    const knowledgePath = resolveFromRoot('knowledge', 'post-rc', 'legal-context');
    const claimsPatternsPath = join(knowledgePath, 'CLAIMS_PATTERNS.md');
    let knowledge = '';
    if (existsSync(claimsPatternsPath)) {
      knowledge = await readFile(claimsPatternsPath, 'utf-8');
    }

    // Load known gaps from ARCHITECTURE.md
    let knownGaps = '';
    const archPath = join(repoRoot, 'docs', 'ARCHITECTURE.md');
    if (existsSync(archPath)) {
      const archContent = await readFile(archPath, 'utf-8');
      const gapsMatch = archContent.match(/## Known Gaps[\s\S]*?(?=\n## |$)/i);
      if (gapsMatch) {
        knownGaps = gapsMatch[0].slice(0, 5000);
      }
    }

    // Build documentation summary (truncated)
    let docsSummary = '';
    for (const [file, content] of docsContent) {
      docsSummary += `\n--- ${file} ---\n${content.slice(0, 3000)}\n`;
      if (docsSummary.length > MAX_CONTENT_SIZE) break;
    }

    const prompt = `You are a hostile attorney auditing a software product's marketing claims against its actual implementation.

## Knowledge Base
${knowledge.slice(0, 5000)}

## Known Implementation Gaps
${knownGaps}

## Documentation to Audit
${docsSummary}

## Task
Identify claims in the documentation that:
1. Do not match the known implementation gaps
2. Use absolute language without qualifiers
3. Promise capabilities that are aspirational rather than implemented
4. Lack required disclaimers (especially for AI, security, and legal topics)
5. Could create liability exposure

Return a JSON array of findings. Each finding must have:
- "title": one-line summary
- "severity": "critical" | "high" | "medium" | "low" | "info"
- "description": detailed explanation of the gap
- "remediation": specific fix recommendation
- "category": one of "claims-quantity", "claims-capability", "claims-performance", "claims-value", "claims-completeness", "disclaimer"
- "filePath": which file contains the claim

Return ONLY the JSON array, no other text.`;

    const client = llmFactory.getClient(LLMProvider.Claude);
    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });
    tokenTracker.record('post-rc', 'postrc_scan_legal_claims', response.tokensUsed, response.provider);

    return parseLlmLegalFindings(response.content, ValidationModule.LegalClaims, 'LGL-CLM-LLM');
  } catch (err) {
    // LLM failure is non-fatal -- return info finding
    return [
      {
        id: 'LGL-CLM-LLM-000',
        module: ValidationModule.LegalClaims,
        severity: Severity.Info,
        title: 'LLM claims analysis unavailable',
        description: `Could not run LLM-based claims analysis: ${(err as Error).message}. Static pattern results are still valid.`,
        remediation: 'Ensure ANTHROPIC_API_KEY is configured for deeper claims analysis.',
        category: 'disclaimer',
      },
    ];
  }
}

// ── Content Loading ──────────────────────────────────────────────────────────

async function loadDocumentationContent(repoRoot: string): Promise<Map<string, string> | null> {
  const content = new Map<string, string>();

  for (const relPath of DOCS_TO_SCAN) {
    const fullPath = join(repoRoot, relPath);
    if (existsSync(fullPath)) {
      try {
        const text = await readFile(fullPath, 'utf-8');
        content.set(relPath, text);
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Also scan web UI for marketing text
  const webSrcDir = join(repoRoot, 'web', 'src');
  if (existsSync(webSrcDir)) {
    try {
      const webFiles = await scanDirForTsx(webSrcDir);
      for (const [relPath, text] of webFiles) {
        content.set(relPath, text);
      }
    } catch {
      // Web UI scan is best-effort
    }
  }

  return content.size > 0 ? content : null;
}

async function scanDirForTsx(dir: string, base?: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const root = base || dir;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const sub = await scanDirForTsx(fullPath, root);
        for (const [k, v] of sub) result.set(k, v);
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        const relPath = fullPath.replace(root + '/', 'web/src/');
        const text = await readFile(fullPath, 'utf-8');
        // Only include files with string literals that look like marketing
        if (/specialist|pipeline|security|OWASP|production|enterprise|\$\d/.test(text)) {
          result.set(relPath, text);
        }
      }
    }
  } catch {
    // Best-effort directory scan
  }

  return result;
}
