/**
 * Edge Case Analysis Module -- Multi-layer edge case detection.
 *
 * Layer 1: Deterministic static pattern matching (always runs)
 * Layer 2: Structural PRD/task gap analysis (always runs if artifacts exist)
 * Layer 3: LLM-based edge case matrix generation (runs if API key configured)
 *
 * Pro tier feature. Finding ID prefix: ECX-
 */

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import type { Finding, EdgeCasePolicy, EdgeCaseCategory } from '../../types.js';
import { ValidationModule, Severity } from '../../types.js';
import { hasAnthropicKey } from '../../../../shared/config.js';
import { llmFactory } from '../../../../shared/llm/factory.js';
import { LLMProvider } from '../../../../shared/types.js';
import { tokenTracker } from '../../../../shared/token-tracker.js';
import { recordCost } from '../../../../shared/cost-tracker.js';

// Source file extensions to scan (same as security scanner)
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

const ALL_EDGE_CASE_CATEGORIES: EdgeCaseCategory[] = [
  'input-boundary',
  'error-state',
  'concurrency',
  'data-integrity',
  'integration',
  'state-transition',
  'performance-edge',
];

// ── Pattern Rules ──────────────────────────────────────────────────────────

interface EdgeCasePatternRule {
  pattern: RegExp;
  title: string;
  severity: Severity;
  category: EdgeCaseCategory;
  remediation: string;
}

const EDGE_CASE_PATTERNS: EdgeCasePatternRule[] = [
  // input-boundary
  {
    pattern: /parseInt\s*\([^,)]+\)/g,
    title: 'parseInt without radix parameter',
    severity: Severity.Low,
    category: 'input-boundary',
    remediation: 'Use parseInt(value, 10) to prevent unexpected octal/hex parsing.',
  },
  // error-state
  {
    pattern: /\.then\s*\([^)]*\)(?!\s*\.catch)/g,
    title: 'Promise .then() without .catch()',
    severity: Severity.High,
    category: 'error-state',
    remediation: 'Add .catch() or use try/catch in an async function to handle promise rejections.',
  },
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    title: 'Empty catch block -- exception swallowed',
    severity: Severity.Medium,
    category: 'error-state',
    remediation: 'Log or re-throw caught exceptions. Empty catch blocks hide bugs.',
  },
  {
    pattern: /finally\s*\{[^}]*throw\b/g,
    title: 'throw inside finally block',
    severity: Severity.Medium,
    category: 'error-state',
    remediation: 'Avoid throwing inside finally. It replaces the original exception.',
  },
  // concurrency
  {
    pattern: /setTimeout\s*\([^)]+\)/g,
    title: 'setTimeout without cleanup reference',
    severity: Severity.Low,
    category: 'concurrency',
    remediation: 'Store timer ID and clear on cleanup/unmount to avoid stale callbacks.',
  },
  // data-integrity
  {
    pattern: /JSON\.parse\s*\([^)]*\)/g,
    title: 'JSON.parse without error handling',
    severity: Severity.High,
    category: 'data-integrity',
    remediation: 'Wrap JSON.parse in try/catch. Malformed input throws SyntaxError.',
  },
  {
    pattern: /(?:===|==)\s*\d+\.\d+|\d+\.\d+\s*(?:===|==)/g,
    title: 'Direct floating-point equality comparison',
    severity: Severity.Medium,
    category: 'data-integrity',
    remediation: 'Use Math.abs(a - b) < epsilon for floating-point comparisons.',
  },
  // integration
  {
    pattern: /(?:timeout|TIMEOUT)\s*[:=]\s*\d{4,}/g,
    title: 'Hardcoded timeout value',
    severity: Severity.Low,
    category: 'integration',
    remediation: 'Make timeouts configurable. Long timeouts can mask integration failures.',
  },
  // state-transition
  {
    pattern: /switch\s*\([^)]*\)\s*\{(?:(?!default)[\s\S]){20,}\}/g,
    title: 'switch statement without default case',
    severity: Severity.Low,
    category: 'state-transition',
    remediation: 'Add a default case to handle unexpected values.',
  },
  // performance-edge
  {
    pattern: /readFileSync|writeFileSync|appendFileSync/g,
    title: 'Synchronous file I/O blocks event loop',
    severity: Severity.High,
    category: 'performance-edge',
    remediation: 'Replace with async equivalents (readFile/writeFile from fs/promises).',
  },
  {
    pattern: /new RegExp\s*\([^)]*\)/g,
    title: 'Dynamic RegExp in potential hot path',
    severity: Severity.Low,
    category: 'performance-edge',
    remediation: 'Pre-compile regex patterns outside loops and hot paths.',
  },
  // input-boundary
  {
    pattern: /\.length\s*(?:===|!==|>|<|>=|<=)\s*0/g,
    title: 'Array/string length check without undefined guard',
    severity: Severity.Low,
    category: 'input-boundary',
    remediation: 'Verify the value is defined before accessing .length.',
  },
  // error-state
  {
    pattern: /process\.exit\s*\(\s*[^0)]/g,
    title: 'Non-zero process.exit in application code',
    severity: Severity.Medium,
    category: 'error-state',
    remediation: 'Use proper error propagation instead of abrupt process termination.',
  },
  // concurrency
  {
    pattern: /setInterval\s*\([^)]+\)/g,
    title: 'setInterval without cleanup',
    severity: Severity.Medium,
    category: 'concurrency',
    remediation: 'Store interval ID and clearInterval on shutdown to prevent memory leaks.',
  },
  // data-integrity
  {
    pattern: /toFixed\s*\(\s*\d+\s*\)/g,
    title: 'toFixed() returns string, not number',
    severity: Severity.Low,
    category: 'data-integrity',
    remediation: 'Wrap toFixed() with Number() or parseFloat() if numeric result is needed.',
  },
];

