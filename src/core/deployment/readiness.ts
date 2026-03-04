/**
 * Deployment Readiness Checker
 *
 * Evaluates whether a project is ready for deployment by checking:
 * - Required files exist (package.json, .env.example, .gitignore)
 * - Build/start scripts are defined
 * - Security scan passed
 * - Environment variables are documented
 * - No secrets committed to source
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export type ReadinessStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  name: string;
  status: ReadinessStatus;
  message: string;
  /** Optional fix instructions. */
  fix?: string;
}

export interface ReadinessReport {
  projectPath: string;
  timestamp: string;
  checks: ReadinessCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  ready: boolean;
}

// ── Secret patterns ─────────────────────────────────────────────────────────

const SECRET_FILE_PATTERNS = ['.env', '.env.local', '.env.production', 'credentials.json', 'service-account.json'];

const SECRET_CONTENT_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}/i,
  /(?:secret|password|passwd|token)\s*[:=]\s*["']?[^\s"']{8,}/i,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
];

// ── Checker ─────────────────────────────────────────────────────────────────

export function checkDeployReadiness(projectPath: string): ReadinessReport {
  const checks: ReadinessCheck[] = [];

  // 1. Package.json exists and has required fields
  checks.push(checkPackageJson(projectPath));

  // 2. Build script works
  checks.push(checkBuildScript(projectPath));

  // 3. Start script exists
  checks.push(checkStartScript(projectPath));

  // 4. .gitignore exists and covers common patterns
  checks.push(checkGitignore(projectPath));

  // 5. Environment variables documented
  checks.push(checkEnvExample(projectPath));

  // 6. No secrets in source
  checks.push(checkNoSecrets(projectPath));

  // 7. Post-RC security scan status
  checks.push(checkSecurityScan(projectPath));

  // 8. README exists
  checks.push(checkReadme(projectPath));

  // 9. License file
  checks.push(checkLicense(projectPath));

  // 10. Node version specified
  checks.push(checkNodeVersion(projectPath));

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;

  return {
    projectPath,
    timestamp: new Date().toISOString(),
    checks,
    passCount,
    warnCount,
    failCount,
    ready: failCount === 0,
  };
}

// ── Individual Checks ───────────────────────────────────────────────────────

function checkPackageJson(projectPath: string): ReadinessCheck {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      name: 'package.json',
      status: 'fail',
      message: 'package.json not found',
      fix: 'Run "npm init" to create a package.json',
    };
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const missing: string[] = [];
    if (!pkg.name) missing.push('name');
    if (!pkg.version) missing.push('version');

    if (missing.length > 0) {
      return {
        name: 'package.json',
        status: 'warn',
        message: `Missing fields: ${missing.join(', ')}`,
        fix: `Add ${missing.join(' and ')} to package.json`,
      };
    }

    return { name: 'package.json', status: 'pass', message: 'Valid package.json with required fields' };
  } catch {
    return { name: 'package.json', status: 'fail', message: 'package.json is not valid JSON' };
  }
}

