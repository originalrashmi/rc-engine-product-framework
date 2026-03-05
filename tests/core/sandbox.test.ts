/**
 * Tests for Sandbox -- Path validation, write restrictions, input limits.
 * Coverage target: 100%.
 *
 * Cross-platform: tests use platform-appropriate paths (Unix /home/... vs Windows C:\Users\...).
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { PathValidator } from '../../src/core/sandbox/path-validator.js';
import { checkInputSize, checkInputs, DEFAULT_LIMITS } from '../../src/core/sandbox/input-limits.js';
import { guardedTool } from '../../src/shared/tool-guard.js';
import type { Domain } from '../../src/core/sandbox/path-validator.js';
import type { InputLimitConfig } from '../../src/core/sandbox/input-limits.js';

// ── Cross-platform path helpers ──────────────────────────────────────────────

const isWindows = process.platform === 'win32';

// Use a real-looking absolute path for each platform
const PROJECT_ROOT = isWindows ? 'C:\\Users\\testuser\\projects\\my-app' : '/home/user/projects/my-app';

// A path that is definitely outside the project root
const OUTSIDE_PATH = isWindows
  ? 'C:\\Users\\testuser\\other-project\\secret.txt'
  : '/home/user/other-project/secret.txt';

// A blocked system path
const BLOCKED_SYSTEM_PATH = isWindows ? path.join(os.homedir(), '.ssh', 'id_rsa') : '/etc/passwd';

// Another blocked path for write tests
const BLOCKED_WRITE_PATH = isWindows ? path.join(os.homedir(), '.ssh', 'config') : '/etc/crontab';

// A safe absolute path (not in project, not blocked)
const SAFE_OUTSIDE_PATH = isWindows ? 'C:\\temp\\safe\\file.txt' : '/tmp/safe/file.txt';

// ── PathValidator ───────────────────────────────────────────────────────────

describe('PathValidator', () => {
  let validator: PathValidator;

  function createValidator(root = PROJECT_ROOT): PathValidator {
    return new PathValidator(root);
  }

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('resolves and stores the project root', () => {
      validator = createValidator(PROJECT_ROOT);
      expect(validator.getProjectRoot()).toBe(path.resolve(PROJECT_ROOT));
    });

    it('resolves relative project root to absolute', () => {
      validator = createValidator('relative/path');
      expect(path.isAbsolute(validator.getProjectRoot())).toBe(true);
    });
  });

  // ── Read Validation ─────────────────────────────────────────────────────

  describe('validateRead', () => {
    it('allows reading files inside project root', () => {
      validator = createValidator();
      const filePath = path.join(PROJECT_ROOT, 'src', 'index.ts');
      const result = validator.validateRead(filePath);

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.resolve(filePath));
    });

    it('allows reading the project root itself', () => {
      validator = createValidator();
      const result = validator.validateRead(PROJECT_ROOT);

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.resolve(PROJECT_ROOT));
    });

    it('allows reading with relative paths', () => {
      validator = createValidator();
      const result = validator.validateRead('src/index.ts');

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.resolve(PROJECT_ROOT, 'src/index.ts'));
    });

    it('blocks reading outside project root', () => {
      validator = createValidator();
      const result = validator.validateRead(OUTSIDE_PATH);

      expect(result.valid).toBe(false);
    });

    it('blocks directory traversal via ..', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd'));

      expect(result.valid).toBe(false);
    });

    it('blocks reading system paths', () => {
      validator = createValidator();
      const result = validator.validateRead(BLOCKED_SYSTEM_PATH);

      expect(result.valid).toBe(false);
      // On Windows, ~/.ssh is blocked via home dir check
      // On Unix, /etc is in the BLOCKED_PATHS list
    });

    it('blocks reading home .ssh directory', () => {
      validator = createValidator();
      const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');
      const result = validator.validateRead(sshPath);

      expect(result.valid).toBe(false);
    });

    it('blocks reading home .aws directory', () => {
      validator = createValidator();
      const awsPath = path.join(os.homedir(), '.aws', 'credentials');
      const result = validator.validateRead(awsPath);

      expect(result.valid).toBe(false);
    });

    it('blocks reading home .gnupg directory', () => {
      validator = createValidator();
      const gnupgPath = path.join(os.homedir(), '.gnupg', 'secring.gpg');
      const result = validator.validateRead(gnupgPath);

      expect(result.valid).toBe(false);
    });

    it('canonicalizes paths with . segments', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, '.', 'src', '.', 'index.ts'));

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.resolve(PROJECT_ROOT, 'src', 'index.ts'));
    });

    it('rejects paths that resolve to just above project root', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, '..'));

      expect(result.valid).toBe(false);
    });
  });

  // ── Write Validation ────────────────────────────────────────────────────

  describe('validateWrite', () => {
    it('allows pre-rc domain to write to pre-rc-research/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'pre-rc-research', 'prd-v1.md'), 'pre-rc');

      expect(result.valid).toBe(true);
    });

    it('allows rc domain to write to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method', 'prds', 'PRD-001.md'), 'rc');

      expect(result.valid).toBe(true);
    });

    it('allows post-rc domain to write to post-rc/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'post-rc', 'findings.json'), 'post-rc');

      expect(result.valid).toBe(true);
    });

    it('allows traceability domain to write to rc-traceability/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-traceability', 'matrix.json'), 'traceability');

      expect(result.valid).toBe(true);
    });

    it('allows runtime domain to write to .rc-engine/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, '.rc-engine', 'cache', 'data.json'), 'runtime');

      expect(result.valid).toBe(true);
    });

    it('blocks pre-rc domain from writing to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method', 'state.md'), 'pre-rc');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('pre-rc');
      expect(result.error).toContain('cannot write');
    });

    it('blocks rc domain from writing to pre-rc-research/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'pre-rc-research', 'data.md'), 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks post-rc domain from writing to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method', 'output.md'), 'post-rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing to project root directly (no domain dir)', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'package.json'), 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing outside project root', () => {
      validator = createValidator();
      const result = validator.validateWrite(SAFE_OUTSIDE_PATH, 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing to blocked paths', () => {
      validator = createValidator();
      const result = validator.validateWrite(BLOCKED_WRITE_PATH, 'rc');

      expect(result.valid).toBe(false);
    });

    it('validates all domains correctly', () => {
      validator = createValidator();

      const domains: Domain[] = ['pre-rc', 'rc', 'post-rc', 'traceability', 'runtime'];
      const dirs = ['pre-rc-research', 'rc-method', 'post-rc', 'rc-traceability', '.rc-engine'];

      for (let i = 0; i < domains.length; i++) {
        const result = validator.validateWrite(path.join(PROJECT_ROOT, dirs[i], 'test.md'), domains[i]);
        expect(result.valid).toBe(true);
      }
    });
  });

  // ── Helper Methods ──────────────────────────────────────────────────────

  describe('resolve', () => {
    it('resolves absolute paths as-is', () => {
      validator = createValidator();
      const absPath = isWindows ? 'C:\\absolute\\path' : '/absolute/path';
      const result = validator.resolve(absPath);
      expect(result).toBe(path.resolve(absPath));
    });

    it('resolves relative paths against project root', () => {
      validator = createValidator();
      const result = validator.resolve('relative/path');
      expect(result).toBe(path.resolve(PROJECT_ROOT, 'relative/path'));
    });
  });

  describe('isInsideProject', () => {
    it('returns true for paths inside project', () => {
      validator = createValidator();
      expect(validator.isInsideProject(path.resolve(PROJECT_ROOT, 'src'))).toBe(true);
    });

    it('returns true for exact project root', () => {
      validator = createValidator();
      expect(validator.isInsideProject(path.resolve(PROJECT_ROOT))).toBe(true);
    });

    it('returns false for paths outside project', () => {
      validator = createValidator();
      const otherPath = isWindows ? 'C:\\other\\path' : '/other/path';
      expect(validator.isInsideProject(path.resolve(otherPath))).toBe(false);
    });

    it('returns false for paths that are prefixes of project root', () => {
      validator = createValidator();
      expect(validator.isInsideProject(path.resolve(PROJECT_ROOT) + '-other')).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('blocks home .ssh paths', () => {
      validator = createValidator();
      const sshPath = path.join(os.homedir(), '.ssh');
      expect(validator.isBlocked(sshPath)).toBeTruthy();
    });

    it('blocks home .ssh child paths', () => {
      validator = createValidator();
      const sshChild = path.join(os.homedir(), '.ssh', 'id_rsa');
      expect(validator.isBlocked(sshChild)).toBeTruthy();
    });

    it('returns null for non-blocked path', () => {
      validator = createValidator();
      const safePath = isWindows ? 'C:\\Users\\testuser\\safe\\file' : '/home/user/safe/file';
      expect(validator.isBlocked(safePath)).toBeNull();
    });

    it('does not false-positive on similar prefixes', () => {
      validator = createValidator();
      // A path that starts similarly but is not the blocked path
      const sshLike = path.join(os.homedir(), '.sshkeys', 'file');
      expect(validator.isBlocked(sshLike)).toBeNull();
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

  it('blocks system paths in project_path', async () => {
    const guarded = guardedTool(ok);
    const blockedPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    const result = await guarded({ project_path: blockedPath });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('protected system directory');
  });

  it('blocks relative project_path', async () => {
    const guarded = guardedTool(ok);
    const result = await guarded({ project_path: '../escape' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('absolute path');
  });

  it('allows valid absolute project_path', async () => {
    const guarded = guardedTool(ok);
    const validPath = isWindows ? 'C:\\Users\\testuser\\project' : '/home/user/project';
    const result = await guarded({ project_path: validPath });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('ok');
  });

  it('blocks oversized known fields', async () => {
    const guarded = guardedTool(ok);
    const huge = 'x'.repeat(60_000);
    const validPath = isWindows ? 'C:\\tmp\\p' : '/tmp/p';
    const result = await guarded({ project_path: validPath, brief: huge });
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