// ── Main Entry Point ──────────────────────────────────────────────────────

export async function runEdgeCaseModule(
  projectPath: string,
  codeContext: string | undefined,
  policy: EdgeCasePolicy,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];
  const activeCategories = policy.categories ?? ALL_EDGE_CASE_CATEGORIES;

  // Load code (same priority as security scanner)
  const code = codeContext || (await loadProjectCode(projectPath));

  // Layer 1: Static pattern matching
  if (code) {
    const staticFindings = runStaticEdgeCaseScan(code, activeCategories);
    allFindings.push(...staticFindings);
  }

  // Layer 2: Structural PRD/task gap analysis
  const structuralFindings = await runStructuralAnalysis(projectPath, activeCategories);
  allFindings.push(...structuralFindings);

  // Layer 3: LLM edge case matrix
  if (code && hasAnthropicKey) {
    const prdContent = await loadPrdContent(projectPath);
    const llmFindings = await runLlmEdgeCaseScan(code, prdContent, activeCategories);

    // De-duplicate against static findings
    for (const lf of llmFindings) {
      const isDuplicate = allFindings.some((af) => af.category === lf.category && af.title === lf.title);
      if (!isDuplicate) {
        allFindings.push(lf);
      }
    }
  } else if (!code) {
    allFindings.push({
      id: 'ECX-NOCODE',
      module: ValidationModule.EdgeCase,
      severity: Severity.Info,
      title: 'No code context found for edge case analysis',
      description: 'No code was provided and no source files found. Pass code_context or run rc_forge_task first.',
      remediation: 'Run postrc_scan with code_context parameter.',
      category: 'configuration',
    });
  } else {
    allFindings.push({
      id: 'ECX-PASSTHROUGH',
      module: ValidationModule.EdgeCase,
      severity: Severity.Info,
      title: 'LLM edge case matrix skipped -- no API key',
      description:
        'Static pattern scan ran, but LLM edge case matrix was skipped. Configure ANTHROPIC_API_KEY for full analysis.',
      remediation: 'Set ANTHROPIC_API_KEY in .env for full edge case analysis.',
      category: 'passthrough',
    });
  }

  // Filter suppressed findings
  const suppressedSet = new Set(policy.suppressedFindings);
  const active = allFindings.filter((f) => !suppressedSet.has(f.id));

  // Re-number with ECX- prefix
  let idx = 1;
  for (const f of active) {
    if (!f.id.startsWith('ECX-NOCODE') && !f.id.startsWith('ECX-PASSTHROUGH') && !f.id.startsWith('ECX-TRUNC')) {
      f.id = `ECX-${String(idx++).padStart(3, '0')}`;
    }
  }

  return active;
}

// ── Layer 1: Static Pattern Scan ──────────────────────────────────────────

