/**
 * Test Runner — Execute generated tests and feed errors back.
 *
 * Spawns test commands (npm test, pytest) in sandbox and captures output.
 * Failed tests feed back to the build agent for one rework pass.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import type { TechStack } from '../types.js';

export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
  /** Raw stdout from the test command */
  stdout: string;
  /** Raw stderr from the test command */
  stderr: string;
  /** Number of tests that passed */
  passCount: number;
  /** Number of tests that failed */
  failCount: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Determine the test command for a given tech stack.
 */
function getTestCommand(stack: TechStack): string {
  switch (stack.language) {
    case 'typescript':
      return 'npx vitest run --reporter=verbose 2>&1';
    case 'python':
      return 'python -m pytest -v 2>&1';
    case 'ruby':
      return 'bundle exec rspec 2>&1';
    case 'go':
      return 'go test ./... -v 2>&1';
    case 'java':
      return 'mvn test 2>&1';
    default:
      return 'npm test 2>&1';
  }
}

/**
 * Run tests in the generated project directory.
 *
 * @param projectPath - Root of the generated project
 * @param stack - Tech stack to determine test command
 * @param testDir - Optional subdirectory containing tests
 * @returns Test run results
 */
export function runTests(projectPath: string, stack: TechStack, testDir?: string): TestRunResult {
  const startMs = Date.now();
  const command = getTestCommand(stack);
  const cwd = testDir ? path.join(projectPath, testDir) : projectPath;

  try {
    const stdout = execSync(command, {
      cwd,
      timeout: 120_000, // 2 minute timeout
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const { passCount, failCount } = parseTestOutput(stdout, stack.language);

    return {
      passed: failCount === 0,
      stdout,
      stderr: '',
      passCount,
      failCount,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const stdout = execErr.stdout ?? '';
    const stderr = execErr.stderr ?? execErr.message ?? '';
    const { passCount, failCount } = parseTestOutput(stdout + stderr, stack.language);

    return {
      passed: false,
      stdout,
      stderr,
      passCount,
      failCount: failCount || 1, // At least 1 failure if we're in the catch block
      durationMs: Date.now() - startMs,
    };
  }
}

/**
 * Parse test output to extract pass/fail counts.
 */
function parseTestOutput(output: string, language: string): { passCount: number; failCount: number } {
  let passCount = 0;
  let failCount = 0;

  switch (language) {
    case 'typescript': {
      // Vitest: "Tests  5 passed | 2 failed"
      const vitestMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/);
      if (vitestMatch) {
        passCount = parseInt(vitestMatch[1], 10);
        failCount = parseInt(vitestMatch[2] ?? '0', 10);
      }
      break;
    }
    case 'python': {
      // pytest: "5 passed, 2 failed"
      const pytestMatch = output.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/);
      if (pytestMatch) {
        passCount = parseInt(pytestMatch[1], 10);
        failCount = parseInt(pytestMatch[2] ?? '0', 10);
      }
      break;
    }
    default: {
      // Generic: count "PASS" and "FAIL" occurrences
      passCount = (output.match(/\bpass(ed)?\b/gi) ?? []).length;
      failCount = (output.match(/\bfail(ed|ure)?\b/gi) ?? []).length;
    }
  }

  return { passCount, failCount };
}
