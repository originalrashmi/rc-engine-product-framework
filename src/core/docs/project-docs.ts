/**
 * Project Documentation Generator
 *
 * Auto-generates project documentation from pipeline artifacts:
 * - Project summary from PRD
 * - Architecture overview from architect phase
 * - API reference skeleton from task list
 * - Setup instructions from package.json + .env.example
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProjectDoc {
  filename: string;
  title: string;
  content: string;
}

export interface DocSources {
  /** Project root path. */
  projectPath: string;
  /** Name to use in documentation. */
  projectName?: string;
}

// ── Generator ───────────────────────────────────────────────────────────────

export function generateProjectDocs(sources: DocSources): ProjectDoc[] {
  const docs: ProjectDoc[] = [];
  const { projectPath } = sources;
  const projectName = sources.projectName || detectProjectName(projectPath);

  // 1. Setup / getting-started guide
  docs.push(generateSetupGuide(projectPath, projectName));

  // 2. Architecture overview (if architect artifacts exist)
  const archDoc = generateArchOverview(projectPath, projectName);
  if (archDoc) docs.push(archDoc);

  // 3. Pipeline status summary
  docs.push(generatePipelineSummary(projectPath, projectName));

  return docs;
}

/** Write docs to a docs/ directory. */
export function writeProjectDocs(
  projectPath: string,
  docs: ProjectDoc[],
  outDir = 'docs/generated',
): { written: string[] } {
  const fullOutDir = path.join(projectPath, outDir);
  if (!fs.existsSync(fullOutDir)) {
    fs.mkdirSync(fullOutDir, { recursive: true });
  }

  const written: string[] = [];
  for (const doc of docs) {
    const filePath = path.join(fullOutDir, doc.filename);
    fs.writeFileSync(filePath, doc.content, 'utf-8');
    written.push(path.join(outDir, doc.filename));
  }

  return { written };
}

// ── Setup Guide ─────────────────────────────────────────────────────────────

function generateSetupGuide(projectPath: string, projectName: string): ProjectDoc {
  const lines: string[] = [`# ${projectName} -- Setup Guide`, ''];

  // Prerequisites
  lines.push('## Prerequisites', '');
  const pkg = readPkg(projectPath);
  if (pkg?.engines) {
    const engines = pkg.engines as Record<string, string>;
    if (engines.node) lines.push(`- Node.js ${engines.node}`);
    if (engines.npm) lines.push(`- npm ${engines.npm}`);
  } else {
    lines.push('- Node.js >= 18.0.0');
  }
  lines.push('');

  // Installation
  lines.push('## Installation', '', '```bash');
  lines.push('git clone <repository-url>');
  lines.push(`cd ${path.basename(projectPath)}`);
  lines.push('npm install');
  lines.push('```', '');

  // Environment variables
  const envExamplePath = path.join(projectPath, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    lines.push('## Environment Variables', '');
    lines.push('Copy the example environment file and fill in your values:', '');
    lines.push('```bash');
    lines.push('cp .env.example .env');
    lines.push('```', '');

    try {
      const envContent = fs.readFileSync(envExamplePath, 'utf-8');
      const vars = envContent
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => l.split('=')[0].trim());
      if (vars.length > 0) {
        lines.push('Required variables:', '');
        lines.push('| Variable | Description |');
        lines.push('|----------|-------------|');
        for (const v of vars) {
          lines.push(`| \`${v}\` | |`);
        }
        lines.push('');
      }
    } catch {
      // Skip if unreadable
    }
  }

  // Scripts
  if (pkg?.scripts) {
    const scripts = pkg.scripts as Record<string, string>;
    lines.push('## Available Scripts', '');
    lines.push('| Command | Description |');
    lines.push('|---------|-------------|');

    const descriptions: Record<string, string> = {
      build: 'Compile the project',
      dev: 'Start development mode with watch',
      start: 'Start the production server',
      test: 'Run the test suite',
      lint: 'Check code style',
      'lint:fix': 'Auto-fix code style issues',
      format: 'Format code with Prettier',
      check: 'Run all checks (type, lint, format, test)',
    };

    for (const [name, cmd] of Object.entries(scripts)) {
      const desc = descriptions[name] || `\`${cmd}\``;
      lines.push(`| \`npm run ${name}\` | ${desc} |`);
    }
    lines.push('');
  }

  return {
    filename: 'SETUP.md',
    title: 'Setup Guide',
    content: lines.join('\n'),
  };
}

// ── Architecture Overview ───────────────────────────────────────────────────

function generateArchOverview(projectPath: string, projectName: string): ProjectDoc | null {
  // Look for architecture artifacts from RC Method Phase 3
  const archPaths = [path.join(projectPath, 'rc-method', 'architecture'), path.join(projectPath, 'rc-method', 'prds')];

  let archContent: string | null = null;
  for (const dir of archPaths) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().includes('architect') || f.toLowerCase().includes('arch'));
      if (files.length > 0) {
        archContent = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
        break;
      }
    } catch {
      continue;
    }
  }

  if (!archContent) return null;

  const lines: string[] = [
    `# ${projectName} -- Architecture Overview`,
    '',
    '*Auto-generated from RC Method Phase 3 (Architect) output.*',
    '',
    '---',
    '',
    archContent,
    '',
  ];

  return {
    filename: 'ARCHITECTURE.md',
    title: 'Architecture Overview',
    content: lines.join('\n'),
  };
}

// ── Pipeline Summary ────────────────────────────────────────────────────────

function generatePipelineSummary(projectPath: string, projectName: string): ProjectDoc {
  const lines: string[] = [
    `# ${projectName} -- Pipeline Summary`,
    '',
    '*Auto-generated summary of the RC Engine pipeline status.*',
    '',
  ];

  // Check which phases have artifacts
  const domains = [
    { name: 'Pre-RC Research', dir: 'pre-rc-research', phases: ['classification', 'research', 'prd'] },
    { name: 'RC Method', dir: 'rc-method', phases: ['prds', 'tasks', 'forge'] },
    { name: 'Post-RC Validation', dir: 'post-rc', phases: ['scans', 'reports'] },
    { name: 'Traceability', dir: 'rc-traceability', phases: ['matrix', 'reports'] },
  ];

  lines.push('## Domain Status', '');
  lines.push('| Domain | Status | Artifacts |');
  lines.push('|--------|--------|-----------|');

  for (const domain of domains) {
    const domainPath = path.join(projectPath, domain.dir);
    if (!fs.existsSync(domainPath)) {
      lines.push(`| ${domain.name} | Not started | -- |`);
      continue;
    }

    let fileCount = 0;
    try {
      fileCount = countFiles(domainPath);
    } catch {
      // Skip
    }

    lines.push(`| ${domain.name} | Active | ${fileCount} files |`);
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  return {
    filename: 'PIPELINE-SUMMARY.md',
    title: 'Pipeline Summary',
    content: lines.join('\n'),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectProjectName(projectPath: string): string {
  const pkg = readPkg(projectPath);
  if (pkg?.name) return pkg.name as string;
  return path.basename(projectPath);
}

function readPkg(projectPath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    }
  } catch {
    // Skip unreadable
  }
  return count;
}
