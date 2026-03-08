import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Finding, SecurityPolicy } from '../../types.js';
import { ValidationModule, Severity } from '../../types.js';
import { hasAnthropicKey, resolveFromRoot } from '../../../../shared/config.js';
import { llmFactory } from '../../../../shared/llm/factory.js';
import { LLMProvider } from '../../../../shared/types.js';
import { tokenTracker } from '../../../../shared/token-tracker.js';
import { recordCost } from '../../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../../shared/learning.js';

const execFileAsync = promisify(execFile);

// Source file extensions to scan
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.vue',
  '.svelte',
  '.astro',
  '.css',
  '.scss',
  '.html',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.env',
  '.env.local',
  '.env.production',
  '.sql',
]);

// Maximum total code size to prevent memory issues
const MAX_CODE_SIZE = 200_000;

/**
 * Security module: Multi-layer scanning.
 *
 * Layer 1: Deterministic static pattern matching (always runs)
 * Layer 2: npm audit for dependency vulnerabilities (always runs if package.json exists)
 * Layer 3: LLM-based analysis against anti-pattern knowledge base (runs if API key configured)
 */
export async function runSecurityModule(
  projectPath: string,
  codeContext: string | undefined,
  policy: SecurityPolicy,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];

  // Load code: provided directly, from Forge output, or from project source files
  const code = codeContext || (await loadProjectCode(projectPath));

  // Layer 1: Static pattern analysis (deterministic, no LLM needed)
  if (code) {
    const staticFindings = runStaticPatternScan(code, policy);
    allFindings.push(...staticFindings);
  }

  // Layer 2: npm audit (deterministic dependency scanning)
  const auditFindings = await runNpmAudit(projectPath, policy);
  allFindings.push(...auditFindings);

  // Layer 3: LLM-based analysis (if API key configured and code available)
  if (code) {
    if (hasAnthropicKey) {
      const knowledgePath = resolveFromRoot('knowledge', 'post-rc');
      const breadthPath = join(knowledgePath, 'sec-context', 'ANTI_PATTERNS_BREADTH.md');
      let secContextKnowledge = '';
      if (existsSync(breadthPath)) {
        secContextKnowledge = await readFile(breadthPath, 'utf-8');
      }

      const prompt = buildSecurityPrompt(code, secContextKnowledge, policy);

      // Warn about truncation
      if (code.length > 30000) {
        allFindings.push({
          id: 'SEC-TRUNC',
          module: ValidationModule.Security,
          severity: Severity.Info,
          title: 'Code truncated for LLM scan',
          description: `Only ${Math.round((30000 / code.length) * 100)}% of code was sent to LLM analysis (${code.length.toLocaleString()} chars truncated to 30,000). Static pattern scan and npm audit covered the full codebase.`,
          remediation: 'Run additional scans on the remaining code, or split code_context into smaller chunks.',
          category: 'configuration',
        });
      }

      const llmFindings = await runLlmScan(prompt, policy);
      // De-duplicate: skip LLM findings that overlap with static findings
      for (const lf of llmFindings) {
        const isDuplicate = allFindings.some(
          (af) => af.category === lf.category && af.filePath === lf.filePath && af.title === lf.title,
        );
        if (!isDuplicate) {
          allFindings.push(lf);
        }
      }
    } else {
      allFindings.push({
        id: 'SEC-PASSTHROUGH',
        module: ValidationModule.Security,
        severity: Severity.Info,
        title: 'LLM analysis skipped -- no API key',
        description:
          'Static pattern scan and npm audit ran, but LLM-based analysis was skipped. Configure ANTHROPIC_API_KEY for deeper analysis.',
        remediation: 'Set ANTHROPIC_API_KEY in .env for full scanning.',
        category: 'passthrough',
      });
    }
  } else if (allFindings.length === 0) {
    allFindings.push({
      id: 'SEC-000',
      module: ValidationModule.Security,
      severity: Severity.Info,
      title: 'No code context found',
      description:
        'No code was provided and no source files found in the project. Pass code_context or ensure rc_forge_task has been run.',
      remediation:
        'Run postrc_scan with code_context parameter, or ensure the RC Method Forge phase has produced code.',
      category: 'configuration',
    });
  }

  // Re-number findings sequentially
  let secIdx = 1;
  for (const f of allFindings) {
    if (!f.id.startsWith('SEC-TRUNC') && !f.id.startsWith('SEC-000') && !f.id.startsWith('SEC-PASSTHROUGH')) {
      f.id = `SEC-${String(secIdx++).padStart(3, '0')}`;
    }
  }

  return allFindings;
}

