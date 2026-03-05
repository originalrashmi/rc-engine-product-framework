/**
 * Product Legal Auditor Module (Agent 2) -- "Hostile Attorney for Your Product"
 *
 * Scans the user's product output (PRD, architecture, code, tasks) through
 * a hostile-attorney lens for legal and regulatory compliance gaps.
 *
 * Three layers:
 * Layer 1: Static pattern checks against PRD and tasks (deterministic)
 * Layer 2: Dependency license scan (deterministic)
 * Layer 3: LLM-based regulatory analysis (if Anthropic key available)
 *
 * Produces Finding[] with LGL- prefix IDs.
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
import {
  createIdGenerator,
  parseLlmLegalFindings,
  deduplicateFindings,
  USER_DATA_PATTERNS,
  PII_FIELD_PATTERNS,
  HEALTHCARE_PATTERNS,
  FINANCE_PATTERNS,
  CHILDREN_PATTERNS,
  EDUCATION_PATTERNS,
  UI_PRODUCT_PATTERNS,
  PRIVACY_POLICY_PATTERNS,
  TOS_PATTERNS,
  ACCESSIBILITY_PATTERNS,
  AI_COMPONENT_PATTERNS,
  COOKIE_PATTERNS,
  COOKIE_CONSENT_PATTERNS,
  UGC_PATTERNS,
  DMCA_PATTERNS,
  SUBSCRIPTION_PATTERNS,
  RENEWAL_DISCLOSURE_PATTERNS,
  BREACH_PLAN_PATTERNS,
  THIRD_PARTY_PATTERNS,
  DPA_PATTERNS,
  LIABILITY_PATTERNS,
} from './legal-patterns.js';

// Maximum content size sent to LLM
const MAX_CONTENT_SIZE = 30_000;

// ── Module Entry Point ───────────────────────────────────────────────────────

export async function runProductLegalModule(
  projectPath: string,
  codeContext: string | undefined,
  policy: LegalPolicy,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];

  // Load product content (PRD, tasks, code)
  const productContent = await loadProductContent(projectPath, codeContext);
  const allText = productContent.prd + '\n' + productContent.tasks + '\n' + productContent.code;

  if (!allText.trim()) {
    return [
      {
        id: 'LGL-000',
        module: ValidationModule.LegalProduct,
        severity: Severity.Info,
        title: 'No product content found for legal review',
        description:
          'Could not find PRD, task list, or code context to review. Legal review requires product deliverables from the RC Method pipeline.',
        remediation: 'Run the RC Method pipeline (at least through Phase 2 Define) before running legal review.',
        category: 'disclaimer',
      },
    ];
  }

  // Layer 1: Static pattern checks
  const staticFindings = runStaticLegalChecks(allText, productContent, policy);
  allFindings.push(...staticFindings);

  // Layer 2: Dependency license scan
  if (policy.checkLicenses) {
    const licenseFindings = await runLicenseScan(projectPath);
    allFindings.push(...licenseFindings);
  }

  // Layer 3: LLM-based analysis
  if (hasAnthropicKey) {
    const llmFindings = await runLlmLegalAnalysis(productContent, policy);
    const unique = deduplicateFindings(allFindings, llmFindings);
    allFindings.push(...unique);
  }

  // Filter suppressed
  const suppressedSet = new Set(policy.suppressedFindings);
  const activeFindings = allFindings.filter((f) => !suppressedSet.has(f.id));

  // Re-sequence IDs
  const nextId = createIdGenerator('LGL');
  for (const f of activeFindings) {
    f.id = nextId();
  }

  return activeFindings;
}

// ── Content Loading ──────────────────────────────────────────────────────────

interface ProductContent {
  prd: string;
  tasks: string;
  code: string;
  projectName: string;
}

async function loadProductContent(projectPath: string, codeContext?: string): Promise<ProductContent> {
  let prd = '';
  let tasks = '';
  const code = codeContext || '';
  let projectName = '';

  // Load PRD from rc-method/prds/ or pre-rc-research/
  const prdDirs = [join(projectPath, 'rc-method', 'prds'), join(projectPath, 'pre-rc-research')];
  for (const dir of prdDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = await readdir(dir);
      const prdFiles = files.filter((f) => f.match(/^(?:PRD|prd).*\.md$/i));
      for (const f of prdFiles) {
        const content = await readFile(join(dir, f), 'utf-8');
        prd += `\n--- ${f} ---\n${content}\n`;
        // Extract project name from PRD title
        const nameMatch = content.match(/^#\s+.*?:\s*(.+)$/m);
        if (nameMatch && !projectName) projectName = nameMatch[1].trim();
      }
    } catch {
      // Best-effort
    }
  }

  // Load tasks from rc-method/tasks/
  const tasksDir = join(projectPath, 'rc-method', 'tasks');
  if (existsSync(tasksDir)) {
    try {
      const files = await readdir(tasksDir);
      const taskFiles = files.filter((f) => f.match(/^TASKS.*\.md$/i));
      for (const f of taskFiles) {
        tasks += await readFile(join(tasksDir, f), 'utf-8');
      }
    } catch {
      // Best-effort
    }
  }

  return { prd, tasks, code, projectName };
}

// ── Layer 1: Static Legal Checks ─────────────────────────────────────────────

function runStaticLegalChecks(allText: string, content: ProductContent, policy: LegalPolicy): Finding[] {
  const findings: Finding[] = [];
  const nextId = createIdGenerator('LGL');

  const collectsUserData = USER_DATA_PATTERNS.test(allText);
  const hasPiiFields = PII_FIELD_PATTERNS.test(allText);
  const hasPrivacyPolicy = PRIVACY_POLICY_PATTERNS.test(allText);
  const hasToS = TOS_PATTERNS.test(allText);
  const hasUi = UI_PRODUCT_PATTERNS.test(allText);
  const hasAccessibility = ACCESSIBILITY_PATTERNS.test(allText);
  const hasAiComponents = AI_COMPONENT_PATTERNS.test(allText);

  // ── Universal checks ───────────────────────────────────────────────────

  // Missing Terms of Service
  if (!hasToS && collectsUserData) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.High,
      title: 'Missing Terms of Service',
      description:
        'Product collects user data or has user accounts but no Terms of Service / Terms of Use is referenced in requirements or tasks.',
      remediation:
        'Add a Terms of Service requirement to the PRD. Include: acceptable use, liability limitations, dispute resolution, governing law.',
      category: 'terms-of-service',
    });
  }

  // Missing Privacy Policy when collecting user data
  if (collectsUserData && !hasPrivacyPolicy) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.High,
      title: 'Missing Privacy Policy for user data collection',
      description:
        'Product collects user data (accounts, profiles, or personal information) but no Privacy Policy is referenced. This is legally required in most jurisdictions.',
      remediation:
        'Add a Privacy Policy requirement covering: what data is collected, why, how long it is stored, who it is shared with, and user rights (access, deletion, portability).',
      category: 'privacy-policy',
    });
  }

  // PII without data protection
  if (hasPiiFields && !hasPrivacyPolicy) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.Critical,
      title: 'PII fields detected without data protection requirements',
      description:
        'Product requirements reference personally identifiable information (email, phone, SSN, credit card, etc.) without corresponding data protection, encryption, or privacy requirements.',
      remediation:
        'Add data protection requirements: encryption at rest and in transit, access controls, data retention limits, and a Privacy Policy that discloses PII handling.',
      category: 'data-handling',
    });
  }

  // ── AI component checks ────────────────────────────────────────────────

  if (hasAiComponents) {
    const hasAiDisclaimer =
      /AI[- ](?:generated|disclaimer|accuracy|limitation)|not\s+(?:legal|medical|financial)\s+advice/i.test(allText);
    if (!hasAiDisclaimer) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.Medium,
        title: 'AI components without accuracy disclaimer',
        description:
          'Product includes AI/ML components but no accuracy disclaimer or human review recommendation is referenced in requirements.',
        remediation:
          'Add requirement: "All AI-generated output must include a disclaimer that content may contain errors and should be reviewed by a qualified professional."',
        category: 'disclaimer',
      });
    }
  }

  // ── Accessibility checks ───────────────────────────────────────────────

  if (policy.checkAccessibility && hasUi && !hasAccessibility) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.Medium,
      title: 'Web/mobile UI without accessibility requirements',
      description:
        'Product has a user interface but no accessibility requirements (WCAG, ADA, ARIA, screen reader support) are referenced. ADA compliance is legally required for many US businesses.',
      remediation:
        'Add accessibility requirements: WCAG 2.1 AA minimum, keyboard navigation, screen reader compatibility, color contrast ratios, alt text for images.',
      category: 'accessibility',
    });
  }

  // ── Regulatory domain checks ───────────────────────────────────────────

  // Healthcare / HIPAA
  const isHealthcare = policy.productDomain === 'healthcare' || HEALTHCARE_PATTERNS.test(allText);
  if (isHealthcare) {
    const hasHipaa = /HIPAA|Business\s*Associate|BAA|PHI\s*encrypt/i.test(allText);
    if (!hasHipaa) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.Critical,
        title: 'Healthcare product without HIPAA compliance requirements',
        description:
          'Product handles health/medical data but no HIPAA compliance requirements are specified. HIPAA violations carry penalties of $100 to $50,000 per violation.',
        remediation:
          'Add HIPAA requirements: Business Associate Agreements, PHI encryption (rest + transit), access controls, audit logging, breach notification procedures, minimum necessary standard.',
        category: 'hipaa',
      });
    }
  }

  // Finance / PCI-DSS
  const isFinance = policy.productDomain === 'finance' || FINANCE_PATTERNS.test(allText);
  if (isFinance) {
    const hasPci = /PCI[- ]DSS|tokeniz|payment\s*processor\s*compliance/i.test(allText);
    if (!hasPci) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.High,
        title: 'Payment processing without PCI-DSS compliance requirements',
        description: 'Product handles payments or card data but no PCI-DSS compliance requirements are specified.',
        remediation:
          'Add PCI-DSS requirements: use a compliant payment processor (Stripe, etc.), never store raw card numbers, tokenize card data, implement SAQ documentation.',
        category: 'pci-dss',
      });
    }
  }

  // Children / COPPA
  const isChildren = policy.productDomain === 'children' || CHILDREN_PATTERNS.test(allText);
  if (isChildren) {
    const hasCoppa = /COPPA|parental\s*consent|verifiable.*consent|age\s*gate/i.test(allText);
    if (!hasCoppa) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.Critical,
        title: 'Product targeting children without COPPA compliance',
        description:
          'Product appears directed at children under 13 but no COPPA compliance requirements are specified. COPPA violations carry penalties up to $50,120 per violation.',
        remediation:
          'Add COPPA requirements: verifiable parental consent mechanism, age gate, data minimization, no behavioral advertising, parental review/delete rights.',
        category: 'coppa',
      });
    }
  }

  // Education / FERPA
  const isEducation = policy.productDomain === 'education' || EDUCATION_PATTERNS.test(allText);
  if (isEducation) {
    const hasFerpa = /FERPA|student\s*(?:data\s*)?privacy/i.test(allText);
    if (!hasFerpa) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.High,
        title: 'Education product without FERPA compliance requirements',
        description: 'Product handles student/educational records but no FERPA compliance requirements are specified.',
        remediation:
          'Add FERPA requirements: written consent for disclosure, annual notification of rights, access rights for parents/eligible students, amendment process.',
        category: 'ferpa',
      });
    }
  }

  // ── Jurisdiction-specific checks ───────────────────────────────────────

  if (policy.jurisdiction === 'eu' || policy.jurisdiction === 'both') {
    if (collectsUserData) {
      const hasGdpr =
        /GDPR|data\s*protection\s*(?:officer|impact|agreement)|DPA|right\s*to\s*erasure|data\s*portability/i.test(
          allText,
        );
      if (!hasGdpr) {
        findings.push({
          id: nextId(),
          module: ValidationModule.LegalProduct,
          severity: Severity.High,
          title: 'EU-targeted product without GDPR compliance requirements',
          description:
            'Product collects user data with EU jurisdiction but no GDPR compliance requirements are specified.',
          remediation:
            'Add GDPR requirements: consent mechanisms (opt-in), right to erasure, data portability, Data Processing Agreements with vendors, breach notification (72hr), Data Protection Impact Assessment.',
          category: 'gdpr',
        });
      }
    }
  }

  if (policy.jurisdiction === 'us' || policy.jurisdiction === 'both') {
    if (collectsUserData) {
      const hasCcpa = /CCPA|Do\s*Not\s*Sell|California\s*Consumer/i.test(allText);
      if (!hasCcpa) {
        findings.push({
          id: nextId(),
          module: ValidationModule.LegalProduct,
          severity: Severity.Medium,
          title: 'US-targeted product without CCPA considerations',
          description:
            'Product collects user data with US jurisdiction but no CCPA compliance considerations are documented. CCPA applies to businesses meeting specific revenue/data thresholds.',
          remediation:
            'Evaluate CCPA applicability. If applicable: add "Do Not Sell" link, consumer request handling, CCPA-specific privacy policy disclosures.',
          category: 'ccpa',
        });
      }
    }
  }

  // ── Cookie consent (EU ePrivacy) ──────────────────────────────────────

  if (policy.jurisdiction === 'eu' || policy.jurisdiction === 'both') {
    const hasCookies = COOKIE_PATTERNS.test(allText);
    const hasCookieConsent = COOKIE_CONSENT_PATTERNS.test(allText);
    if (hasUi && hasCookies && !hasCookieConsent) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.High,
        title: 'Web product using cookies/tracking without consent mechanism',
        description:
          'Product uses cookies, analytics, or tracking technologies but no cookie consent mechanism is referenced. The EU ePrivacy Directive requires informed consent before setting non-essential cookies.',
        remediation:
          'Add cookie consent requirement: granular opt-in banner (not pre-checked), cookie policy page, ability to withdraw consent. Non-essential cookies must not be set until consent is given.',
        category: 'gdpr',
      });
    }
  }

  // ── User-generated content / DMCA ─────────────────────────────────────

  const hasUgc = UGC_PATTERNS.test(allText);
  const hasDmca = DMCA_PATTERNS.test(allText);
  if (hasUgc && !hasDmca) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.Medium,
      title: 'User-generated content without moderation/takedown policy',
      description:
        'Product accepts user-generated content (uploads, comments, reviews, posts) but no content moderation or copyright takedown (DMCA) process is referenced. Section 230 safe harbor requires good-faith moderation efforts.',
      remediation:
        'Add requirements for: content moderation policy, DMCA/copyright takedown process, prohibited content guidelines, user reporting mechanism, content ownership/license terms in ToS.',
      category: 'ip-risk',
    });
  }

  // ── Subscription / auto-renewal disclosure ────────────────────────────

  const hasSubscription = SUBSCRIPTION_PATTERNS.test(allText);
  const hasRenewalDisclosure = RENEWAL_DISCLOSURE_PATTERNS.test(allText);
  if (hasSubscription && !hasRenewalDisclosure) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.Medium,
      title: 'Subscription billing without auto-renewal disclosure',
      description:
        'Product has subscription or recurring billing but no auto-renewal disclosure, cancellation process, or refund policy is referenced. FTC and California Automatic Renewal Law (ARL) require clear disclosure before charging.',
      remediation:
        'Add requirements for: auto-renewal disclosure before purchase, easy cancellation process, refund policy, pre-renewal notification, pricing transparency.',
      category: 'terms-of-service',
    });
  }

  // ── Data breach response plan ─────────────────────────────────────────

  if (collectsUserData || hasPiiFields) {
    const hasBreachPlan = BREACH_PLAN_PATTERNS.test(allText);
    if (!hasBreachPlan) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.Medium,
        title: 'No data breach response plan referenced',
        description:
          'Product collects user data but no breach notification or incident response plan is referenced. 47 US states plus GDPR (72-hour rule) and other jurisdictions require timely breach notification.',
        remediation:
          'Add requirement for: incident response plan, breach detection mechanisms, notification procedures (users + regulators), breach documentation process.',
        category: 'data-handling',
      });
    }
  }

  // ── Third-party integrations without DPA ──────────────────────────────

  const hasThirdParty = THIRD_PARTY_PATTERNS.test(allText);
  const hasDpa = DPA_PATTERNS.test(allText);
  if (collectsUserData && hasThirdParty && !hasDpa) {
    findings.push({
      id: nextId(),
      module: ValidationModule.LegalProduct,
      severity: Severity.Medium,
      title: 'Third-party data processors without DPA requirements',
      description:
        'Product collects user data and integrates third-party services but no Data Processing Agreements (DPAs) are referenced. GDPR Article 28 requires DPAs with all data processors. Even under US law, vendor security agreements are a best practice.',
      remediation:
        'Add requirements for: Data Processing Agreements with all third-party services that handle user data, vendor security assessment, sub-processor disclosure in privacy policy.',
      category: 'data-handling',
    });
  }

  // ── Limitation of liability ───────────────────────────────────────────

  if (hasToS) {
    const hasLiability = LIABILITY_PATTERNS.test(allText);
    if (!hasLiability) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.Low,
        title: 'Terms of Service without explicit liability limitation',
        description:
          'Product references Terms of Service but no limitation of liability, indemnification, or warranty disclaimer is mentioned in the requirements. Without these clauses, the business may be exposed to unlimited damages.',
        remediation:
          'Ensure ToS includes: limitation of liability clause, disclaimer of warranties, indemnification provision, and dispute resolution mechanism.',
        category: 'terms-of-service',
      });
    }
  }

  return findings;
}

// ── Layer 2: Dependency License Scan ─────────────────────────────────────────

interface PackageJson {
  name?: string;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const COPYLEFT_LICENSES = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'SSPL-1.0',
]);

const SAAS_RISK_LICENSES = new Set(['AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'SSPL-1.0']);

async function runLicenseScan(projectPath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const nextId = createIdGenerator('LGL-LIC');
  const pkgPath = join(projectPath, 'package.json');

  if (!existsSync(pkgPath)) return findings;

  try {
    const pkgRaw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as PackageJson;

    // Check project license
    if (!pkg.license) {
      findings.push({
        id: nextId(),
        module: ValidationModule.LegalProduct,
        severity: Severity.High,
        title: 'Project has no license specified',
        description:
          'package.json does not specify a license field. Without a license, the project defaults to "all rights reserved" which creates ambiguity about IP ownership and usage rights.',
        remediation:
          'Add a "license" field to package.json (e.g., "MIT", "Apache-2.0", or "UNLICENSED" for proprietary).',
        category: 'licensing',
        filePath: 'package.json',
      });
    }

    // Check dependencies for license issues
    const deps = { ...pkg.dependencies };
    const nodeModulesDir = join(projectPath, 'node_modules');

    if (existsSync(nodeModulesDir)) {
      for (const depName of Object.keys(deps)) {
        const depPkgPath = join(nodeModulesDir, depName, 'package.json');
        if (!existsSync(depPkgPath)) continue;

        try {
          const depPkgRaw = await readFile(depPkgPath, 'utf-8');
          const depPkg = JSON.parse(depPkgRaw) as PackageJson;
          const depLicense = depPkg.license || '';

          // Check for copyleft in non-copyleft project
          if (pkg.license && !COPYLEFT_LICENSES.has(pkg.license) && COPYLEFT_LICENSES.has(depLicense)) {
            const isSaasRisk = SAAS_RISK_LICENSES.has(depLicense);
            findings.push({
              id: nextId(),
              module: ValidationModule.LegalProduct,
              severity: isSaasRisk ? Severity.Critical : Severity.High,
              title: `Copyleft dependency: ${depName} (${depLicense})`,
              description: isSaasRisk
                ? `Dependency "${depName}" uses ${depLicense}, which triggers copyleft for network/SaaS use. Your entire service may need to be open-sourced.`
                : `Dependency "${depName}" uses ${depLicense}, which may require your project to also be released under ${depLicense}.`,
              remediation: `Replace "${depName}" with a permissive-licensed alternative, or obtain a commercial license from the maintainer.`,
              category: 'licensing',
              filePath: 'package.json',
            });
          }

          // Check for missing license on dependency
          if (!depLicense) {
            findings.push({
              id: nextId(),
              module: ValidationModule.LegalProduct,
              severity: Severity.Medium,
              title: `Dependency "${depName}" has no license`,
              description: `Dependency "${depName}" does not specify a license. Without a license, it defaults to "all rights reserved" and cannot legally be used.`,
              remediation: `Contact the maintainer to add a license, or replace with an explicitly licensed alternative.`,
              category: 'licensing',
              filePath: 'package.json',
            });
          }
        } catch {
          // Skip unreadable dependency package.json
        }
      }
    }
  } catch {
    // package.json parse failure
  }

  return findings;
}

// ── Layer 3: LLM Legal Analysis ──────────────────────────────────────────────

async function runLlmLegalAnalysis(content: ProductContent, policy: LegalPolicy): Promise<Finding[]> {
  try {
    // Load knowledge files
    const knowledgePath = resolveFromRoot('knowledge', 'post-rc', 'legal-context');
    let knowledge = '';

    for (const file of ['REGULATORY_FRAMEWORK.md', 'LEGAL_CHECKLIST.md']) {
      const filePath = join(knowledgePath, file);
      if (existsSync(filePath)) {
        const text = await readFile(filePath, 'utf-8');
        knowledge += `\n--- ${file} ---\n${text.slice(0, 8000)}\n`;
      }
    }

    // Truncate content for LLM
    const prdTruncated = content.prd.slice(0, MAX_CONTENT_SIZE * 0.5);
    const tasksTruncated = content.tasks.slice(0, MAX_CONTENT_SIZE * 0.25);
    const codeTruncated = content.code.slice(0, MAX_CONTENT_SIZE * 0.25);

    const domainContext = policy.productDomain
      ? `Product domain: ${policy.productDomain}. Apply domain-specific regulatory requirements.`
      : 'Product domain: general.';

    const jurisdictionContext = policy.jurisdiction
      ? `Target jurisdiction: ${policy.jurisdiction === 'both' ? 'US and EU' : policy.jurisdiction.toUpperCase()}. Apply jurisdiction-specific requirements.`
      : 'Target jurisdiction: global.';

    const prompt = `You are a hostile attorney reviewing a software product for legal and regulatory compliance gaps. Your job is to find every potential legal issue before this product ships.

## Regulatory Knowledge
${knowledge.slice(0, 10000)}

## Product Context
${domainContext}
${jurisdictionContext}
Project: ${content.projectName || 'Unknown'}

## Product Requirements (PRD)
${prdTruncated}

## Task List
${tasksTruncated}

## Code Context
${codeTruncated}

## Task
Review this product as a hostile attorney. Identify:
1. Missing legal documents (ToS, privacy policy, cookie policy, disclaimers)
2. Regulatory compliance gaps based on product domain and jurisdiction
3. Data handling risks (PII without protection, missing consent, no deletion mechanism)
4. Intellectual property concerns
5. Accessibility compliance gaps
6. Claims the product makes about itself that could create liability
7. Missing disclaimers for AI-generated content (if applicable)

Be thorough and adversarial. Assume the worst interpretation.

Return a JSON array of findings. Each finding must have:
- "title": one-line summary
- "severity": "critical" | "high" | "medium" | "low" | "info"
- "description": detailed explanation
- "remediation": specific actionable fix
- "category": one of "terms-of-service", "privacy-policy", "data-handling", "gdpr", "ccpa", "hipaa", "pci-dss", "coppa", "ferpa", "accessibility", "licensing", "claims", "ip-risk", "disclaimer"

Return ONLY the JSON array, no other text.`;

    const client = llmFactory.getClient(LLMProvider.Claude);
    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });
    tokenTracker.record('post-rc', 'postrc_scan_legal_product', response.tokensUsed, response.provider);

    return parseLlmLegalFindings(response.content, ValidationModule.LegalProduct, 'LGL-LLM');
  } catch (err) {
    return [
      {
        id: 'LGL-LLM-000',
        module: ValidationModule.LegalProduct,
        severity: Severity.Info,
        title: 'LLM legal analysis unavailable',
        description: `Could not run LLM-based legal analysis: ${(err as Error).message}. Static pattern and license scan results are still valid.`,
        remediation: 'Ensure ANTHROPIC_API_KEY is configured for deeper legal analysis.',
        category: 'disclaimer',
      },
    ];
  }
}
