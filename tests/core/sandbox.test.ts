/**
 * Tests for Sandbox -- Path validation, write restrictions, input limits.
 *
 * Platform policy (ADR-3, 2026-08-17): fixtures are derived from the running
 * platform (mkdtemp project roots, env-derived blocked paths), and assertions
 * key on machine-readable outcomes (valid + reason code), never on error
 * message phrasing. This suite must be green on Windows and POSIX alike;
 * skipping a platform is not an accepted fix.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { PathValidator } from '../../src/core/sandbox/path-validator.js';
import { checkInputSize, checkInputs, DEFAULT_LIMITS } from '../../src/core/sandbox/input-limits.js';
import { guardedTool } from '../../src/shared/tool-guard.js';
import type { Domain } from '../../src/core/sandbox/path-validator.js';
import type { InputLimitConfig } from '../../src/core/sandbox/input-limits.js';

const IS_WIN = process.platform === 'win32';
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

/** A real system path that must be denied with reason 'blocked' on this platform. */
const SYSTEM_BLOCKED_FILE = IS_WIN
  ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'config', 'SAM')
  : '/etc/passwd';

// ── PathValidator ───────────────────────────────────────────────────────────

describe('PathValidator', () => {
  let projectRoot: string;
  let validator: PathValidator;

  beforeAll(() => {
    // realpathSync so resolvedPath comparisons survive tmpdir symlinks (macOS
    // /var -> /private/var) and Windows casing normalization.
    projectRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'sandbox-')));
    validator = new PathValidator(projectRoot);
  });

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('resolves and stores the project root', () => {
      expect(new PathValidator(projectRoot).getProjectRoot()).toBe(path.resolve(projectRoot));
    });

    it('resolves relative project root to absolute', () => {
      expect(path.isAbsolute(new PathValidator('relative/path').getProjectRoot())).toBe(true);
    });
  });

  // ── Read Validation ─────────────────────────────────────────────────────

  describe('validateRead', () => {
    it('allows reading files inside project root', () => {
      const result = validator.validateRead(path.join(projectRoot, 'src', 'index.ts'));
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(projectRoot, 'src', 'index.ts'));
    });

    it('allows reading the project root itself', () => {
      const result = validator.validateRead(projectRoot);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(projectRoot);
    });

    it('allows reading with relative paths', () => {
      const result = validator.validateRead(path.join('src', 'index.ts'));
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(projectRoot, 'src', 'index.ts'));
    });

    it('denies reading outside project root with reason outside-root', () => {
      const outside = path.join(path.dirname(projectRoot), 'other-project', 'secret.txt');
      const result = validator.validateRead(outside);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('outside-root');
    });

    it('denies directory traversal via ..', () => {
      const result = validator.validateRead(path.join(projectRoot, '..', '..', 'etc', 'passwd'));
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined(); // outside-root or blocked, both are denials
    });

    it('denies the platform system path with reason blocked', () => {
      const result = validator.validateRead(SYSTEM_BLOCKED_FILE);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('blocked');
    });

    it('denies home credential stores with reason blocked', () => {
      expect(HOME).toBeTruthy();
      for (const p of [
        path.join(HOME, '.ssh', 'id_rsa'),
        path.join(HOME, '.aws', 'credentials'),
        path.join(HOME, '.gnupg', 'secring.gpg'),
        path.join(HOME, '.env'),
      ]) {
        const result = validator.validateRead(p);
        expect(result.valid, p).toBe(false);
        expect(result.reason, p).toBe('blocked');
      }
    });

    it('canonicalizes paths with . segments', () => {
      const result = validator.validateRead(path.join(projectRoot, '.', 'src', '.', 'index.ts'));
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(projectRoot, 'src', 'index.ts'));
    });

    it('rejects paths that resolve to just above project root', () => {
      const result = validator.validateRead(path.join(projectRoot, '..'));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('outside-root');
    });
  });

  // ── Write Validation ────────────────────────────────────────────────────

  describe('validateWrite', () => {
    const allowedByDomain: Array<[Domain, string]> = [
      ['pre-rc', 'pre-rc-research'],
      ['rc', 'rc-method'],
      ['post-rc', 'post-rc'],
      ['traceability', 'rc-traceability'],
      ['runtime', '.rc-engine'],
    ];

    it.each(allowedByDomain)('allows %s domain to write to %s/', (domain, dir) => {
      const result = validator.validateWrite(path.join(projectRoot, dir, 'file.md'), domain);
      expect(result.valid).toBe(true);
    });

    it('denies cross-domain writes with reason domain-write', () => {
      const cases: Array<[Domain, string]> = [
        ['pre-rc', 'rc-method'],
        ['rc', 'pre-rc-research'],
        ['post-rc', 'rc-method'],
      ];
      for (const [domain, dir] of cases) {
        const result = validator.validateWrite(path.join(projectRoot, dir, 'file.md'), domain);
        expect(result.valid, `${domain} -> ${dir}`).toBe(false);
        expect(result.reason, `${domain} -> ${dir}`).toBe('domain-write');
      }
    });

    it('denies writing to project root directly with reason domain-write', () => {
      const result = validator.validateWrite(path.join(projectRoot, 'package.json'), 'rc');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('domain-write');
    });

    it('denies writing outside project root with reason outside-root', () => {
      const outside = path.join(path.dirname(projectRoot), 'evil.sh');
      const result = validator.validateWrite(outside, 'rc');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('outside-root');
    });

    it('denies writing to the platform system path with reason blocked', () => {
      const result = validator.validateWrite(SYSTEM_BLOCKED_FILE, 'rc');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('blocked');
    });
  });

  // ── Helper Methods ──────────────────────────────────────────────────────

  describe('resolve', () => {
    it('resolves absolute paths as-is', () => {
      const abs = path.join(projectRoot, 'absolute', 'file.txt');
      expect(validator.resolve(abs)).toBe(abs);
    });

    it('resolves relative paths against project root', () => {
      expect(validator.resolve(path.join('relative', 'p'))).toBe(path.join(projectRoot, 'relative', 'p'));
    });
  });

  describe('isInsideProject', () => {
    it('returns true for paths inside project', () => {
      expect(validator.isInsideProject(path.join(projectRoot, 'src'))).toBe(true);
    });

    it('returns true for exact project root', () => {
      expect(validator.isInsideProject(projectRoot)).toBe(true);
    });

    it('returns false for paths outside project', () => {
      expect(validator.isInsideProject(path.join(path.dirname(projectRoot), 'other'))).toBe(false);
    });

    it('returns false for paths that are prefixes of project root', () => {
      // <root>-other must NOT count as inside <root>
      expect(validator.isInsideProject(projectRoot + '-other')).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('returns the blocked prefix for an exact match', () => {
      const sshDir = path.join(HOME, '.ssh');
      expect(validator.isBlocked(sshDir)).toBe(sshDir);
    });

    it('returns the blocked prefix for a child path', () => {
      expect(validator.isBlocked(path.join(HOME, '.ssh', 'id_rsa'))).toBe(path.join(HOME, '.ssh'));
    });

    it('returns null for a non-blocked path', () => {
      expect(validator.isBlocked(path.join(projectRoot, 'safe', 'file'))).toBeNull();
    });

    it('does not false-positive on similar prefixes', () => {
      // <home>/.ssh-backup must NOT match the <home>/.ssh entry
      expect(validator.isBlocked(path.join(HOME, '.ssh-backup', 'file'))).toBeNull();
    });

    it.runIf(IS_WIN)('matches case-insensitively on win32 (NTFS)', () => {
      const upper = path.join(HOME, '.SSH', 'ID_RSA').toUpperCase();
      expect(validator.isBlocked(upper)).not.toBeNull();
    });

    it.runIf(IS_WIN)('blocks the Windows system root', () => {
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
      expect(validator.isBlocked(path.join(systemRoot, 'System32', 'cmd.exe'))).not.toBeNull();
    });
  });
});

