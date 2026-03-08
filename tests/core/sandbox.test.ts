/**
 * Tests for Sandbox -- Path validation, write restrictions, input limits.
 * Coverage target: 100%.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PathValidator } from '../../src/core/sandbox/path-validator.js';
import { checkInputSize, checkInputs, DEFAULT_LIMITS } from '../../src/core/sandbox/input-limits.js';
import { guardedTool } from '../../src/shared/tool-guard.js';
import type { Domain } from '../../src/core/sandbox/path-validator.js';
import type { InputLimitConfig } from '../../src/core/sandbox/input-limits.js';

// ── PathValidator ───────────────────────────────────────────────────────────

describe('PathValidator', () => {
  const PROJECT_ROOT = '/home/user/projects/my-app';
  let validator: PathValidator;

  // Create a fresh validator before examples that need it
  function createValidator(root = PROJECT_ROOT): PathValidator {
    return new PathValidator(root);
  }

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('resolves and stores the project root', () => {
      validator = createValidator('/home/user/projects/my-app');
      expect(validator.getProjectRoot()).toBe('/home/user/projects/my-app');
    });

    it('resolves relative project root to absolute', () => {
      // path.resolve will join with cwd
      validator = createValidator('relative/path');
      expect(path.isAbsolute(validator.getProjectRoot())).toBe(true);
    });
  });

  // ── Read Validation ─────────────────────────────────────────────────────

  describe('validateRead', () => {
    it('allows reading files inside project root', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, 'src/index.ts'));

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(PROJECT_ROOT, 'src/index.ts'));
    });

    it('allows reading the project root itself', () => {
      validator = createValidator();
      const result = validator.validateRead(PROJECT_ROOT);

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(PROJECT_ROOT);
    });

    it('allows reading with relative paths', () => {
      validator = createValidator();
      const result = validator.validateRead('src/index.ts');

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(PROJECT_ROOT, 'src/index.ts'));
    });

    it('blocks reading outside project root', () => {
      validator = createValidator();
      const result = validator.validateRead('/home/user/other-project/secret.txt');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside project root');
    });

    it('blocks directory traversal via ..', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd'));

      expect(result.valid).toBe(false);
      // Should fail either because it's outside project root or blocked
    });

    it('blocks reading /etc', () => {
      // Use /etc as the traversal target
      validator = createValidator();
      const result = validator.validateRead('/etc/passwd');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('blocks reading /proc', () => {
      validator = createValidator();
      const result = validator.validateRead('/proc/self/environ');

      expect(result.valid).toBe(false);
    });

    it('blocks reading /sys', () => {
      validator = createValidator();
      const result = validator.validateRead('/sys/kernel/version');

      expect(result.valid).toBe(false);
    });

    it('blocks reading ~/.ssh', () => {
      validator = createValidator();
      const result = validator.validateRead('/root/.ssh/id_rsa');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('blocks reading ~/.aws', () => {
      validator = createValidator();
      const result = validator.validateRead('/root/.aws/credentials');

      expect(result.valid).toBe(false);
    });

    it('blocks reading ~/.gnupg', () => {
      validator = createValidator();
      const result = validator.validateRead('/root/.gnupg/secring.gpg');

      expect(result.valid).toBe(false);
    });

    it('canonicalizes paths with . segments', () => {
      validator = createValidator();
      const result = validator.validateRead(path.join(PROJECT_ROOT, '.', 'src', '.', 'index.ts'));

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(PROJECT_ROOT, 'src/index.ts'));
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
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'pre-rc-research/prd-v1.md'), 'pre-rc');

      expect(result.valid).toBe(true);
    });

    it('allows rc domain to write to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method/prds/PRD-001.md'), 'rc');

      expect(result.valid).toBe(true);
    });

    it('allows post-rc domain to write to post-rc/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'post-rc/findings.json'), 'post-rc');

      expect(result.valid).toBe(true);
    });

    it('allows traceability domain to write to rc-traceability/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-traceability/matrix.json'), 'traceability');

      expect(result.valid).toBe(true);
    });

    it('allows runtime domain to write to .rc-engine/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, '.rc-engine/cache/data.json'), 'runtime');

      expect(result.valid).toBe(true);
    });

    it('blocks pre-rc domain from writing to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method/state.md'), 'pre-rc');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('pre-rc');
      expect(result.error).toContain('cannot write');
    });

    it('blocks rc domain from writing to pre-rc-research/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'pre-rc-research/data.md'), 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks post-rc domain from writing to rc-method/', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'rc-method/output.md'), 'post-rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing to project root directly (no domain dir)', () => {
      validator = createValidator();
      const result = validator.validateWrite(path.join(PROJECT_ROOT, 'package.json'), 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing outside project root', () => {
      validator = createValidator();
      const result = validator.validateWrite('/tmp/evil.sh', 'rc');

      expect(result.valid).toBe(false);
    });

    it('blocks writing to blocked paths', () => {
      validator = createValidator();
      const result = validator.validateWrite('/etc/crontab', 'rc');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
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
      const result = validator.resolve('/absolute/path');
      expect(result).toBe('/absolute/path');
    });

    it('resolves relative paths against project root', () => {
      validator = createValidator();
      const result = validator.resolve('relative/path');
      expect(result).toBe(path.join(PROJECT_ROOT, 'relative/path'));
    });
  });

  describe('isInsideProject', () => {
    it('returns true for paths inside project', () => {
      validator = createValidator();
      expect(validator.isInsideProject(path.join(PROJECT_ROOT, 'src'))).toBe(true);
    });

    it('returns true for exact project root', () => {
      validator = createValidator();
      expect(validator.isInsideProject(PROJECT_ROOT)).toBe(true);
    });

    it('returns false for paths outside project', () => {
      validator = createValidator();
      expect(validator.isInsideProject('/other/path')).toBe(false);
    });

    it('returns false for paths that are prefixes of project root', () => {
      validator = createValidator();
      // /home/user/projects/my-app-other should NOT be inside /home/user/projects/my-app
      expect(validator.isInsideProject(PROJECT_ROOT + '-other')).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('returns the blocked prefix for exact match', () => {
      validator = createValidator();
      expect(validator.isBlocked('/etc')).toBe('/etc');
    });

    it('returns the blocked prefix for child path', () => {
      validator = createValidator();
      expect(validator.isBlocked('/etc/passwd')).toBe('/etc');
    });

    it('returns null for non-blocked path', () => {
      validator = createValidator();
      expect(validator.isBlocked('/home/user/safe/file')).toBeNull();
    });

    it('does not false-positive on similar prefixes', () => {
      validator = createValidator();
      // /etcetera should NOT match /etc
      expect(validator.isBlocked('/etcetera/file')).toBeNull();
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
    const result = await guarded({ project_path: '/etc/passwd' });
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
    const result = await guarded({ project_path: '/home/user/project' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('ok');
  });

  it('blocks oversized known fields', async () => {
    const guarded = guardedTool(ok);
    const huge = 'x'.repeat(60_000);
    const result = await guarded({ project_path: '/tmp/p', brief: huge });
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