function checkBuildScript(projectPath: string): ReadinessCheck {
  const pkg = readPkg(projectPath);
  if (!pkg) {
    return { name: 'build script', status: 'fail', message: 'Cannot read package.json' };
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (scripts?.build) {
    return { name: 'build script', status: 'pass', message: `Build script: "${scripts.build}"` };
  }

  return {
    name: 'build script',
    status: 'warn',
    message: 'No build script defined',
    fix: 'Add a "build" script to package.json scripts',
  };
}

function checkStartScript(projectPath: string): ReadinessCheck {
  const pkg = readPkg(projectPath);
  if (!pkg) {
    return { name: 'start script', status: 'fail', message: 'Cannot read package.json' };
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (scripts?.start) {
    return { name: 'start script', status: 'pass', message: `Start script: "${scripts.start}"` };
  }
  if (pkg.main || pkg.bin) {
    return { name: 'start script', status: 'pass', message: 'Entry point defined via main/bin' };
  }

  return {
    name: 'start script',
    status: 'warn',
    message: 'No start script or entry point defined',
    fix: 'Add a "start" script to package.json',
  };
}

function checkGitignore(projectPath: string): ReadinessCheck {
  const gitignorePath = path.join(projectPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return {
      name: '.gitignore',
      status: 'fail',
      message: '.gitignore not found',
      fix: 'Create a .gitignore file with at least: node_modules/, .env, dist/',
    };
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const critical = ['node_modules', '.env'];
  const missing = critical.filter((p) => !content.includes(p));

  if (missing.length > 0) {
    return {
      name: '.gitignore',
      status: 'warn',
      message: `Missing patterns: ${missing.join(', ')}`,
      fix: `Add ${missing.join(' and ')} to .gitignore`,
    };
  }

  return { name: '.gitignore', status: 'pass', message: '.gitignore covers critical patterns' };
}

function checkEnvExample(projectPath: string): ReadinessCheck {
  const envExamplePath = path.join(projectPath, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    return {
      name: 'env documentation',
      status: 'pass',
      message: '.env.example exists for environment variable documentation',
    };
  }

  // Check if .env exists but no .env.example
  const envPath = path.join(projectPath, '.env');
  if (fs.existsSync(envPath)) {
    return {
      name: 'env documentation',
      status: 'warn',
      message: '.env exists but .env.example is missing',
      fix: 'Create .env.example with placeholder values to document required environment variables',
    };
  }

  return {
    name: 'env documentation',
    status: 'pass',
    message: 'No environment variables detected',
  };
}

function checkNoSecrets(projectPath: string): ReadinessCheck {
  const issues: string[] = [];

  // Check for secret files that shouldn't be committed
  for (const pattern of SECRET_FILE_PATTERNS) {
    const filePath = path.join(projectPath, pattern);
    if (fs.existsSync(filePath)) {
      // Check if it's in .gitignore
      const gitignorePath = path.join(projectPath, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes(pattern) && !gitignore.includes(pattern.split('.').pop()!)) {
          issues.push(`${pattern} exists and may not be in .gitignore`);
        }
      } else {
        issues.push(`${pattern} exists with no .gitignore`);
      }
    }
  }

  // Spot-check source files for hardcoded secrets (sample first 20 source files)
  const sourceFiles = findSourceFiles(projectPath, 20);
  for (const filePath of sourceFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of SECRET_CONTENT_PATTERNS) {
        if (pattern.test(content)) {
          const relative = path.relative(projectPath, filePath);
          issues.push(`Potential secret in ${relative}`);
          break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (issues.length > 0) {
    return {
      name: 'no secrets',
      status: 'fail',
      message: issues.join('; '),
      fix: 'Move secrets to environment variables and add files to .gitignore',
    };
  }

  return { name: 'no secrets', status: 'pass', message: 'No committed secrets detected' };
}

function checkSecurityScan(projectPath: string): ReadinessCheck {
  // Look for Post-RC scan results
  const postRcDir = path.join(projectPath, 'post-rc');
  if (!fs.existsSync(postRcDir)) {
    return {
      name: 'security scan',
      status: 'warn',
      message: 'No Post-RC security scan results found',
      fix: 'Run postrc_scan to perform a security audit before deployment',
    };
  }

  // Look for scan state file
  const stateFile = path.join(postRcDir, 'POST-RC-STATE.md');
  if (fs.existsSync(stateFile)) {
    const content = fs.readFileSync(stateFile, 'utf-8');
    if (content.includes('"criticalCount":0') || content.includes('"critical":0')) {
      return { name: 'security scan', status: 'pass', message: 'Security scan passed with no critical findings' };
    }
    if (content.includes('critical')) {
      return {
        name: 'security scan',
        status: 'fail',
        message: 'Security scan has unresolved critical findings',
        fix: 'Address critical findings in the Post-RC scan or add overrides with justification',
      };
    }
  }

  return {
    name: 'security scan',
    status: 'warn',
    message: 'Security scan status could not be determined',
    fix: 'Run postrc_scan and review results',
  };
}

function checkReadme(projectPath: string): ReadinessCheck {
  const candidates = ['README.md', 'readme.md', 'README', 'README.txt'];
  for (const name of candidates) {
    if (fs.existsSync(path.join(projectPath, name))) {
      return { name: 'README', status: 'pass', message: `${name} exists` };
    }
  }

  return {
    name: 'README',
    status: 'warn',
    message: 'No README file found',
    fix: 'Create a README.md with project description, setup instructions, and usage',
  };
}

function checkLicense(projectPath: string): ReadinessCheck {
  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE'];
  for (const name of candidates) {
    if (fs.existsSync(path.join(projectPath, name))) {
      return { name: 'license', status: 'pass', message: `${name} exists` };
    }
  }

  // Check package.json license field
  const pkg = readPkg(projectPath);
  if (pkg?.license) {
    return { name: 'license', status: 'pass', message: `License specified in package.json: ${pkg.license}` };
  }

  return {
    name: 'license',
    status: 'warn',
    message: 'No license file or field found',
    fix: 'Add a LICENSE file or set the "license" field in package.json',
  };
}

function checkNodeVersion(projectPath: string): ReadinessCheck {
  const pkg = readPkg(projectPath);
  const engines = pkg?.engines as Record<string, string> | undefined;
  if (engines?.node) {
    return { name: 'node version', status: 'pass', message: `Engines.node: ${engines.node}` };
  }

  // Check for .nvmrc or .node-version
  for (const name of ['.nvmrc', '.node-version']) {
    if (fs.existsSync(path.join(projectPath, name))) {
      return { name: 'node version', status: 'pass', message: `${name} exists` };
    }
  }

  return {
    name: 'node version',
    status: 'warn',
    message: 'No Node.js version constraint specified',
    fix: 'Add "engines": { "node": ">=18.0.0" } to package.json',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readPkg(projectPath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function findSourceFiles(projectPath: string, max: number): string[] {
  const files: string[] = [];
  const exts = new Set(['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs']);
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

  function walk(dir: string): void {
    if (files.length >= max) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= max) return;
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (exts.has(path.extname(entry.name))) {
        files.push(full);
      }
    }
  }

  walk(projectPath);
  return files;
}

// ── Report Formatting ───────────────────────────────────────────────────────

export function formatReadinessReport(report: ReadinessReport): string {
  const lines: string[] = [
    '# Deployment Readiness Report',
    '',
    `**Project:** ${report.projectPath}`,
    `**Date:** ${report.timestamp}`,
    `**Result:** ${report.ready ? 'READY' : 'NOT READY'}`,
    '',
    `| Status | Count |`,
    `|--------|-------|`,
    `| Pass   | ${report.passCount} |`,
    `| Warn   | ${report.warnCount} |`,
    `| Fail   | ${report.failCount} |`,
    '',
    '## Checks',
    '',
  ];

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '[PASS]' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
    lines.push(`### ${icon} ${check.name}`);
    lines.push(check.message);
    if (check.fix) {
      lines.push(`**Fix:** ${check.fix}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