// ── Input Limits ────────────────────────────────────────────────────────────

describe('Input Limits', () => {
  // ── checkInputSize ────────────────────────────────────────────────────

  describe('checkInputSize', () => {
    it('accepts input within limit', () => {
      const result = checkInputSize('hello', { maxLength: 100, fieldName: 'test' });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('hello');
      expect(result.truncated).toBe(false);
      expect(result.originalLength).toBe(5);
      expect(result.warning).toBeUndefined();
    });

    it('accepts input at exactly the limit', () => {
      const value = 'a'.repeat(100);
      const result = checkInputSize(value, { maxLength: 100, fieldName: 'test' });

      expect(result.valid).toBe(true);
      expect(result.truncated).toBe(false);
    });

    it('rejects input over limit (no truncation)', () => {
      const value = 'a'.repeat(101);
      const result = checkInputSize(value, { maxLength: 100, fieldName: 'test' });

      expect(result.valid).toBe(false);
      expect(result.truncated).toBe(false);
      expect(result.warning).toContain('exceeds maximum length');
      expect(result.warning).toContain('101');
      expect(result.warning).toContain('100');
    });

    it('truncates input over limit when truncate=true', () => {
      const value = 'abcdefghij'; // 10 chars
      const result = checkInputSize(value, { maxLength: 5, fieldName: 'test' }, true);

      expect(result.valid).toBe(true);
      expect(result.value).toBe('abcde');
      expect(result.truncated).toBe(true);
      expect(result.originalLength).toBe(10);
      expect(result.warning).toContain('truncated');
      expect(result.warning).toContain('50%');
    });

    it('accepts preset name as config', () => {
      const result = checkInputSize('hello', 'brief');

      expect(result.valid).toBe(true);
    });

    it('rejects over-limit input with preset name', () => {
      const value = 'a'.repeat(DEFAULT_LIMITS.brief.maxLength + 1);
      const result = checkInputSize(value, 'brief');

      expect(result.valid).toBe(false);
      expect(result.warning).toContain('brief');
    });

    it('falls back to generic for unknown preset', () => {
      const result = checkInputSize('hello', 'nonexistent_preset' as keyof typeof DEFAULT_LIMITS);

      expect(result.valid).toBe(true);
    });

    it('handles empty string', () => {
      const result = checkInputSize('', { maxLength: 100, fieldName: 'test' });

      expect(result.valid).toBe(true);
      expect(result.originalLength).toBe(0);
    });
  });

  // ── checkInputs (batch) ───────────────────────────────────────────────

  describe('checkInputs', () => {
    it('validates multiple fields', () => {
      const result = checkInputs({
        name: { value: 'My Project', config: 'brief' },
        desc: { value: 'A description', config: 'requirements' },
      });

      expect(result.valid).toBe(true);
      expect(result.results.name.valid).toBe(true);
      expect(result.results.desc.valid).toBe(true);
    });

    it('returns invalid when any field fails', () => {
      const tinyLimit: InputLimitConfig = { maxLength: 3, fieldName: 'tiny' };
      const result = checkInputs({
        ok: { value: 'ab', config: tinyLimit },
        bad: { value: 'abcdef', config: tinyLimit },
      });

      expect(result.valid).toBe(false);
      expect(result.results.ok.valid).toBe(true);
      expect(result.results.bad.valid).toBe(false);
    });

    it('truncates all oversized fields when truncate=true', () => {
      const tinyLimit: InputLimitConfig = { maxLength: 3, fieldName: 'tiny' };
      const result = checkInputs(
        {
          a: { value: 'abcdef', config: tinyLimit },
          b: { value: 'xyz', config: tinyLimit },
        },
        true,
      );

      expect(result.valid).toBe(true);
      expect(result.results.a.truncated).toBe(true);
      expect(result.results.a.value).toBe('abc');
      expect(result.results.b.truncated).toBe(false);
    });
  });

  // ── DEFAULT_LIMITS ────────────────────────────────────────────────────

  describe('DEFAULT_LIMITS', () => {
    it('has all expected presets', () => {
      expect(DEFAULT_LIMITS.brief).toBeDefined();
      expect(DEFAULT_LIMITS.requirements).toBeDefined();
      expect(DEFAULT_LIMITS.codeContext).toBeDefined();
      expect(DEFAULT_LIMITS.operatorInputs).toBeDefined();
      expect(DEFAULT_LIMITS.feedback).toBeDefined();
      expect(DEFAULT_LIMITS.generic).toBeDefined();
    });

    it('has reasonable limits', () => {
      expect(DEFAULT_LIMITS.brief.maxLength).toBeLessThanOrEqual(50_000);
      expect(DEFAULT_LIMITS.codeContext.maxLength).toBeGreaterThanOrEqual(50_000);
      expect(DEFAULT_LIMITS.feedback.maxLength).toBeLessThanOrEqual(10_000);
    });

    it('has fieldName set for all presets', () => {
      for (const [, config] of Object.entries(DEFAULT_LIMITS)) {
        expect(config.fieldName).toBeTruthy();
      }
    });
  });
});

// ── guardedTool wrapper ──────────────────────────────────────────────────────

describe('guardedTool', () => {
  const ok = async () => ({
    content: [{ type: 'text' as const, text: 'ok' }],
  });

  let safeDir: string;

  beforeAll(() => {
    safeDir = mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  });

  afterAll(() => {
    rmSync(safeDir, { recursive: true, force: true });
  });

  it('blocks system paths in project_path', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ project_path: SYSTEM_BLOCKED_FILE });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('protected system directory');
  });

  it('blocks home credential paths in project_path', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ project_path: path.join(HOME, '.ssh') });
    expect(result.isError).toBe(true);
  });

  it('blocks relative project_path', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ project_path: '../escape' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('absolute path');
  });

  it('allows valid absolute project_path', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ project_path: safeDir });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('ok');
  });

  it('blocks oversized known fields', async () => {
    const guarded = guardedTool(ok);
    const huge = 'x'.repeat(60_000);
    const result = await guarded({ project_path: safeDir, brief: huge });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Input size limit exceeded');
  });

  it('passes through when no project_path and no known fields', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ custom_field: 'anything' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('ok');
  });
});
