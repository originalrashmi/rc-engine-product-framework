import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import type { Finding } from '../../types.js';
import { ValidationModule, Severity } from '../../types.js';
import type { AppSecurityPolicy } from '../../types.js';
import { hasAnthropicKey } from '../../../../shared/config.js';
import { llmFactory } from '../../../../shared/llm/factory.js';
import { LLMProvider } from '../../../../shared/types.js';
import { tokenTracker } from '../../../../shared/token-tracker.js';
import { recordCost } from '../../../../shared/cost-tracker.js';
import { recordModelPerformance } from '../../../../shared/learning.js';

/**
 * Application Security Auditor - 5 audit skills from the
 * "How to secure vibe coded apps" framework.
 *
 * Skill 1: Auth + Abuse (session logic, CAPTCHA, brute-force, enumeration)
 * Skill 2: Authorization + RLS (user data scoping, Supabase policies, admin routes)
 * Skill 3: Validation + Input Safety (server-side validation on every write, unsafe rendering)
 * Skill 4: Search + Query Safety (pagination caps, sort allowlists, query parameterization)
 * Skill 5: Admin Workflow (privilege escalation, server-side role checks, audit trails)
 *
 * 3-layer pattern: static patterns (always), structural analysis (always), LLM (if API key).
 */
export async function runAppSecurityModule(
  projectPath: string,
  codeContext: string | undefined,
  policy: AppSecurityPolicy,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];
  let findingCount = 0;
  const nextId = () => `APP-${String(++findingCount).padStart(3, '0')}`;

  const code = codeContext || (await loadProjectCode(projectPath));

  if (!code) {
    allFindings.push({
      id: nextId(),
      module: ValidationModule.AppSecurity,
      severity: Severity.Info,
      title: 'No code context found for application security audit',
      description:
        'No code was provided and no source files found. Pass code_context or ensure the RC Method Forge phase has produced code.',
      remediation: 'Run postrc_scan with code_context parameter.',
      category: 'configuration',
    });
    return allFindings;
  }

  // Layer 1: Static pattern analysis (deterministic)
  const staticFindings = runStaticPatterns(code, policy, nextId);
  allFindings.push(...staticFindings);

  // Layer 2: Structural analysis (deterministic)
  const structuralFindings = await runStructuralAnalysis(projectPath, code, policy, nextId);
  allFindings.push(...structuralFindings);

  // Layer 3: LLM-based deep analysis (if API key configured)
  if (hasAnthropicKey) {
    const llmFindings = await runLlmAnalysis(code, policy, nextId);
    // De-duplicate against static + structural findings
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
      id: nextId(),
      module: ValidationModule.AppSecurity,
      severity: Severity.Info,
      title: 'LLM analysis skipped - no API key',
      description:
        'Static and structural scans ran, but LLM-based deep analysis was skipped. Configure ANTHROPIC_API_KEY for full coverage.',
      remediation: 'Set ANTHROPIC_API_KEY in .env for full scanning.',
      category: 'passthrough',
    });
  }

  return allFindings;
}

// ── Layer 1: Static Pattern Analysis ─────────────────────────────────────────

interface AppPatternRule {
  pattern: RegExp;
  skill: 1 | 2 | 3 | 4 | 5;
  title: string;
  severity: Severity;
  cweId: string;
  category: string;
  remediation: string;
}

