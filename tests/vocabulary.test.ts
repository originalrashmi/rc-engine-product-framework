/**
 * Vocabulary Enforcement Test
 *
 * Scans all user-facing source files for banned internal terminology.
 * This test runs in CI (npm run check) and prevents terminology regressions.
 *
 * What it checks:
 * - Tool descriptions (strings passed to server.tool())
 * - Tool return messages (text content returned to users)
 * - Generated document templates (PRD, DOCX, HTML output)
 *
 * What it does NOT check:
 * - Internal variable names, types, or interfaces (fine to use internal terms)
 * - console.error logs (developer-facing, not user-facing)
 * - Comments (developer-facing)
 * - Test files (not shipped to users)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { BANNED_TERMS_IN_USER_OUTPUT } from '../src/shared/vocabulary.js';

// Files that contain user-facing output strings
const USER_FACING_DIRS = [
  'src/domains/pre-rc/tools',
  'src/domains/pre-rc/agents',
  'src/domains/pre-rc/generators',
  'src/domains/rc/tools',
  'src/domains/rc/graph',
  'src/domains/post-rc',
  'src/domains/traceability',
];

// Additional individual files with user-facing content
const USER_FACING_FILES = [
  'src/index.ts',
  'src/domains/rc/orchestrator.ts',
  'src/tools/rc-init.ts',
  'src/domains/pre-rc/tools.ts',
  'src/domains/post-rc/tools.ts',
];

const ROOT = join(import.meta.dirname, '..');

function collectFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  const files: string[] = [];
  try {
    for (const entry of readdirSync(abs)) {
      const full = join(abs, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files.push(...collectFiles(join(dir, entry)));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
        files.push(join(dir, entry));
      }
    }
  } catch {
    // Directory might not exist in test environment
  }
  return files;
}

function getAllUserFacingFiles(): string[] {
  const files = new Set<string>();
  for (const dir of USER_FACING_DIRS) {
    for (const f of collectFiles(dir)) {
      files.add(f);
    }
  }
  for (const f of USER_FACING_FILES) {
    files.add(f);
  }
  return Array.from(files).sort();
}

/**
 * Extract only string literals and template literals from a line.
 * Skip lines that are:
 * - Comments (// or * or /*)
 * - console.error calls (developer-facing)
 * - Import statements
 * - Type/interface definitions
 * - Variable/function declarations (just the name part)
 */
function isUserFacingLine(line: string): boolean {
  const trimmed = line.trim();
  // Skip comments
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  // Skip console.error (developer-facing)
  if (trimmed.includes('console.error')) return false;
  // Skip imports
  if (trimmed.startsWith('import ')) return false;
  // Skip type/interface definitions
  if (trimmed.startsWith('type ') || trimmed.startsWith('interface ') || trimmed.startsWith('export type '))
    return false;
  // Must contain a string literal to be user-facing
  return trimmed.includes("'") || trimmed.includes('"') || trimmed.includes('`');
}

describe('Vocabulary enforcement', () => {
  const files = getAllUserFacingFiles();

  it('should have user-facing files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rule of BANNED_TERMS_IN_USER_OUTPUT) {
    it(`should not contain: ${rule.description}`, () => {
      const violations: string[] = [];

      for (const filePath of files) {
        const abs = join(ROOT, filePath);
        let content: string;
        try {
          content = readFileSync(abs, 'utf-8');
        } catch {
          continue;
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!isUserFacingLine(line)) continue;
          if (rule.pattern.test(line)) {
            violations.push(`${relative(ROOT, abs)}:${i + 1}: ${line.trim().slice(0, 120)}`);
          }
        }
      }

      if (violations.length > 0) {
        const msg = [
          `Found ${violations.length} violation(s) of: ${rule.description}`,
          `Use "${rule.replacement}" instead.`,
          '',
          ...violations.map((v) => `  ${v}`),
          '',
          'Fix: Import from src/shared/vocabulary.ts or use the approved term directly.',
        ].join('\n');
        expect.fail(msg);
      }
    });
  }
});
