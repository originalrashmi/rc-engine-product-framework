import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCommitMessage, generateProjectDocs, writeProjectDocs } from '../../src/core/docs/index.js';

describe('Docs', () => {
  describe('changelog parser', () => {
    it('parses conventional commit with scope', () => {
      const result = parseCommitMessage('feat(web): add login page');
      expect(result.type).toBe('feat');
      expect(result.scope).toBe('web');
      expect(result.subject).toBe('add login page');
    });

    it('parses conventional commit without scope', () => {
      const result = parseCommitMessage('fix: correct null check');
      expect(result.type).toBe('fix');
      expect(result.scope).toBeUndefined();
      expect(result.subject).toBe('correct null check');
    });

    it('handles non-conventional messages', () => {
      const result = parseCommitMessage('Updated the README');
      expect(result.type).toBe('other');
      expect(result.subject).toBe('Updated the README');
    });

    it('handles breaking change marker', () => {
      const result = parseCommitMessage('feat!: remove deprecated API');
      expect(result.type).toBe('feat');
      expect(result.subject).toBe('remove deprecated API');
    });

    it('handles refactor type', () => {
      const result = parseCommitMessage('refactor(core): simplify state manager');
      expect(result.type).toBe('refactor');
      expect(result.scope).toBe('core');
    });
  });

  describe('project docs', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-docs-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('generates setup guide from package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'my-app',
          scripts: { build: 'tsc', start: 'node dist/index.js', test: 'vitest' },
          engines: { node: '>=18.0.0' },
        }),
      );

      const docs = generateProjectDocs({ projectPath: tmpDir });
      const setup = docs.find((d) => d.filename === 'SETUP.md');
      expect(setup).toBeDefined();
      expect(setup!.content).toContain('my-app');
      expect(setup!.content).toContain('npm install');
      expect(setup!.content).toContain('Node.js >=18.0.0');
    });

    it('includes env vars from .env.example', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'app' }));
      fs.writeFileSync(path.join(tmpDir, '.env.example'), 'DATABASE_URL=\nAPI_KEY=\n# Comment line\nSECRET=\n');

      const docs = generateProjectDocs({ projectPath: tmpDir });
      const setup = docs.find((d) => d.filename === 'SETUP.md');
      expect(setup!.content).toContain('DATABASE_URL');
      expect(setup!.content).toContain('API_KEY');
    });

    it('generates pipeline summary', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'app' }));

      const docs = generateProjectDocs({ projectPath: tmpDir });
      const summary = docs.find((d) => d.filename === 'PIPELINE-SUMMARY.md');
      expect(summary).toBeDefined();
      expect(summary!.content).toContain('Domain Status');
    });

    it('writes docs to output directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'app' }));

      const docs = generateProjectDocs({ projectPath: tmpDir });
      const { written } = writeProjectDocs(tmpDir, docs);
      expect(written.length).toBeGreaterThan(0);

      // Verify files exist on disk
      for (const f of written) {
        expect(fs.existsSync(path.join(tmpDir, f))).toBe(true);
      }
    });

    it('uses custom project name', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'boring' }));

      const docs = generateProjectDocs({ projectPath: tmpDir, projectName: 'My Cool App' });
      const setup = docs.find((d) => d.filename === 'SETUP.md');
      expect(setup!.content).toContain('My Cool App');
    });
  });
});