function runStaticEdgeCaseScan(code: string, activeCategories: EdgeCaseCategory[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of EDGE_CASE_PATTERNS) {
    if (!activeCategories.includes(rule.category)) continue;

    // Reset regex state
    rule.pattern.lastIndex = 0;
    const matches: string[] = [];
    let match;
    while ((match = rule.pattern.exec(code)) !== null) {
      matches.push(match[0].slice(0, 80));
      if (matches.length >= 5) break;
    }

    if (matches.length > 0) {
      findings.push({
        id: 'ECX-STATIC',
        module: ValidationModule.EdgeCase,
        severity: rule.severity,
        title: rule.title,
        description: `Found ${matches.length} instance(s). Category: ${rule.category}\nExamples: ${matches.map((m) => `"${m}"`).join(', ')}`,
        remediation: rule.remediation,
        category: rule.category,
      });
    }
  }

  return findings;
}

// ── Layer 2: Structural Analysis ──────────────────────────────────────────

async function runStructuralAnalysis(projectPath: string, activeCategories: EdgeCaseCategory[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Check PRD for integration mentions without error handling tasks
  const prdContent = await loadPrdContent(projectPath);
  const taskContent = await loadTaskContent(projectPath);

  if (!prdContent && !taskContent) return findings;

  const prd = prdContent || '';
  const tasks = taskContent || '';

  // Check: PRD mentions async/concurrent but no error-state tasks
  if (activeCategories.includes('error-state')) {
    const hasAsyncMentions = /async|concurrent|parallel|queue|worker|background/i.test(prd);
    const hasErrorHandlingTasks = /error.?handl|retry|fallback|circuit.?break|timeout.?handl/i.test(tasks);
    if (hasAsyncMentions && !hasErrorHandlingTasks) {
      findings.push({
        id: 'ECX-STRUCT',
        module: ValidationModule.EdgeCase,
        severity: Severity.Medium,
        title: 'PRD references async operations but no error handling tasks',
        description:
          'The PRD mentions async/concurrent operations but the task list has no explicit error handling, retry, or fallback tasks.',
        remediation: 'Add tasks for error handling, retry logic, and fallback behavior for async operations.',
        category: 'error-state',
      });
    }
  }

  // Check: Integration requirements without retry/timeout tasks
  if (activeCategories.includes('integration')) {
    const hasIntegrationMentions = /integrat|external.?api|third.?party|webhook|oauth/i.test(prd);
    const hasRetryTasks = /retry|backoff|timeout|circuit|resilien/i.test(tasks);
    if (hasIntegrationMentions && !hasRetryTasks) {
      findings.push({
        id: 'ECX-STRUCT',
        module: ValidationModule.EdgeCase,
        severity: Severity.Medium,
        title: 'Integration requirements without retry/resilience tasks',
        description:
          'PRD references external integrations but task list lacks retry, timeout, or circuit breaker tasks.',
        remediation:
          'Add tasks for retry with exponential backoff, timeout configuration, and circuit breaker patterns.',
        category: 'integration',
      });
    }
  }

  // Check: Database operations without transaction/rollback mentions
  if (activeCategories.includes('data-integrity')) {
    const hasDbMentions = /database|sql|query|insert|update|delete|migration|schema/i.test(prd);
    const hasTransactionTasks = /transaction|rollback|atomic|consistency|constraint/i.test(tasks);
    if (hasDbMentions && !hasTransactionTasks) {
      findings.push({
        id: 'ECX-STRUCT',
        module: ValidationModule.EdgeCase,
        severity: Severity.Medium,
        title: 'Database operations without transaction safety tasks',
        description:
          'PRD references database operations but task list lacks transaction, rollback, or data consistency tasks.',
        remediation: 'Add tasks for transaction boundaries, rollback handling, and data consistency checks.',
        category: 'data-integrity',
      });
    }
  }

  return findings;
}

// ── Layer 3: LLM Edge Case Matrix ─────────────────────────────────────────

async function runLlmEdgeCaseScan(
  code: string,
  prdContent: string | null,
  activeCategories: EdgeCaseCategory[],
): Promise<Finding[]> {
  try {
    const prompt = buildEdgeCasePrompt(code, prdContent || '', activeCategories);

    const client = llmFactory.getClient(LLMProvider.Claude);
    const response = await client.chatWithRetry({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    tokenTracker.record('post-rc', 'postrc_scan_edge_case', response.tokensUsed, response.provider, { inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    recordCost({
      pipelineId: 'postrc-session',
      domain: 'post-rc',
      tool: 'postrc_scan_edge_case',
      provider: response.provider,
      model: client.getModel(),
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? response.tokensUsed,
    });

    return parseEdgeCaseFindings(response.content);
  } catch (err) {
    console.error('[post-rc] Edge case LLM scan error:', err);
    return [
      {
        id: 'ECX-ERR',
        module: ValidationModule.EdgeCase,
        severity: Severity.Info,
        title: 'Edge case LLM analysis failed',
        description: `Error: ${(err as Error).message}`,
        remediation: 'Check API key and try again.',
        category: 'error',
      },
    ];
  }
}

function buildEdgeCasePrompt(code: string, prdContent: string, categories: EdgeCaseCategory[]): string {
  const codeSlice = code.slice(0, 20000);
  const prdSlice = prdContent.slice(0, 10000);

  return `You are an adversarial QA engineer reviewing code and product requirements for edge cases.

## Task
Produce a comprehensive edge case matrix. For each category listed, identify specific scenarios that could cause failures, data corruption, or undefined behavior.

## Categories to Analyze
${categories.join(', ')}

## Category Definitions
- input-boundary: null inputs, empty strings, max-length values, type coercion edge cases
- error-state: network failure, DB timeout, disk full, API 429/503, deserialization errors
- concurrency: race conditions, double-submit, session expiry mid-operation
- data-integrity: rounding errors, encoding mismatches, duplicate key conflicts
- integration: external API timeout, auth token expiry, schema version mismatch
- state-transition: invalid state machine transitions, orphaned records after partial failure
- performance-edge: large payloads, high cardinality queries, N+1 query patterns

${prdSlice ? `## Product Requirements\n${prdSlice}\n` : ''}
## Code
\`\`\`
${codeSlice}
\`\`\`

## Output Format
Return a JSON array. Each element:
{
  "title": "one-line edge case name",
  "severity": "critical" | "high" | "medium" | "low",
  "category": "<one of the 7 categories>",
  "description": "what happens, why it matters",
  "remediation": "specific fix or test to add"
}

Return ONLY valid JSON array. No markdown, no explanation.`;
}

function parseEdgeCaseFindings(text: string): Finding[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[post-rc] No JSON array found in edge case LLM response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      severity?: string;
      title?: string;
      description?: string;
      remediation?: string;
      category?: string;
    }>;

    return parsed
      .filter((f) => f.title && f.description)
      .map((f) => ({
        id: 'ECX-LLM',
        module: ValidationModule.EdgeCase,
        severity: mapSeverity(f.severity || 'medium'),
        title: f.title || 'Unknown edge case',
        description: f.description || '',
        remediation: f.remediation || 'Review and address this edge case.',
        category: f.category || 'error-state',
      }));
  } catch (err) {
    console.error('[post-rc] Failed to parse edge case findings:', err);
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

// ── File Loading Utilities ────────────────────────────────────────────────

async function loadPrdContent(projectPath: string): Promise<string | null> {
  const prdDirs = [join(projectPath, 'rc-method', 'prds'), join(projectPath, 'pre-rc-research')];

  for (const dir of prdDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = await readdir(dir);
      const prdFiles = files.filter((f) => f.endsWith('.md'));
      if (prdFiles.length === 0) continue;

      const contents: string[] = [];
      for (const file of prdFiles.slice(0, 3)) {
        const content = await readFile(join(dir, file), 'utf-8');
        contents.push(content);
      }
      return contents.join('\n\n---\n\n');
    } catch {
      continue;
    }
  }
  return null;
}

async function loadTaskContent(projectPath: string): Promise<string | null> {
  const taskDir = join(projectPath, 'rc-method', 'tasks');
  if (!existsSync(taskDir)) return null;

  try {
    const files = await readdir(taskDir);
    const taskFiles = files.filter((f) => f.endsWith('.md'));
    if (taskFiles.length === 0) return null;

    const contents: string[] = [];
    for (const file of taskFiles.slice(0, 5)) {
      const content = await readFile(join(taskDir, file), 'utf-8');
      contents.push(content);
    }
    return contents.join('\n\n');
  } catch {
    return null;
  }
}

async function loadProjectCode(projectPath: string): Promise<string | null> {
  const contents: string[] = [];
  let totalSize = 0;

  // Priority 1: Forge output
  const forgeDir = join(projectPath, 'rc-method', 'forge');
  if (existsSync(forgeDir)) {
    await collectSourceFiles(forgeDir, contents, { totalSize, maxSize: MAX_CODE_SIZE });
    totalSize = contents.reduce((sum, c) => sum + c.length, 0);
  }

  // Priority 2: Project source directories
  const sourceDirs = ['src', 'app', 'lib', 'pages', 'components', 'api', 'server'];
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
    const entries = await readdir(dir, { withFileTypes: true });
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
        const { stat: fsStat } = await import('fs/promises');
        const fileStat = await fsStat(fullPath);
        if (fileStat.size > 50000) continue;
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