const APP_PATTERNS: AppPatternRule[] = [
  // ── Skill 1: Auth + Abuse ──
  {
    pattern: /(?:login|signin|sign_in|authenticate)\s*\([^)]*\)\s*\{[^}]*(?!.*(?:rateLimit|captcha|throttle))/gis,
    skill: 1,
    title: 'Auth endpoint without rate limiting or CAPTCHA',
    severity: Severity.High,
    cweId: 'CWE-307',
    category: 'auth-abuse',
    remediation:
      'Add rate limiting (e.g., express-rate-limit, @upstash/ratelimit) and CAPTCHA verification to auth endpoints.',
  },
  {
    pattern: /(?:user\s*not\s*found|invalid\s*password|no\s*account|email\s*not\s*registered)/gi,
    skill: 1,
    title: 'User enumeration via distinct error messages',
    severity: Severity.Medium,
    cweId: 'CWE-204',
    category: 'auth-abuse',
    remediation: 'Return the same generic message for both invalid email and invalid password: "Invalid credentials".',
  },
  {
    pattern: /session\s*\.\s*(?:maxAge|cookie)\s*.*(?:Infinity|\d{8,})/gi,
    skill: 1,
    title: 'Session with excessively long lifetime',
    severity: Severity.Medium,
    cweId: 'CWE-613',
    category: 'auth-abuse',
    remediation: 'Set session maxAge to a reasonable limit (e.g., 24h for active sessions, 7d with refresh tokens).',
  },
  {
    pattern: /(?:password|pwd)\s*\.?\s*(?:length|size)\s*(?:>=?|>)\s*[1-5]\b/gi,
    skill: 1,
    title: 'Weak minimum password length requirement',
    severity: Severity.Medium,
    cweId: 'CWE-521',
    category: 'auth-abuse',
    remediation:
      'Enforce minimum 8-character passwords. Consider NIST guidelines (8+ chars, check against breach lists).',
  },

  // ── Skill 2: Authorization + RLS ──
  {
    pattern:
      /\.(?:findMany|findFirst|findUnique|select|from)\s*\([^)]*\)(?![^}]*(?:where|filter).*(?:userId|user_id|ownerId|owner_id|createdBy|created_by))/gis,
    skill: 2,
    title: 'Database query without user-scoped filter',
    severity: Severity.High,
    cweId: 'CWE-639',
    category: 'authorization-rls',
    remediation:
      'Add a WHERE clause filtering by the authenticated user ID. Never return data belonging to other users.',
  },
  {
    pattern: /(?:isAdmin|is_admin|role)\s*[:=]\s*(?:req\.body|req\.query|request\.body|params)/gi,
    skill: 2,
    title: 'Admin role set from client-supplied input',
    severity: Severity.Critical,
    cweId: 'CWE-269',
    category: 'authorization-rls',
    remediation:
      'Never trust client-supplied role values. Resolve roles server-side from the authenticated session/token.',
  },
  {
    pattern: /supabase\s*\.\s*from\s*\([^)]+\)(?![^;]*\.(?:select|insert|update|delete)\s*\([^)]*\).*rls)/gis,
    skill: 2,
    title: 'Supabase query - verify RLS policies are enabled',
    severity: Severity.Medium,
    cweId: 'CWE-862',
    category: 'authorization-rls',
    remediation:
      'Ensure Row Level Security (RLS) is enabled on all Supabase tables. Use `supabase.auth.getUser()` for server-side auth.',
  },

  // ── Skill 3: Validation + Input Safety ──
  {
    pattern: /req\.body\s*(?:\.\w+)?\s*(?:;|\))/g,
    skill: 3,
    title: 'Request body used without validation',
    severity: Severity.High,
    cweId: 'CWE-20',
    category: 'validation-input',
    remediation: "Validate all request body fields with Zod, Yup, or joi before use. Parse, don't validate.",
  },
  {
    pattern: /(?:dangerouslySetInnerHTML|innerHTML\s*=|\.html\s*\(|v-html\s*=)/gi,
    skill: 3,
    title: 'Unsafe HTML rendering - XSS risk',
    severity: Severity.High,
    cweId: 'CWE-79',
    category: 'validation-input',
    remediation: 'Sanitize HTML with DOMPurify before rendering. Prefer text content or safe templating.',
  },
  {
    pattern: /\.create\s*\(\s*\{[^}]*data\s*:\s*(?:req\.body|body|input)\b/gi,
    skill: 3,
    title: 'Mass assignment - raw request body passed to create',
    severity: Severity.High,
    cweId: 'CWE-915',
    category: 'validation-input',
    remediation: 'Explicitly pick allowed fields from the request body. Never pass raw input to ORM create/update.',
  },

  // ── Skill 4: Search + Query Safety ──
  {
    pattern:
      /(?:limit|take|pageSize|page_size)\s*[:=]\s*(?:req\.|query\.|params\.|parseInt\s*\(\s*(?:req|query|params))/gi,
    skill: 4,
    title: 'Pagination limit from user input without cap',
    severity: Severity.Medium,
    cweId: 'CWE-770',
    category: 'search-query',
    remediation: 'Cap pagination limits server-side (e.g., Math.min(userLimit, 100)). Never allow unbounded queries.',
  },
  {
    pattern: /orderBy\s*:\s*(?:req\.|query\.|params\.|body\.)/gi,
    skill: 4,
    title: 'Sort field from user input without allowlist',
    severity: Severity.Medium,
    cweId: 'CWE-89',
    category: 'search-query',
    remediation: 'Validate sort fields against an allowlist of permitted column names. Reject unknown fields.',
  },
  {
    pattern: /(?:\$\{.*?\}|` ?\+).*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/gi,
    skill: 4,
    title: 'Dynamic SQL construction with string interpolation',
    severity: Severity.Critical,
    cweId: 'CWE-89',
    category: 'search-query',
    remediation: 'Use parameterized queries or prepared statements. Never interpolate user input into SQL.',
  },

  // ── Skill 5: Admin Workflow ──
  {
    pattern: /(?:\/admin|\/dashboard|\/manage)(?:\/[a-z-]*)*['"`]\s*(?:,|\))/gi,
    skill: 5,
    title: 'Admin route - verify server-side role check',
    severity: Severity.Medium,
    cweId: 'CWE-862',
    category: 'admin-workflow',
    remediation:
      'Ensure all admin routes have server-side middleware checking the user role from the session/token, not just client-side guards.',
  },
  {
    pattern: /(?:delete|remove|destroy|drop)\s*(?:User|Account|Organization|Team|Project)\b/gi,
    skill: 5,
    title: 'Destructive admin action - verify authorization and audit',
    severity: Severity.High,
    cweId: 'CWE-272',
    category: 'admin-workflow',
    remediation:
      'Require admin role verification + audit logging for destructive actions. Consider soft-delete with recovery period.',
  },
];

function runStaticPatterns(code: string, policy: AppSecurityPolicy, nextId: () => string): Finding[] {
  const findings: Finding[] = [];
  const activeSkills = new Set(policy.skills ?? [1, 2, 3, 4, 5]);

  for (const rule of APP_PATTERNS) {
    if (!activeSkills.has(rule.skill)) continue;
    if (policy.suppressedFindings.includes(rule.cweId)) continue;

    rule.pattern.lastIndex = 0;
    const matches: string[] = [];
    let match;
    while ((match = rule.pattern.exec(code)) !== null) {
      matches.push(match[0].slice(0, 80));
      if (matches.length >= 5) break;
    }

    if (matches.length > 0) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: rule.severity,
        title: rule.title,
        description: `Found ${matches.length} instance(s). ${rule.cweId}\nExamples: ${matches.map((m) => `"${m}"`).join(', ')}`,
        cweId: rule.cweId,
        remediation: rule.remediation,
        category: rule.category,
      });
    }
  }

  return findings;
}

