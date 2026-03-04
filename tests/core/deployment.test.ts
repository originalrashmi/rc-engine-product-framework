import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  checkDeployReadiness,
  formatReadinessReport,
  detectProjectProfile,
  generateConfigs,
} from '../../src/core/deployment/index.js';

describe('Deployment', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-deploy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readiness checks', () => {
    it('fails when package.json is missing', () => {
      const report = checkDeployReadiness(tmpDir);
      const pkgCheck = report.checks.find((c) => c.name === 'package.json');
      expect(pkgCheck?.status).toBe('fail');
      expect(report.ready).toBe(false);
    });

    it('passes with a valid project setup', () => {
      // Create a minimal valid project
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          scripts: { build: 'tsc', start: 'node dist/index.js' },
          engines: { node: '>=18' },
          license: 'MIT',
        }),
      );
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules\n.env\ndist\n');
      fs.writeFileSync(path.join(tmpDir, '.env.example'), 'DATABASE_URL=\n');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test App\n');

      const report = checkDeployReadiness(tmpDir);
      expect(report.passCount).toBeGreaterThanOrEqual(7);
      expect(report.failCount).toBe(0);
      expect(report.ready).toBe(true);
    });

    it('warns when .gitignore missing critical patterns', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'dist\n');

      const report = checkDeployReadiness(tmpDir);
      const gitCheck = report.checks.find((c) => c.name === '.gitignore');
      expect(gitCheck?.status).toBe('warn');
    });

    it('detects potential secrets in source files', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules\n.env\n');
      fs.writeFileSync(path.join(tmpDir, 'config.ts'), 'const API_KEY = "sk-ant-1234567890abcdefghijklmnop";\n');

      const report = checkDeployReadiness(tmpDir);
      const secretCheck = report.checks.find((c) => c.name === 'no secrets');
      expect(secretCheck?.status).toBe('fail');
    });

    it('formats report as markdown', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
      const report = checkDeployReadiness(tmpDir);
      const md = formatReadinessReport(report);
      expect(md).toContain('# Deployment Readiness Report');
      expect(md).toContain('package.json');
    });
  });

  describe('project detection', () => {
    it('detects Express framework', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'api', dependencies: { express: '^4.0.0' } }),
      );
      const profile = detectProjectProfile(tmpDir);
      expect(profile.framework).toBe('express');
      expect(profile.name).toBe('api');
    });

    it('detects Next.js framework', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'webapp', dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
      );
      const profile = detectProjectProfile(tmpDir);
      expect(profile.framework).toBe('nextjs');
    });

    it('detects Vite SPA', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'spa', devDependencies: { vite: '^5.0.0', react: '^18.0.0' } }),
      );
      const profile = detectProjectProfile(tmpDir);
      expect(profile.framework).toBe('vite-spa');
    });

    it('detects TypeScript', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', devDependencies: { typescript: '^5.0.0' } }),
      );
      const profile = detectProjectProfile(tmpDir);
      expect(profile.hasTypeScript).toBe(true);
    });

    it('detects Prisma', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { '@prisma/client': '^5.0.0' } }),
      );
      const profile = detectProjectProfile(tmpDir);
      expect(profile.hasPrisma).toBe(true);
    });

    it('defaults to generic-node', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'cli-tool' }));
      const profile = detectProjectProfile(tmpDir);
      expect(profile.framework).toBe('generic-node');
    });
  });

  describe('config generation', () => {
    it('generates Docker configs', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: { express: '^4.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        }),
      );

      const configs = generateConfigs(tmpDir, ['docker']);
      const filenames = configs.map((c) => c.filename);
      expect(filenames).toContain('Dockerfile');
      expect(filenames).toContain('docker-compose.yml');
      expect(filenames).toContain('.dockerignore');
      expect(filenames).toContain('.github/workflows/ci.yml');
      expect(filenames).toContain('.github/workflows/cd.yml');
    });

    it('generates Vercel config', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { next: '^14.0.0' } }),
      );

      const configs = generateConfigs(tmpDir, ['vercel']);
      const vercel = configs.find((c) => c.filename === 'vercel.json');
      expect(vercel).toBeDefined();
      expect(vercel!.content).toContain('$schema');
    });

    it('generates Fly.io config', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-api', dependencies: { express: '^4.0.0' } }),
      );

      const configs = generateConfigs(tmpDir, ['fly']);
      const fly = configs.find((c) => c.filename === 'fly.toml');
      expect(fly).toBeDefined();
      expect(fly!.content).toContain('my-api');
    });

    it('generates Railway config', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'svc', devDependencies: { typescript: '^5.0.0' } }),
      );

      const configs = generateConfigs(tmpDir, ['railway']);
      const railway = configs.find((c) => c.filename === 'railway.json');
      expect(railway).toBeDefined();
      expect(railway!.content).toContain('dist/index.js');
    });
  });
});
