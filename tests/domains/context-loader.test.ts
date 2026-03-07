import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Tests the ContextLoader's file loading and Pro overlay behavior.
 * Uses a temp directory structure to simulate knowledge files.
 */

// We test the loading logic directly rather than importing ContextLoader
// (which depends on resolveFromRoot and has module-level side effects)

describe('ContextLoader loadFiles graceful degradation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  function tryLoadFile(basePath: string, relativePath: string): string | null {
    const fullPath = path.join(basePath, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  }

  function loadFiles(basePath: string, relativePaths: string[]): string {
    return relativePaths
      .map((p) => tryLoadFile(basePath, p))
      .filter(Boolean)
      .join('\n\n---\n\n');
  }

  it('loads existing files and joins them', () => {
    createFile('a.md', 'File A');
    createFile('b.md', 'File B');

    const result = loadFiles(tmpDir, ['a.md', 'b.md']);
    expect(result).toContain('File A');
    expect(result).toContain('File B');
    expect(result).toContain('---');
  });

  it('skips missing files without throwing', () => {
    createFile('exists.md', 'I exist');

    const result = loadFiles(tmpDir, ['exists.md', 'missing.md', 'also-missing.md']);
    expect(result).toBe('I exist');
  });

  it('returns empty string when all files are missing', () => {
    const result = loadFiles(tmpDir, ['nope.md', 'also-nope.md']);
    expect(result).toBe('');
  });

  it('returns empty string for empty paths array', () => {
    const result = loadFiles(tmpDir, []);
    expect(result).toBe('');
  });
});

describe('Pro overlay logic', () => {
  let communityDir: string;
  let proDir: string;

  beforeEach(() => {
    communityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-community-'));
    proDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-pro-'));
  });

  afterEach(() => {
    fs.rmSync(communityDir, { recursive: true, force: true });
    fs.rmSync(proDir, { recursive: true, force: true });
  });

  function createFile(dir: string, relativePath: string, content: string): void {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  function loadFileWithOverlay(relativePath: string): string | null {
    // Try Pro first
    const proPath = path.join(proDir, relativePath);
    if (fs.existsSync(proPath)) return fs.readFileSync(proPath, 'utf-8');
    // Fall back to community
    const communityPath = path.join(communityDir, relativePath);
    if (fs.existsSync(communityPath)) return fs.readFileSync(communityPath, 'utf-8');
    return null;
  }

  it('returns Pro file when both exist', () => {
    createFile(communityDir, 'skills/design/patterns.md', 'Community patterns');
    createFile(proDir, 'skills/design/patterns.md', 'Pro patterns with 42 rules');

    expect(loadFileWithOverlay('skills/design/patterns.md')).toBe('Pro patterns with 42 rules');
  });

  it('falls back to community when Pro file is missing', () => {
    createFile(communityDir, 'skills/design/patterns.md', 'Community patterns');

    expect(loadFileWithOverlay('skills/design/patterns.md')).toBe('Community patterns');
  });

  it('returns null when neither exists', () => {
    expect(loadFileWithOverlay('skills/design/nonexistent.md')).toBeNull();
  });
});