// ── Layer 2: Structural Analysis ─────────────────────────────────────────────

async function runStructuralAnalysis(
  projectPath: string,
  code: string,
  policy: AppSecurityPolicy,
  nextId: () => string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const activeSkills = new Set(policy.skills ?? [1, 2, 3, 4, 5]);

  // Skill 1: Check for rate limiting middleware
  if (activeSkills.has(1)) {
    const hasRateLimiter = /(?:rateLimit|rate-limit|@upstash\/ratelimit|express-rate-limit|limiter)/i.test(code);
    const hasAuthRoutes = /(?:\/api\/auth|\/api\/login|\/api\/register|\/api\/signup|signIn|signUp)/i.test(code);
    if (hasAuthRoutes && !hasRateLimiter) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.High,
        title: 'Auth routes detected without rate limiting library',
        description:
          'The codebase has auth-related routes but no rate limiting library is referenced. Brute-force attacks are unmitigated.',
        remediation:
          'Install and configure a rate limiter (e.g., @upstash/ratelimit for serverless, express-rate-limit for Express).',
        category: 'auth-abuse',
      });
    }

    // Check for CAPTCHA on signup/register
    const hasSignup = /(?:register|signup|sign.?up|create.?account)/i.test(code);
    const hasCaptcha = /(?:captcha|recaptcha|turnstile|hcaptcha)/i.test(code);
    if (hasSignup && !hasCaptcha) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.Medium,
        title: 'Registration flow without CAPTCHA',
        description: 'A signup/registration flow exists but no CAPTCHA library is referenced. Bot abuse risk.',
        remediation: 'Add Cloudflare Turnstile or reCAPTCHA to registration forms to prevent automated signups.',
        category: 'auth-abuse',
      });
    }
  }

  // Skill 2: Check for RLS in Supabase projects
  if (activeSkills.has(2)) {
    const hasPkgJson = existsSync(join(projectPath, 'package.json'));
    if (hasPkgJson) {
      try {
        const pkgContent = await readFile(join(projectPath, 'package.json'), 'utf-8');
        const usesSupabase = /@supabase\/supabase-js/i.test(pkgContent);
        if (usesSupabase) {
          // Check for SQL migration files without RLS
          const migrationsDir = join(projectPath, 'supabase', 'migrations');
          if (existsSync(migrationsDir)) {
            const migFiles = await readdir(migrationsDir);
            for (const mf of migFiles.filter((f) => f.endsWith('.sql'))) {
              const migContent = await readFile(join(migrationsDir, mf), 'utf-8');
              const createTableMatches = migContent.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi);
              const rlsEnableMatches = migContent.match(/ALTER\s+TABLE\s+\w+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
              if (createTableMatches && (!rlsEnableMatches || rlsEnableMatches.length < createTableMatches.length)) {
                findings.push({
                  id: nextId(),
                  module: ValidationModule.AppSecurity,
                  severity: Severity.Critical,
                  title: `Tables created without RLS in ${mf}`,
                  description: `Found ${createTableMatches.length} CREATE TABLE statements but only ${rlsEnableMatches?.length ?? 0} RLS ENABLE statements. Unprotected tables expose all rows to any authenticated user.`,
                  filePath: `supabase/migrations/${mf}`,
                  remediation:
                    'Add `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` and appropriate policies for every table.',
                  category: 'authorization-rls',
                });
              }
            }
          }
        }
      } catch {
        // Skip if package.json unreadable
      }
    }

    // Check for middleware/auth guard patterns
    const hasMiddleware = /middleware\.(ts|js)|(?:withAuth|requireAuth|authGuard|protect)/i.test(code);
    const hasApiRoutes = /\/api\//i.test(code);
    if (hasApiRoutes && !hasMiddleware) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.High,
        title: 'API routes without auth middleware pattern',
        description:
          'API routes exist but no auth middleware/guard pattern is detected. Routes may be publicly accessible.',
        remediation: 'Create auth middleware that validates session/JWT on all protected API routes.',
        category: 'authorization-rls',
      });
    }
  }

  // Skill 3: Check for validation library usage
  if (activeSkills.has(3)) {
    const hasValidation = /(?:zod|yup|joi|class-validator|superstruct|valibot|arktype)/i.test(code);
    const hasApiEndpoints =
      /(?:export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)|app\.(?:get|post|put|patch|delete)|router\.(?:get|post|put|patch|delete))/i.test(
        code,
      );
    if (hasApiEndpoints && !hasValidation) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.High,
        title: 'API endpoints without schema validation library',
        description:
          'API endpoints exist but no validation library (Zod, Yup, Joi, etc.) is referenced. All input from clients is untrusted.',
        remediation:
          'Add Zod (recommended for TypeScript) and validate every request body, query param, and path param.',
        category: 'validation-input',
      });
    }
  }

  // Skill 4: Check for unbounded queries
  if (activeSkills.has(4)) {
    const hasDbQueries = /\.findMany\s*\(|\.select\s*\(|\.from\s*\(/i.test(code);
    const hasPagination = /(?:take|limit|offset|skip|cursor|page)/i.test(code);
    if (hasDbQueries && !hasPagination) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.Medium,
        title: 'Database queries without pagination',
        description:
          'Database queries (findMany/select) exist without pagination parameters. Unbounded queries can exhaust memory and DB resources.',
        remediation: 'Add take/limit with a server-side cap (e.g., max 100) to all list queries.',
        category: 'search-query',
      });
    }
  }

  // Skill 5: Check for admin route protection
  if (activeSkills.has(5)) {
    const hasAdminRoutes = /(?:\/admin|\/dashboard\/admin|admin\.)/i.test(code);
    const hasRoleCheck = /(?:role\s*===?\s*['"]admin|isAdmin|requireAdmin|adminOnly|checkRole)/i.test(code);
    if (hasAdminRoutes && !hasRoleCheck) {
      findings.push({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.Critical,
        title: 'Admin routes without role verification',
        description:
          'Admin routes exist but no server-side role check pattern is detected. Any authenticated user may access admin functionality.',
        remediation:
          'Add server-side middleware that checks `role === "admin"` from the session/JWT on all admin routes.',
        category: 'admin-workflow',
      });
    }
  }

  return findings;
}

// ── Layer 3: LLM-Based Deep Analysis ─────────────────────────────────────────

async function runLlmAnalysis(code: string, policy: AppSecurityPolicy, nextId: () => string): Promise<Finding[]> {
  const activeSkills = policy.skills ?? [1, 2, 3, 4, 5];
  const skillDescriptions = activeSkills
    .map((s) => {
      switch (s) {
        case 1:
          return 'Auth + Abuse: session logic, rate limiting, CAPTCHA, brute-force prevention, user enumeration';
        case 2:
          return 'Authorization + RLS: user data scoping, row-level security, admin route protection, IDOR';
        case 3:
          return 'Validation + Input Safety: server-side validation on writes, mass assignment, XSS, unsafe rendering';
        case 4:
          return 'Search + Query Safety: pagination caps, sort allowlists, SQL injection, query parameterization';
        case 5:
          return 'Admin Workflow: privilege escalation, server-side role checks, destructive action guards, audit trails';
        default:
          return '';
      }
    })
    .filter(Boolean);

  const suppressionNote =
    policy.suppressedFindings.length > 0
      ? `\nSUPPRESSED findings (do NOT flag): ${policy.suppressedFindings.join(', ')}`
      : '';

  const prompt = `You are an application security auditor specializing in vibe-coded / AI-generated web applications. Analyze the following code for application-level security issues.

## Audit Skills to Check
${skillDescriptions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Instructions
1. For each skill area, check the code for the described vulnerabilities
2. Focus on BUSINESS LOGIC and APPLICATION-LEVEL issues, not generic security (those are covered by a separate scanner)
3. Check for: missing auth checks, broken access control, IDOR, mass assignment, unbounded queries, privilege escalation
4. Return findings as a JSON array with fields: severity, cweId, title, description, filePath, lineRange, remediation, category
5. Category must be one of: auth-abuse, authorization-rls, validation-input, search-query, admin-workflow
6. If no issues found, return []
7. Be precise - flag only clear issues, not speculative ones
${suppressionNote}

## Code to Analyze
${code.length > 30000 ? `**Code truncated from ${code.length.toLocaleString()} to 30,000 chars.**\n` : ''}
\`\`\`
${code.slice(0, 30000)}
\`\`\`

Return ONLY a valid JSON array. No markdown, no explanation.`;

  try {
    const client = llmFactory.getClient(LLMProvider.Claude);
    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    tokenTracker.record('post-rc', 'postrc_scan_app_security', response.tokensUsed, response.provider, {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });
    recordCost({
      pipelineId: 'postrc-session',
      domain: 'post-rc',
      tool: 'postrc_scan_app_security',
      provider: response.provider,
      model: client.getModel(),
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? response.tokensUsed,
    });
    recordModelPerformance({
      provider: response.provider,
      model: client.getModel(),
      taskType: 'postrc-app-security-scan',
      tokensUsed: response.tokensUsed,
      success: true,
    });

    return parseLlmFindings(response.content, policy, nextId);
  } catch (err) {
    console.error('[post-rc] App security LLM scan error:', err);
    return [
      {
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: Severity.Info,
        title: 'App security LLM scan failed',
        description: `Error: ${(err as Error).message}`,
        remediation: 'Check API key and try again.',
        category: 'error',
      },
    ];
  }
}

function parseLlmFindings(text: string, policy: AppSecurityPolicy, nextId: () => string): Finding[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

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
      .filter((f) => !policy.suppressedFindings.includes(f.cweId || ''))
      .map((f) => ({
        id: nextId(),
        module: ValidationModule.AppSecurity,
        severity: mapSeverity(f.severity || 'medium'),
        title: f.title || 'Unknown finding',
        description: f.description || '',
        cweId: f.cweId,
        filePath: f.filePath,
        lineRange: f.lineRange,
        remediation: f.remediation || 'Review and fix the identified pattern.',
        category: f.category || 'app-security',
      }));
  } catch {
    return [];
  }
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

// ── Code Loading (reuses same priority logic as security scanner) ─────────────

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
  '.sql',
]);

const MAX_CODE_SIZE = 200_000;

async function loadProjectCode(projectPath: string): Promise<string | null> {
  const contents: string[] = [];
  let totalSize = 0;

  const sourceDirs = ['src', 'app', 'lib', 'pages', 'components', 'api', 'server', 'supabase/migrations'];
  for (const dir of sourceDirs) {
    if (totalSize >= MAX_CODE_SIZE) break;
    const fullDir = join(projectPath, dir);
    if (existsSync(fullDir)) {
      await collectSourceFiles(fullDir, contents, { totalSize, maxSize: MAX_CODE_SIZE });
      totalSize = contents.reduce((sum, c) => sum + c.length, 0);
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
    const { readdir: rd, stat: st, readFile: rf } = await import('fs/promises');
    const entries = await rd(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (budget.totalSize >= budget.maxSize) break;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor'].includes(entry.name)) continue;
        await collectSourceFiles(fullPath, contents, budget, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (!CODE_EXTENSIONS.has(ext)) continue;

      try {
        const fileStat = await st(fullPath);
        if (fileStat.size > 50000) continue;
        const content = await rf(fullPath, 'utf-8');
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
