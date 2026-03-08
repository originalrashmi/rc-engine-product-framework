import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generatePlaybook } from '../../src/domains/rc/generators/playbook-generator.js';

describe('Playbook Generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-playbook-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a playbook for an empty project', () => {
    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Empty Project' });
    expect(result.markdown).toContain('# Empty Project - Project Playbook');
    expect(result.markdown).toContain('## 1. Executive Summary');
    expect(result.markdown).toContain('No Pre-RC research was conducted');
    expect(result.markdown).toContain('No PRD was generated');
    expect(result.savedPath).toContain('PLAYBOOK-empty-project.md');
  });

  it('saves the playbook markdown to disk', () => {
    // Need rc-method dir to exist for save
    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Save Test' });
    const fullPath = path.join(tmpDir, result.savedPath);
    expect(fs.existsSync(fullPath)).toBe(true);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('Save Test');
  });

  it('includes Pre-RC research when available', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'market-analysis.md'), '# Market Analysis\n\nThe market is growing.');

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Research Project' });
    expect(result.markdown).toContain('## 2. Research Findings');
    expect(result.markdown).toContain('Market Analysis');
    expect(result.markdown).toContain('The market is growing');
    expect(result.markdown).not.toContain('No Pre-RC research was conducted');
  });

  it('includes PRD content when available', () => {
    const prdsDir = path.join(tmpDir, 'rc-method', 'prds');
    fs.mkdirSync(prdsDir, { recursive: true });
    fs.writeFileSync(path.join(prdsDir, 'PRD-test-master.md'), '# Requirements\n\n## Features\n- Login\n- Dashboard');

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'PRD Project' });
    expect(result.markdown).toContain('## 3. Product Requirements');
    expect(result.markdown).toContain('Login');
    expect(result.markdown).toContain('Dashboard');
  });

  it('includes design spec when available', () => {
    const designDir = path.join(tmpDir, 'rc-method', 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design-spec.json'),
      JSON.stringify({
        icpSummary: 'Small business owners',
        options: [
          {
            id: 'A',
            name: 'Clean Pro',
            style: { personality: 'Minimalist and clear' },
            icpAlignment: 90,
            tradeoffs: { strengths: ['Good readability'], weaknesses: ['Less unique'] },
          },
        ],
        recommendation: { optionId: 'A', reason: 'Best fit for target users' },
      }),
    );

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Design Project' });
    expect(result.markdown).toContain('## 4. Design Decisions');
    expect(result.markdown).toContain('Small business owners');
    expect(result.markdown).toContain('Clean Pro');
    expect(result.markdown).toContain('Minimalist and clear');
    expect(result.markdown).toContain('Option A');
  });

  it('includes task content when available', () => {
    const tasksDir = path.join(tmpDir, 'rc-method', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(
      path.join(tasksDir, 'TASKS-test.md'),
      '# Tasks\n\n- TASK-001: Setup auth\n- TASK-002: Build dashboard',
    );

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Task Project' });
    expect(result.markdown).toContain('## 6. Implementation Plan');
    expect(result.markdown).toContain('TASK-001');
  });

  it('includes post-RC content when available', () => {
    const postRcDir = path.join(tmpDir, 'post-rc');
    fs.mkdirSync(postRcDir, { recursive: true });
    fs.writeFileSync(path.join(postRcDir, 'scan-results.md'), '# Security Scan\n\nNo critical issues found.');

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Secure Project' });
    expect(result.markdown).toContain('## 7. Quality & Security');
    expect(result.markdown).toContain('No critical issues found');
  });

  it('generates artifact index from all directories', () => {
    // Create files in multiple directories
    const dirs = ['pre-rc-research', 'rc-method/prds', 'post-rc'];
    for (const dir of dirs) {
      const fullDir = path.join(tmpDir, dir);
      fs.mkdirSync(fullDir, { recursive: true });
      fs.writeFileSync(path.join(fullDir, `test-${dir.replace('/', '-')}.md`), 'content');
    }

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Full Project' });
    expect(result.markdown).toContain('## 10. Appendix: Artifact Index');
    expect(result.markdown).toContain('test-pre-rc-research.md');
    expect(result.markdown).toContain('test-rc-method-prds.md');
    expect(result.markdown).toContain('test-post-rc.md');
  });

  it('sanitizes project name for filename', () => {
    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'My Cool App!!!' });
    expect(result.savedPath).toBe('rc-method/PLAYBOOK-my-cool-app.md');
  });

  it('includes sections 1-9 even for empty project', () => {
    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Complete' });
    for (let i = 1; i <= 9; i++) {
      expect(result.markdown).toContain(`## ${i}.`);
    }
  });

  it('includes section 10 (artifact index) when files exist', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'data.md'), 'content');

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'With Artifacts' });
    expect(result.markdown).toContain('## 10. Appendix: Artifact Index');
  });

  it('truncates long research files', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    // Create a file with 100+ lines
    const longContent = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}: Research content`).join('\n');
    fs.writeFileSync(path.join(researchDir, 'long-research.md'), longContent);

    const result = generatePlaybook({ projectPath: tmpDir, projectName: 'Long Research' });
    expect(result.markdown).toContain('Truncated');
    expect(result.markdown).toContain('Line 1: Research content');
    expect(result.markdown).not.toContain('Line 100: Research content');
  });
});