// ── Layer 1: Static Pattern Scan ──────────────────────────────────────────

interface PatternRule {
  pattern: RegExp;
  title: string;
  severity: Severity;
  cweId: string;
  category: string;
  remediation: string;
}

const STATIC_PATTERNS: PatternRule[] = [
  // Hardcoded secrets
  {
    pattern: /(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/gi,
    title: 'Hardcoded secret or API key',
    severity: Severity.Critical,
    cweId: 'CWE-798',
    category: 'secrets',
    remediation: 'Move secrets to environment variables or a secrets manager. Never commit secrets to source code.',
  },
  // SQL injection
  {
    pattern: /(?:query|exec|execute|raw)\s*\(\s*[`'"][\s\S]*?\$\{/gi,
    title: 'Potential SQL injection via string interpolation',
    severity: Severity.High,
    cweId: 'CWE-89',
    category: 'injection',
    remediation: 'Use parameterized queries or prepared statements instead of string interpolation.',
  },
  // eval() usage
  {
    pattern: /\beval\s*\(/g,
    title: 'Use of eval() -- code injection risk',
    severity: Severity.High,
    cweId: 'CWE-95',
    category: 'injection',
    remediation: 'Replace eval() with JSON.parse(), Function constructor, or a safe expression parser.',
  },
  // innerHTML / dangerouslySetInnerHTML
  {
    pattern: /(?:innerHTML\s*=|dangerouslySetInnerHTML)/g,
    title: 'Direct HTML injection -- XSS risk',
    severity: Severity.High,
    cweId: 'CWE-79',
    category: 'xss',
    remediation: 'Use textContent, safe templating, or sanitize HTML with DOMPurify before injection.',
  },
  // Missing CORS configuration (Express)
  {
    pattern: /cors\(\s*\)/g,
    title: 'CORS configured with no origin restriction',
    severity: Severity.Medium,
    cweId: 'CWE-942',
    category: 'cors',
    remediation: 'Specify allowed origins in cors() configuration instead of allowing all origins.',
  },
  // Command injection
  {
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][\s\S]*?\$\{/gi,
    title: 'Potential command injection via string interpolation',
    severity: Severity.Critical,
    cweId: 'CWE-78',
    category: 'injection',
    remediation: 'Use parameterized commands (e.g., execFile with args array) instead of string interpolation.',
  },
  // Insecure randomness
  {
    pattern: /Math\.random\(\)/g,
    title: 'Math.random() used -- not cryptographically secure',
    severity: Severity.Low,
    cweId: 'CWE-338',
    category: 'crypto',
    remediation: 'Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive random values.',
  },
  // Missing error info disclosure
  {
    pattern: /res\.(?:json|send)\s*\(\s*(?:err|error)(?:\.stack|\.message)?\s*\)/gi,
    title: 'Error details sent in HTTP response',
    severity: Severity.Medium,
    cweId: 'CWE-209',
    category: 'information-disclosure',
    remediation: 'Send generic error messages to clients. Log detailed errors server-side only.',
  },
  // .env file committed
  {
    pattern: /^(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*=/m,
    title: 'Sensitive environment variable in scanned content',
    severity: Severity.High,
    cweId: 'CWE-312',
    category: 'secrets',
    remediation: 'Ensure .env files are in .gitignore and never committed to version control.',
  },
  // JWT without verification
  {
    pattern: /jwt\.decode\s*\(/g,
    title: 'JWT decoded without signature verification',
    severity: Severity.High,
    cweId: 'CWE-347',
    category: 'auth',
    remediation: 'Use jwt.verify() instead of jwt.decode() to validate the token signature.',
  },
  // Path traversal
  {
    pattern: /path\.join\s*\([^)]*(?:req\.|params\.|query\.|body\.)/g,
    title: 'User input in path.join -- path traversal risk',
    severity: Severity.High,
    cweId: 'CWE-22',
    category: 'path-traversal',
    remediation: 'Validate and canonicalize paths. Ensure resolved path stays within the allowed directory.',
  },
  // Env exposure: NEXT_PUBLIC_ with sensitive values
  {
    pattern: /NEXT_PUBLIC_(?:SECRET|API_KEY|DATABASE|SUPABASE_SERVICE|PRIVATE|PASSWORD|TOKEN)/gi,
    title: 'Sensitive value exposed via NEXT_PUBLIC_ prefix',
    severity: Severity.Critical,
    cweId: 'CWE-200',
    category: 'env-exposure',
    remediation:
      'Never use NEXT_PUBLIC_ prefix for secrets, database URLs, or service role keys. These are bundled into client-side JavaScript.',
  },
  // Env exposure: process.env in client component
  {
    pattern: /['"]use client['"][\s\S]{0,500}process\.env\./gis,
    title: 'process.env accessed in client component',
    severity: Severity.High,
    cweId: 'CWE-200',
    category: 'env-exposure',
    remediation:
      'Only access non-NEXT_PUBLIC_ env vars in server components, API routes, or getServerSideProps.',
  },
  // Unescaped template interpolation in HTML strings
  {
    pattern: /`<[^`]*\$\{(?!esc\(|escapeHtml\(|sanitize)[^}]*\}[^`]*>`/g,
    title: 'Unescaped interpolation in HTML template literal',
    severity: Severity.High,
    cweId: 'CWE-79',
    category: 'xss',
    remediation:
      'Wrap all interpolated values in HTML template literals with an escape function (e.g., esc(), escapeHtml()). Never interpolate raw values into HTML.',
  },
  // CSP with unsafe-inline for scripts
  {
    pattern: /scriptSrc:.*['"]'unsafe-inline'['"]/g,
    title: "CSP allows 'unsafe-inline' scripts -- XSS protection defeated",
    severity: Severity.High,
    cweId: 'CWE-79',
    category: 'csp',
    remediation:
      "Remove 'unsafe-inline' from scriptSrc. Use nonces or hashes for inline scripts that must execute.",
  },
  // path.resolve with user input but no startsWith check
  {
    pattern: /path\.resolve\s*\([^)]*(?:req\.|params\.|query\.|body\.)[^)]*\)(?![\s\S]{0,200}startsWith)/g,
    title: 'User input in path.resolve without containment check',
    severity: Severity.High,
    cweId: 'CWE-22',
    category: 'path-traversal',
    remediation:
      'After resolving a path with user input, validate the result with startsWith() against an allowed base directory.',
  },
  // Inline style with unescaped interpolation
  {
    pattern: /style=["'][^"']*\$\{(?!Math\.|sanitize|String\(|Number\()[^}]*\}/g,
    title: 'Unescaped interpolation in HTML style attribute -- CSS injection risk',
    severity: Severity.Medium,
    cweId: 'CWE-79',
    category: 'xss',
    remediation:
      'Sanitize values interpolated into style attributes. Use a sanitizeStyleValue() function or clamp numeric values to safe ranges.',
  },
  // Session/auth token accepted from custom header (bypasses httpOnly)
  {
    pattern: /req\.headers\[['"]x-(?:session|auth|token)['"]\]/gi,
    title: 'Auth token accepted from custom header -- bypasses httpOnly cookie protection',
    severity: Severity.Medium,
    cweId: 'CWE-614',
    category: 'auth',
    remediation:
      'Accept session tokens only via httpOnly cookies. Custom headers expose tokens to XSS attacks.',
  },
  // POST/PUT/DELETE route without role or auth check
  {
    pattern: /app\.(?:post|put|delete)\s*\(\s*['"][^'"]+['"]\s*,\s*(?:async\s+)?\(?(?:req|_req)/g,
    title: 'Mutation endpoint may lack authentication middleware',
    severity: Severity.Medium,
    cweId: 'CWE-862',
    category: 'authorization',
    remediation:
      'All POST/PUT/DELETE endpoints should include requireAuth or equivalent middleware before the handler. Verify that authentication and authorization checks are applied.',
  },
  // console.log with token/secret/key/password in the argument
  {
    pattern: /console\.log\s*\([^)]*(?:token|secret|password|api[_-]?key)[^)]*\)/gi,
    title: 'Sensitive value (token/secret/key) logged to console',
    severity: Severity.Medium,
    cweId: 'CWE-532',
    category: 'logging',
    remediation:
      'Never log tokens, secrets, or API keys. Use structured audit logging that redacts sensitive values.',
  },
  // Missing CAPTCHA on auth/login/register endpoints
  {
    pattern: /app\.post\s*\(\s*['"]\/(?:auth|login|register|signup)['"]/g,
    title: 'Auth endpoint may lack CAPTCHA protection',
    severity: Severity.Low,
    cweId: 'CWE-799',
    category: 'auth',
    remediation:
      'Add CAPTCHA verification (Turnstile, reCAPTCHA, or hCaptcha) to authentication endpoints to prevent automated abuse.',
  },
  // Error message leaked to client (CWE-209)
  {
    pattern: /res\.(?:status\(\d+\)\.)?json\s*\(\s*\{\s*error:\s*\((?:err|error)\s+as\s+Error\)\.message/g,
    title: 'Internal error message leaked to HTTP client',
    severity: Severity.High,
    cweId: 'CWE-209',
    category: 'information-disclosure',
    remediation:
      'Return generic error messages to clients. Log full error details server-side with a structured logger. Use a centralized error handler middleware.',
  },
  // Missing request body validation (CWE-20)
  {
    pattern: /req\.body\s+as\s+\{[^}]*\}/g,
    title: 'Request body cast without validation -- trusts client input',
    severity: Severity.Medium,
    cweId: 'CWE-20',
    category: 'input-validation',
    remediation:
      'Validate request bodies with a schema validation library (Zod, Joi, or yup) before use. Never trust type assertions on client input.',
  },
  // Missing HSTS header (CWE-319)
  {
    pattern: /helmet\s*\(\s*\{(?:(?!hsts)[\s\S])*\}\s*\)/g,
    title: 'Helmet configured without HSTS -- HTTPS not enforced on repeat visits',
    severity: Severity.Medium,
    cweId: 'CWE-319',
    category: 'transport-security',
    remediation:
      'Add hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } to helmet configuration.',
  },
  // Missing startup env var validation (CWE-1188)
  {
    pattern: /process\.env\.(?:STRIPE_SECRET|DATABASE_URL|RESEND_API|SMTP_PASS)\w*\s*\|\|\s*['"]/g,
    title: 'Secret falls back to empty string -- no startup validation',
    severity: Severity.Medium,
    cweId: 'CWE-1188',
    category: 'configuration',
    remediation:
      'Validate required secrets at startup (before app.listen). Throw an error if critical env vars are missing in production.',
  },
  // Unbounded WebSocket message (CWE-400)
  {
    pattern: /new\s+WebSocketServer\s*\((?:(?!maxPayload)[\s\S])*\)/g,
    title: 'WebSocket server has no message size limit -- resource exhaustion risk',
    severity: Severity.Medium,
    cweId: 'CWE-400',
    category: 'resource-management',
    remediation:
      'Set maxPayload on WebSocketServer or validate message size in the message handler. Reject oversized messages.',
  },
  // Missing CSRF protection (CWE-352)
  {
    pattern: /app\.(?:post|put|delete)\s*\([^)]+(?:(?!csrf|csrfProtection|webhook)[\s\S]){0,200}(?:req\.body|req\.params)/g,
    title: 'Mutation endpoint may lack CSRF protection',
    severity: Severity.Low,
    cweId: 'CWE-352',
    category: 'csrf',
    remediation:
      'Apply CSRF token validation middleware to all state-changing endpoints. Use SameSite cookies as a baseline and add explicit CSRF tokens for enterprise proxy compatibility.',
  },
  // console.log/error used directly instead of structured logger
  {
    pattern: /console\.(?:log|error|warn)\s*\(\s*[`'"][^`'"]*(?:user|email|session|auth|billing|payment)/gi,
    title: 'Unstructured logging with potentially sensitive context',
    severity: Severity.Low,
    cweId: 'CWE-778',
    category: 'logging',
    remediation:
      'Replace console.log/error/warn with a structured logger (Winston, Pino, or custom) that supports log levels, correlation IDs, and automatic PII masking.',
  },
  // PII in audit/log output without masking
  {
    pattern: /auditLog\s*\(\s*\{[^}]*actorEmail:\s*(?:user\.email|req\.user\.email|email)/g,
    title: 'PII (email) stored in audit log without pseudonymization',
    severity: Severity.Medium,
    cweId: 'CWE-359',
    category: 'privacy',
    remediation:
      'Hash or pseudonymize email addresses before storing in audit logs. Use a one-way hash (SHA-256 truncated) so logs are useful for correlation but not PII exposure.',
  },

  // ── UI Anti-Pattern Rules ───────────────────────────────────────────────────

  // transition: all is a performance anti-pattern (forces browser to watch every property)
  {
    pattern: /transition\s*:\s*all\b/g,
    title: 'CSS transition: all — performance anti-pattern',
    severity: Severity.Low,
    cweId: 'CWE-400',
    category: 'ui-performance',
    remediation:
      'List specific properties instead of "all" (e.g., transition: transform 200ms, opacity 200ms). "transition: all" forces the browser to watch every CSS property for changes.',
  },
  // <div onClick> without role="button" — accessibility violation
  {
    pattern: /<div\s[^>]*onClick[^>]*(?!role=["']button["'])>/g,
    title: '<div onClick> without role="button" — not keyboard accessible',
    severity: Severity.Medium,
    cweId: 'CWE-20',
    category: 'accessibility',
    remediation:
      'Use <button> for actions instead of <div onClick>. If a div must handle clicks, add role="button", tabIndex={0}, and onKeyDown for Enter/Space.',
  },
  // outline: none / outline-none without focus-visible replacement
  {
    pattern: /outline:\s*(?:none|0)\s*;(?![\s\S]{0,100}:focus-visible)/g,
    title: 'outline: none without :focus-visible replacement — focus ring removed',
    severity: Severity.Medium,
    cweId: 'CWE-20',
    category: 'accessibility',
    remediation:
      'Never remove outline without providing a visible :focus-visible style. Users who navigate by keyboard lose all orientation without focus indicators.',
  },
  // user-scalable=no or maximum-scale=1 — blocks zoom for accessibility
  {
    pattern: /(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?)\b/g,
    title: 'Viewport blocks user zoom — accessibility violation',
    severity: Severity.Medium,
    cweId: 'CWE-20',
    category: 'accessibility',
    remediation:
      'Remove user-scalable=no and maximum-scale=1 from viewport meta tags. Users with low vision rely on pinch-to-zoom. WCAG 1.4.4 requires support for 200% zoom.',
  },
];

function runStaticPatternScan(code: string, policy: SecurityPolicy): Finding[] {
  const findings: Finding[] = [];

  for (const rule of STATIC_PATTERNS) {
    if (policy.suppressedCWEs.includes(rule.cweId)) continue;

    // Reset regex state
    rule.pattern.lastIndex = 0;
    const matches: string[] = [];
    let match;
    while ((match = rule.pattern.exec(code)) !== null) {
      matches.push(match[0].slice(0, 80));
      if (matches.length >= 5) break; // Cap at 5 matches per pattern
    }

    if (matches.length > 0) {
      findings.push({
        id: 'SEC-STATIC',
        module: ValidationModule.Security,
        severity: rule.severity,
        title: rule.title,
        description: `Found ${matches.length} instance(s). Pattern: ${rule.cweId}\nExamples: ${matches.map((m) => `"${m}"`).join(', ')}`,
        cweId: rule.cweId,
        remediation: rule.remediation,
        category: rule.category,
      });
    }
  }

  return findings;
}

// ── Layer 2: npm audit ──────────────────────────────────────────────────────

async function runNpmAudit(projectPath: string, policy: SecurityPolicy): Promise<Finding[]> {
  // Check for package.json -- npm audit only works in Node.js projects
  const pkgJsonPath = join(projectPath, 'package.json');
  if (!existsSync(pkgJsonPath)) return [];

  // Also need node_modules or package-lock.json
  const lockPath = join(projectPath, 'package-lock.json');
  if (!existsSync(lockPath)) return [];

  try {
    const { stdout } = await execFileAsync('npm', ['audit', '--json', '--omit=dev'], {
      cwd: projectPath,
      timeout: 30000,
    });

    return parseNpmAuditOutput(stdout, policy);
  } catch (err: unknown) {
    // npm audit exits with non-zero when vulnerabilities found -- parse stdout from the error
    const execError = err as { stdout?: string; stderr?: string; code?: number };
    if (execError.stdout) {
      return parseNpmAuditOutput(execError.stdout, policy);
    }
    // Actual execution failure
    return [
      {
        id: 'SEC-AUDIT-ERR',
        module: ValidationModule.Security,
        severity: Severity.Info,
        title: 'npm audit could not run',
        description: `Error: ${execError.stderr || String(err)}`,
        remediation: 'Ensure npm is installed and package-lock.json exists.',
        category: 'dependency',
      },
    ];
  }
}

interface NpmAuditVulnerability {
  name: string;
  severity: string;
  via: Array<string | { title?: string; url?: string; cwe?: string[] }>;
  fixAvailable: boolean | { name: string; version: string };
  range: string;
}

function parseNpmAuditOutput(stdout: string, policy: SecurityPolicy): Finding[] {
  try {
    const audit = JSON.parse(stdout) as {
      vulnerabilities?: Record<string, NpmAuditVulnerability>;
    };

    if (!audit.vulnerabilities) return [];

    const findings: Finding[] = [];

    for (const [pkg, vuln] of Object.entries(audit.vulnerabilities)) {
      const severity = mapSeverity(vuln.severity);

      // Extract CWE IDs from via entries
      const cwes: string[] = [];
      const titles: string[] = [];
      for (const v of vuln.via) {
        if (typeof v === 'object' && v !== null) {
          if (v.cwe) cwes.push(...v.cwe);
          if (v.title) titles.push(v.title);
        }
      }

      // Check suppression
      if (cwes.some((cwe) => policy.suppressedCWEs.includes(cwe))) continue;

      const title = titles.length > 0 ? titles[0] : `Vulnerable dependency: ${pkg}`;
      const fixNote =
        typeof vuln.fixAvailable === 'object'
          ? `Update to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
          : vuln.fixAvailable
            ? 'Run npm audit fix'
            : 'No fix available -- consider replacing this dependency';

      findings.push({
        id: 'SEC-DEP',
        module: ValidationModule.Security,
        severity,
        title: `[Dependency] ${title}`,
        description: `Package: ${pkg} (${vuln.range})\nSeverity: ${vuln.severity}${cwes.length > 0 ? `\nCWE: ${cwes.join(', ')}` : ''}`,
        cweId: cwes[0],
        remediation: fixNote,
        category: 'dependency',
      });
    }

    return findings;
  } catch {
    return [];
  }
}

// ── Layer 3: LLM Scan ───────────────────────────────────────────────────────

async function runLlmScan(prompt: string, policy: SecurityPolicy): Promise<Finding[]> {
  try {
    const client = llmFactory.getClient(LLMProvider.Claude);
    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    tokenTracker.record('post-rc', 'postrc_scan', response.tokensUsed, response.provider, { inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    recordCost({
      pipelineId: 'postrc-session',
      domain: 'post-rc',
      tool: 'postrc_scan',
      provider: response.provider,
      model: client.getModel(),
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? response.tokensUsed,
    });
    recordModelPerformance({
      provider: response.provider,
      model: client.getModel(),
      taskType: 'postrc-security-scan',
      tokensUsed: response.tokensUsed,
      success: true,
    });

    return parseFindings(response.content, policy);
  } catch (err) {
    console.error('[post-rc] Security scan LLM error:', err);
    return [
      {
        id: 'SEC-ERR',
        module: ValidationModule.Security,
        severity: Severity.Info,
        title: 'Security scan LLM call failed',
        description: `Error: ${(err as Error).message}`,
        remediation: 'Check API key and try again.',
        category: 'error',
      },
    ];
  }
}

function buildSecurityPrompt(code: string, knowledge: string, policy: SecurityPolicy): string {
  const suppressionNote =
    policy.suppressedCWEs.length > 0
      ? `\n\nSUPPRESSED CWEs (do NOT flag these): ${policy.suppressedCWEs.join(', ')}`
      : '';

  return `You are a security scanner for AI-generated code. Analyze the following code against the anti-pattern knowledge base and report findings.

## Instructions
1. Check the code against each anti-pattern category in the knowledge base
2. For each vulnerability found, report: severity (critical/high/medium/low), CWE ID, title, description, file/line if identifiable, and remediation
3. Return findings as a JSON array of objects with fields: severity, cweId, title, description, filePath, lineRange, remediation, category
4. If no vulnerabilities found, return an empty array: []
5. Be precise - do NOT flag false positives. Only flag patterns that clearly match the anti-patterns.
6. Focus on business logic vulnerabilities, auth/authz flaws, and data handling issues that static patterns cannot detect.
${suppressionNote}

## Anti-Pattern Knowledge Base
${knowledge ? knowledge.slice(0, 50000) : 'Knowledge base not loaded. Use general security best practices.'}

## Code to Analyze
${code.length > 30000 ? `**WARNING: Code truncated from ${code.length.toLocaleString()} to 30,000 characters (${Math.round((30000 / code.length) * 100)}% coverage).**\n` : ''}
\`\`\`
${code.slice(0, 30000)}
\`\`\`

Return ONLY a valid JSON array. No markdown, no explanation.`;
}

function parseFindings(text: string, policy: SecurityPolicy): Finding[] {
  try {
    // Extract JSON array from response (non-greedy match)
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.error('[post-rc] No JSON array found in LLM response');
      return [
        {
          id: 'SEC-PARSE',
          module: ValidationModule.Security,
          severity: Severity.Info,
          title: 'LLM scan returned non-parseable response',
          description: 'The LLM response did not contain a valid JSON array. This may indicate a model issue.',
          remediation: 'Re-run the scan. If this persists, check the LLM model configuration.',
          category: 'error',
        },
      ];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      severity?: string;
      cweId?: string;
      title?: string;
      description?: string;
      filePath?: string;
      lineRange?: { start: number; end: number };
      remediation?: string;
      category?: string;
    }>;

    return parsed
      .filter((f) => f.title && f.description)
      .filter((f) => !policy.suppressedCWEs.includes(f.cweId || ''))
      .map((f, i) => ({
        id: `SEC-LLM-${String(i + 1).padStart(3, '0')}`,
        module: ValidationModule.Security,
        severity: mapSeverity(f.severity || 'medium'),
        title: f.title || 'Unknown finding',
        description: f.description || '',
        cweId: f.cweId,
        filePath: f.filePath,
        lineRange: normalizeLineRange(f.lineRange),
        remediation: f.remediation || 'Review and fix the identified pattern.',
        category: f.category || 'security',
      }));
  } catch (err) {
    console.error('[post-rc] Failed to parse security findings:', err);
    return [
      {
        id: 'SEC-PARSE',
        module: ValidationModule.Security,
        severity: Severity.Info,
        title: 'LLM scan response parsing failed',
        description: `Could not parse JSON from LLM response: ${(err as Error).message}`,
        remediation: 'Re-run the scan.',
        category: 'error',
      },
    ];
  }
}

/** Normalize lineRange from LLM output -- may arrive as string "45-50" or object { start, end }. */
function normalizeLineRange(raw: unknown): { start: number; end: number } | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.start === 'number' && typeof obj.end === 'number') {
      return { start: obj.start, end: obj.end };
    }
  }
  if (typeof raw === 'string') {
    const match = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (match) return { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
    const single = parseInt(raw, 10);
    if (!isNaN(single)) return { start: single, end: single };
  }
  return undefined;
}

function mapSeverity(s: string): Severity {
  switch (s.toLowerCase()) {
    case 'critical':
      return Severity.Critical;
    case 'high':
      return Severity.High;
    case 'medium':
    case 'moderate':
      return Severity.Medium;
    case 'low':
      return Severity.Low;
    default:
      return Severity.Medium;
  }
}

// ── Code Loading ────────────────────────────────────────────────────────────

async function loadProjectCode(projectPath: string): Promise<string | null> {
  const contents: string[] = [];
  let totalSize = 0;

  // Priority 1: Load from Forge output (actual generated code)
  const forgeDir = join(projectPath, 'rc-method', 'forge');
  if (existsSync(forgeDir)) {
    await collectSourceFiles(forgeDir, contents, { totalSize, maxSize: MAX_CODE_SIZE });
    totalSize = contents.reduce((sum, c) => sum + c.length, 0);
  }

  // Priority 2: Load from project source directories
  const sourceDirs = ['src', 'app', 'lib', 'pages', 'components', 'api', 'server'];
  for (const dir of sourceDirs) {
    if (totalSize >= MAX_CODE_SIZE) break;
    const fullDir = join(projectPath, dir);
    if (existsSync(fullDir)) {
      await collectSourceFiles(fullDir, contents, { totalSize, maxSize: MAX_CODE_SIZE });
      totalSize = contents.reduce((sum, c) => sum + c.length, 0);
    }
  }

  // Priority 3: Load root-level source files (index.ts, app.ts, etc.)
  if (totalSize < MAX_CODE_SIZE) {
    try {
      const rootFiles = await readdir(projectPath);
      for (const file of rootFiles) {
        if (totalSize >= MAX_CODE_SIZE) break;
        const ext = extname(file);
        if (CODE_EXTENSIONS.has(ext) && !file.startsWith('.')) {
          try {
            const fileStat = await stat(join(projectPath, file));
            if (fileStat.isFile() && fileStat.size < 50000) {
              const content = await readFile(join(projectPath, file), 'utf-8');
              contents.push(`--- ${file} ---\n${content}`);
              totalSize += content.length;
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip if directory listing fails
    }
  }

  return contents.length > 0 ? contents.join('\n\n') : null;
}

async function collectSourceFiles(
  dir: string,
  contents: string[],
  budget: { totalSize: number; maxSize: number },
  depth = 0,
): Promise<void> {
  if (depth > 5 || budget.totalSize >= budget.maxSize) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (budget.totalSize >= budget.maxSize) break;

      const fullPath = join(dir, entry.name);

      // Skip common non-source directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor'].includes(entry.name)) continue;
        await collectSourceFiles(fullPath, contents, budget, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extname(entry.name);
      if (!CODE_EXTENSIONS.has(ext)) continue;

      try {
        const fileStat = await stat(fullPath);
        if (fileStat.size > 50000) continue; // Skip very large files

        const content = await readFile(fullPath, 'utf-8');
        contents.push(`--- ${fullPath} ---\n${content}`);
        budget.totalSize += content.length;
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip unreadable directories
  }
}
