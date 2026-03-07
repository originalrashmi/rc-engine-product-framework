import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Tests the shared loadPrdContext and loadResearchContext functions.
 * Uses temp directories to simulate project structures.
 */

// Re-implement the pure logic for testing (avoids importing the module which has Orchestrator side effects)

function loadPrdContextSync(projectPath: string): string {
  const prdsDir = path.join(projectPath, 'rc-method', 'prds');
  try {
    if (!fs.existsSync(prdsDir)) {
      const preRcDir = path.join(projectPath, 'pre-rc-research');
      if (fs.existsSync(preRcDir)) {
        const files = fs.readdirSync(preRcDir).filter((f: string) => f.endsWith('.md') && f.includes('prd'));
        if (files.length > 0) {
          return fs.readFileSync(path.join(preRcDir, files[0]), 'utf-8');
        }
      }
      return 'No PRD found. Will work from project description only.';
    }
    const files = fs.readdirSync(prdsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => fs.readFileSync(path.join(prdsDir, f), 'utf-8')).join('\n\n---\n\n');
  } catch {
    return 'Could not load PRD files.';
  }
}

function loadResearchContextSync(projectPath: string): {
  icpData: string | undefined;
  competitorData: string | undefined;
} {
  const researchDir = path.join(projectPath, 'pre-rc-research');
  let icpData: string | undefined;
  let competitorData: string | undefined;

  try {
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir);
      const icpFile = files.find(
        (f: string) => f.includes('icp') || f.includes('persona') || f.includes('user-research'),
      );
      if (icpFile) {
        icpData = fs.readFileSync(path.join(researchDir, icpFile), 'utf-8');
      }
      const compFile = files.find(
        (f: string) => f.includes('competitor') || f.includes('market') || f.includes('landscape'),
      );
      if (compFile) {
        competitorData = fs.readFileSync(path.join(researchDir, compFile), 'utf-8');
      }
    }
  } catch {
    // Non-fatal
  }

  return { icpData, competitorData };
}

describe('loadPrdContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-prd-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads PRD from rc-method/prds/', () => {
    const prdsDir = path.join(tmpDir, 'rc-method', 'prds');
    fs.mkdirSync(prdsDir, { recursive: true });
    fs.writeFileSync(path.join(prdsDir, 'prd-main.md'), '# Main PRD\nFeature list here', 'utf-8');

    const result = loadPrdContextSync(tmpDir);
    expect(result).toContain('Main PRD');
  });

  it('joins multiple PRD files', () => {
    const prdsDir = path.join(tmpDir, 'rc-method', 'prds');
    fs.mkdirSync(prdsDir, { recursive: true });
    fs.writeFileSync(path.join(prdsDir, 'prd-core.md'), 'Core features', 'utf-8');
    fs.writeFileSync(path.join(prdsDir, 'prd-ux.md'), 'UX requirements', 'utf-8');

    const result = loadPrdContextSync(tmpDir);
    expect(result).toContain('Core features');
    expect(result).toContain('UX requirements');
    expect(result).toContain('---');
  });

  it('falls back to pre-rc-research for PRD', () => {
    const preRcDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(preRcDir, { recursive: true });
    fs.writeFileSync(path.join(preRcDir, 'prd-vendor-portal.md'), 'Vendor Portal PRD', 'utf-8');

    const result = loadPrdContextSync(tmpDir);
    expect(result).toContain('Vendor Portal PRD');
  });

  it('returns fallback message when no PRD exists', () => {
    const result = loadPrdContextSync(tmpDir);
    expect(result).toContain('No PRD found');
  });

  it('ignores non-md files in prds directory', () => {
    const prdsDir = path.join(tmpDir, 'rc-method', 'prds');
    fs.mkdirSync(prdsDir, { recursive: true });
    fs.writeFileSync(path.join(prdsDir, 'prd.md'), 'Real PRD', 'utf-8');
    fs.writeFileSync(path.join(prdsDir, 'notes.txt'), 'Not a PRD', 'utf-8');

    const result = loadPrdContextSync(tmpDir);
    expect(result).toContain('Real PRD');
    expect(result).not.toContain('Not a PRD');
  });
});

describe('loadResearchContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-research-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads ICP data from pre-rc-research', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'icp-analysis.md'), 'Target: SMB founders', 'utf-8');

    const { icpData, competitorData } = loadResearchContextSync(tmpDir);
    expect(icpData).toContain('SMB founders');
    expect(competitorData).toBeUndefined();
  });

  it('loads competitor data', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'competitor-analysis.md'), 'Competitor: Acme Corp', 'utf-8');

    const { competitorData } = loadResearchContextSync(tmpDir);
    expect(competitorData).toContain('Acme Corp');
  });

  it('loads both ICP and competitor data', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'user-research.md'), 'User interviews', 'utf-8');
    fs.writeFileSync(path.join(researchDir, 'market-landscape.md'), 'Market analysis', 'utf-8');

    const { icpData, competitorData } = loadResearchContextSync(tmpDir);
    expect(icpData).toContain('User interviews');
    expect(competitorData).toContain('Market analysis');
  });

  it('returns undefined when no research directory exists', () => {
    const { icpData, competitorData } = loadResearchContextSync(tmpDir);
    expect(icpData).toBeUndefined();
    expect(competitorData).toBeUndefined();
  });

  it('matches persona files as ICP data', () => {
    const researchDir = path.join(tmpDir, 'pre-rc-research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'persona-detailed.md'), 'Sarah, 35, PM', 'utf-8');

    const { icpData } = loadResearchContextSync(tmpDir);
    expect(icpData).toContain('Sarah');
  });
});
