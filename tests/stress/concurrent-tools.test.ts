/**
 * Stress Test: Concurrent Tool Calls
 *
 * Verifies that the tool guard wrapper and shared infrastructure
 * handle concurrent invocations safely without data races or crashes.
 */

import { describe, it, expect } from 'vitest';
import { guardedTool } from '../../src/shared/tool-guard.js';
import { checkInputSize, checkInputs, DEFAULT_LIMITS } from '../../src/core/sandbox/input-limits.js';
import type { InputLimitConfig } from '../../src/core/sandbox/input-limits.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

describe('Concurrent tool stress tests', () => {
  it('should handle 10 simultaneous guarded tool calls without errors', async () => {
    let callCount = 0;
    const handler = async (args: Record<string, unknown>): Promise<ToolResult> => {
      callCount++;
      // Simulate some async work
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return {
        content: [{ type: 'text', text: `ok-${(args as { project_path: string }).project_path}` }],
      };
    };

    const guarded = guardedTool(handler);

    // 10 concurrent calls with different project paths
    const calls = Array.from({ length: 10 }, (_, i) => guarded({ project_path: `/tmp/project-${i}` }));

    const results = await Promise.all(calls);

    // All should succeed
    for (const result of results) {
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/^ok-/);
    }
    expect(callCount).toBe(10);
  });

  it('should handle concurrent calls with invalid paths (error, not crash)', async () => {
    const handler = async (): Promise<ToolResult> => {
      return { content: [{ type: 'text', text: 'should not reach here' }] };
    };

    const guarded = guardedTool(handler);

    // Mix of valid and invalid paths
    const calls = [
      guarded({ project_path: '/tmp/valid-1' }),
      guarded({ project_path: 'relative/path' }), // invalid: not absolute
      guarded({ project_path: '/tmp/valid-2' }),
      guarded({ project_path: '../traversal' }), // invalid: not absolute
      guarded({ project_path: '/tmp/valid-3' }),
    ];

    const results = await Promise.all(calls);

    // Valid paths succeed
    expect(results[0].isError).toBeFalsy();
    expect(results[2].isError).toBeFalsy();
    expect(results[4].isError).toBeFalsy();

    // Invalid paths return errors (not thrown exceptions)
    expect(results[1].isError).toBe(true);
    expect(results[1].content[0].text).toContain('must be an absolute path');
    expect(results[3].isError).toBe(true);
    expect(results[3].content[0].text).toContain('must be an absolute path');
  });

  it('should handle concurrent reads during a state write pattern', async () => {
    // Simulate concurrent read/write pattern: one slow write, many fast reads
    const sharedState = { value: 0 };

    const writeHandler = async (): Promise<ToolResult> => {
      await new Promise((r) => setTimeout(r, 50));
      sharedState.value = 42;
      return { content: [{ type: 'text', text: 'written' }] };
    };

    const readHandler = async (): Promise<ToolResult> => {
      return {
        content: [{ type: 'text', text: `read:${sharedState.value}` }],
      };
    };

    const guardedWrite = guardedTool(writeHandler);
    const guardedRead = guardedTool(readHandler);

    // Launch one write and 5 reads concurrently
    const results = await Promise.all([
      guardedWrite({ project_path: '/tmp/test' }),
      guardedRead({ project_path: '/tmp/test' }),
      guardedRead({ project_path: '/tmp/test' }),
      guardedRead({ project_path: '/tmp/test' }),
      guardedRead({ project_path: '/tmp/test' }),
      guardedRead({ project_path: '/tmp/test' }),
    ]);

    // All complete without errors
    for (const result of results) {
      expect(result.isError).toBeFalsy();
    }

    // After all settle, the write should have completed
    expect(sharedState.value).toBe(42);
  });

  it('should be reentrant under concurrent invocations', async () => {
    const executionOrder: string[] = [];

    const handler = async (args: Record<string, unknown>): Promise<ToolResult> => {
      const id = (args as { id: string }).id;
      executionOrder.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, Math.random() * 20));
      executionOrder.push(`end-${id}`);
      return { content: [{ type: 'text', text: `done-${id}` }] };
    };

    const guarded = guardedTool(handler);

    // 20 concurrent calls
    const calls = Array.from({ length: 20 }, (_, i) => guarded({ project_path: '/tmp/test', id: String(i) }));

    const results = await Promise.all(calls);

    // All 20 should complete
    expect(results).toHaveLength(20);
    for (const r of results) {
      expect(r.isError).toBeFalsy();
    }

    // All 20 starts and ends should be recorded (interleaved is fine)
    expect(executionOrder.filter((e) => e.startsWith('start-'))).toHaveLength(20);
    expect(executionOrder.filter((e) => e.startsWith('end-'))).toHaveLength(20);
  });

  it('should handle concurrent input validation without interference', async () => {
    // Run many input size checks concurrently
    const checks = Array.from({ length: 50 }, (_, i) => {
      const value = 'x'.repeat(i * 200);
      return Promise.resolve(checkInputSize(value, DEFAULT_LIMITS.brief));
    });

    const results = await Promise.all(checks);

    // First 50 checks (0 to 9800 chars) should all be valid (limit is 10000)
    for (let i = 0; i < 50; i++) {
      const expectedLength = i * 200;
      expect(results[i].originalLength).toBe(expectedLength);
      if (expectedLength <= 10_000) {
        expect(results[i].valid).toBe(true);
      }
    }
  });

  it('should handle batch input validation with multiple fields concurrently', async () => {
    const validations = Array.from({ length: 20 }, (_, i) => {
      const fields: Record<string, { value: string; config: InputLimitConfig }> = {
        brief: { value: 'x'.repeat(i * 500), config: DEFAULT_LIMITS.brief },
        feedback: { value: 'y'.repeat(i * 100), config: DEFAULT_LIMITS.feedback },
      };
      return Promise.resolve(checkInputs(fields));
    });

    const results = await Promise.all(validations);

    // First few should pass (small inputs), later ones should fail
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(true);

    // At i=11, brief would be 5500 chars (under 10000), feedback 1100 chars (under 5000) — still valid
    // At i=20 (actually i=19 since 0-indexed), brief=9500 (ok), feedback=1900 (ok)
    // All 20 should actually be valid since max brief=19*500=9500 < 10000 and max feedback=19*100=1900 < 5000
    for (const r of results) {
      expect(r.valid).toBe(true);
    }
  });

  it('should handle rapid fire guarded calls that all fail validation', async () => {
    const handler = async (): Promise<ToolResult> => {
      throw new Error('Should not be called');
    };

    const guarded = guardedTool(handler);

    // 50 rapid calls with invalid input
    const calls = Array.from({ length: 50 }, () =>
      guarded({
        project_path: 'not-absolute',
      }),
    );

    const results = await Promise.all(calls);

    // All should return errors (not throw)
    for (const r of results) {
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('must be an absolute path');
    }
  });
});
