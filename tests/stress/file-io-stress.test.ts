/**
 * Stress Test: File I/O & Checkpoint Store
 *
 * Verifies that SQLite checkpoint store, input limits, and state
 * operations handle high-throughput and edge cases correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';
import { checkInputSize, checkInputs, DEFAULT_LIMITS } from '../../src/core/sandbox/input-limits.js';
import type { InputLimitConfig } from '../../src/core/sandbox/input-limits.js';

// Flexible schema for stress test state
const StressStateSchema = z.record(z.unknown());

describe('File I/O stress tests', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new CheckpointStore(':memory:');
  });

  afterEach(() => {
    store?.close();
  });

  it('should handle 100 rapid checkpoint save/load cycles', () => {
    for (let i = 0; i < 100; i++) {
      const state = {
        counter: i,
        phase: `phase-${i % 8}`,
        tasks: Array.from({ length: 5 }, (_, j) => ({
          id: `TASK-${j}`,
          status: j < i % 5 ? 'complete' : 'pending',
        })),
      };

      store.save('stress-pipe', `node-${i % 10}`, state);
    }

    // Verify latest state is accessible for each node
    for (let n = 0; n < 10; n++) {
      const checkpoint = store.load('stress-pipe', `node-${n}`, StressStateSchema);
      expect(checkpoint.state).toBeDefined();
      expect(checkpoint.nodeId).toBe(`node-${n}`);
    }
  });

  it('should handle large state objects (50-task project)', () => {
    const largeState = {
      projectName: 'mega-project',
      currentPhase: 6,
      tasks: Array.from({ length: 50 }, (_, i) => ({
        taskId: `TASK-${String(i + 1).padStart(3, '0')}`,
        title: `Implement feature ${i + 1} with comprehensive requirements`,
        status: i < 25 ? 'complete' : 'pending',
        dependencies: Array.from({ length: Math.min(i, 5) }, (_, j) => `TASK-${String(j + 1).padStart(3, '0')}`),
        forgeResult:
          i < 25
            ? {
                generatedFiles: [`src/features/feature-${i}/index.ts`, `src/features/feature-${i}/types.ts`],
                tokenCount: 5000 + i * 100,
                costUsd: 0.05 + i * 0.01,
              }
            : null,
      })),
      gates: Array.from({ length: 5 }, (_, i) => ({
        phase: i + 1,
        decision: 'approve',
        feedback: `Phase ${i + 1} approved`,
        timestamp: new Date().toISOString(),
      })),
      artifacts: Array.from({ length: 10 }, (_, i) => `rc-method/artifact-${i}.md`),
    };

    store.save('large-project', 'full-state', largeState);

    const checkpoint = store.load('large-project', 'full-state', StressStateSchema);
    const loaded = checkpoint.state as typeof largeState;
    expect(loaded.tasks).toHaveLength(50);
    expect(loaded.tasks[0].taskId).toBe('TASK-001');
    expect(loaded.tasks[49].taskId).toBe('TASK-050');
    expect(loaded.gates).toHaveLength(5);
  });

  it('should handle concurrent checkpoint writes to different pipelines', () => {
    for (let p = 0; p < 20; p++) {
      for (let v = 0; v < 5; v++) {
        store.save(`pipeline-${p}`, 'main', { pipeline: p, version: v, data: `data-${p}-${v}` });
      }
    }

    for (let p = 0; p < 20; p++) {
      const checkpoint = store.load(`pipeline-${p}`, 'main', StressStateSchema);
      const state = checkpoint.state as { pipeline: number; version: number };
      expect(state.pipeline).toBe(p);
      expect(state.version).toBe(4); // last saved was v=4
    }
  });

  it('should handle version history queries correctly under load', () => {
    // Save 30 versions to same node
    for (let v = 0; v < 30; v++) {
      store.save('history-test', 'evolving-node', { iteration: v });
    }

    // Latest should be the last one
    const latest = store.load('history-test', 'evolving-node', StressStateSchema);
    expect((latest.state as { iteration: number }).iteration).toBe(29);
    expect(latest.version).toBe(30); // versions are 1-indexed

    // List with limit
    const listed = store.list({ pipelineId: 'history-test', nodeId: 'evolving-node', limit: 5 });
    expect(listed).toHaveLength(5);

    // Query specific version
    const v10 = store.loadVersion('history-test', 'evolving-node', 10, StressStateSchema);
    expect((v10.state as { iteration: number }).iteration).toBe(9); // 0-indexed state, 1-indexed version
  });

  it('should handle input near size limits correctly', () => {
    // Just under the limit
    const justUnder = 'a'.repeat(9_999);
    const resultUnder = checkInputSize(justUnder, DEFAULT_LIMITS.brief);
    expect(resultUnder.valid).toBe(true);
    expect(resultUnder.truncated).toBe(false);

    // Exactly at the limit
    const atLimit = 'b'.repeat(10_000);
    const resultAt = checkInputSize(atLimit, DEFAULT_LIMITS.brief);
    expect(resultAt.valid).toBe(true);

    // Just over the limit
    const justOver = 'c'.repeat(10_001);
    const resultOver = checkInputSize(justOver, DEFAULT_LIMITS.brief);
    expect(resultOver.valid).toBe(false);
    expect(resultOver.originalLength).toBe(10_001);

    // Truncation mode
    const resultTruncated = checkInputSize(justOver, DEFAULT_LIMITS.brief, true);
    expect(resultTruncated.valid).toBe(true);
    expect(resultTruncated.truncated).toBe(true);
    expect(resultTruncated.value.length).toBe(10_000);
  });

  it('should handle very large inputs without hanging', () => {
    const hugeInput = 'z'.repeat(1_000_000);

    const start = Date.now();
    const result = checkInputSize(hugeInput, DEFAULT_LIMITS.brief);
    const elapsed = Date.now() - start;

    expect(result.valid).toBe(false);
    expect(result.originalLength).toBe(1_000_000);
    expect(elapsed).toBeLessThan(100);
  });

  it('should handle batch validation with mixed field types', () => {
    const fields: Record<string, { value: string; config: InputLimitConfig }> = {
      brief: { value: 'short', config: DEFAULT_LIMITS.brief },
      requirements: { value: 'x'.repeat(45_000), config: DEFAULT_LIMITS.requirements },
      code_context: { value: 'y'.repeat(90_000), config: DEFAULT_LIMITS.codeContext },
      feedback: { value: 'z'.repeat(4_000), config: DEFAULT_LIMITS.feedback },
    };

    const result = checkInputs(fields);
    expect(result.valid).toBe(true);

    // Now make one field exceed its limit
    fields.feedback = { value: 'w'.repeat(6_000), config: DEFAULT_LIMITS.feedback };
    const failResult = checkInputs(fields);
    expect(failResult.valid).toBe(false);
    expect(failResult.results.feedback.valid).toBe(false);
    expect(failResult.results.brief.valid).toBe(true);
  });

  it('should handle empty and edge-case inputs', () => {
    const empty = checkInputSize('', DEFAULT_LIMITS.brief);
    expect(empty.valid).toBe(true);
    expect(empty.originalLength).toBe(0);

    // Unicode characters
    const unicode = '\u{1F389}'.repeat(5_000);
    const unicodeResult = checkInputSize(unicode, DEFAULT_LIMITS.brief);
    // JS string length counts UTF-16 code units, emoji = 2 code units
    expect(unicodeResult.originalLength).toBe(10_000);

    // Newline-heavy input
    const newlines = '\n'.repeat(10_001);
    const nlResult = checkInputSize(newlines, DEFAULT_LIMITS.brief);
    expect(nlResult.valid).toBe(false);
  });

  it('should handle checkpoint store with various state shapes', () => {
    // Empty object
    store.save('shapes', 'empty', {});
    const emptyCheckpoint = store.load('shapes', 'empty', StressStateSchema);
    expect(emptyCheckpoint.state).toEqual({});

    // Nested objects
    store.save('shapes', 'nested', {
      a: { b: { c: { d: 'deep' } } },
      arr: [1, [2, [3]]],
    });
    const nestedCheckpoint = store.load('shapes', 'nested', StressStateSchema);
    expect((nestedCheckpoint.state as Record<string, unknown>).a).toEqual({ b: { c: { d: 'deep' } } });

    // Null values
    store.save('shapes', 'nulls', {
      nullVal: null,
      emptyString: '',
      zero: 0,
      falseVal: false,
    });
    const nullCheckpoint = store.load('shapes', 'nulls', StressStateSchema);
    const nullState = nullCheckpoint.state as Record<string, unknown>;
    expect(nullState.nullVal).toBeNull();
    expect(nullState.emptyString).toBe('');
    expect(nullState.zero).toBe(0);
    expect(nullState.falseVal).toBe(false);
  });

  it('should handle metadata on checkpoints', () => {
    store.save(
      'meta-test',
      'node-1',
      { value: 1 },
      {
        duration_ms: 1500,
        tokens_used: 5000,
        provider: 'claude',
      },
    );

    const checkpoint = store.load('meta-test', 'node-1', StressStateSchema);
    expect(checkpoint.metadata).toBeDefined();
    expect(checkpoint.metadata?.duration_ms).toBe(1500);
    expect(checkpoint.metadata?.provider).toBe('claude');
  });
});
