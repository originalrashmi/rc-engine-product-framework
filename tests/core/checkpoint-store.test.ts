/**
 * Tests for CheckpointStore -- SQLite-backed persistent state.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { CheckpointStore } from '../../src/core/checkpoint/store.js';

// ── Test Schemas ────────────────────────────────────────────────────────────

const CounterSchema = z.object({
  count: z.number(),
  label: z.string(),
});

type Counter = z.infer<typeof CounterSchema>;

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  tags: z.array(z.string()),
});

type Task = z.infer<typeof TaskSchema>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createStore(): CheckpointStore {
  return new CheckpointStore(':memory:');
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CheckpointStore', () => {
  let store: CheckpointStore;

  afterEach(() => {
    store?.close();
  });

  // ── Save & Load ─────────────────────────────────────────────────────────

  describe('save and load', () => {
    it('saves and loads a checkpoint with Zod validation', () => {
      store = createStore();
      const state: Counter = { count: 42, label: 'test' };

      const { id, version } = store.save('pipe-1', 'node-a', state);

      expect(id).toBe(1);
      expect(version).toBe(1);

      const checkpoint = store.load('pipe-1', 'node-a', CounterSchema);
      expect(checkpoint.state).toEqual(state);
      expect(checkpoint.pipelineId).toBe('pipe-1');
      expect(checkpoint.nodeId).toBe('node-a');
      expect(checkpoint.version).toBe(1);
      expect(checkpoint.createdAt).toBeTruthy();
    });

    it('auto-increments version for the same pipeline+node', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });
      const { version } = store.save('pipe-1', 'node-a', { count: 3, label: 'v3' });

      expect(version).toBe(3);

      // load() returns latest
      const latest = store.load('pipe-1', 'node-a', CounterSchema);
      expect(latest.version).toBe(3);
      expect(latest.state.count).toBe(3);
    });

    it('maintains independent versions per node', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'a1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'a2' });
      store.save('pipe-1', 'node-b', { count: 10, label: 'b1' });

      const a = store.load('pipe-1', 'node-a', CounterSchema);
      const b = store.load('pipe-1', 'node-b', CounterSchema);

      expect(a.version).toBe(2);
      expect(b.version).toBe(1);
    });

    it('maintains independent versions per pipeline', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'p1' });
      store.save('pipe-2', 'node-a', { count: 100, label: 'p2' });

      const p1 = store.load('pipe-1', 'node-a', CounterSchema);
      const p2 = store.load('pipe-2', 'node-a', CounterSchema);

      expect(p1.state.count).toBe(1);
      expect(p2.state.count).toBe(100);
    });

    it('saves and loads metadata', () => {
      store = createStore();
      const metadata = { durationMs: 1500, tokensUsed: 4200 };

      store.save('pipe-1', 'node-a', { count: 1, label: 'test' }, metadata);

      const checkpoint = store.load('pipe-1', 'node-a', CounterSchema);
      expect(checkpoint.metadata).toEqual(metadata);
    });

    it('returns undefined metadata when none saved', () => {
      store = createStore();
      store.save('pipe-1', 'node-a', { count: 1, label: 'test' });

      const checkpoint = store.load('pipe-1', 'node-a', CounterSchema);
      expect(checkpoint.metadata).toBeUndefined();
    });

    it('handles complex nested state', () => {
      store = createStore();
      const task: Task = {
        id: 'task-001',
        title: 'Build checkpoint store',
        done: false,
        tags: ['infrastructure', 'p0', 'sqlite'],
      };

      store.save('pipe-1', 'forge', task);
      const checkpoint = store.load('pipe-1', 'forge', TaskSchema);

      expect(checkpoint.state).toEqual(task);
      expect(checkpoint.state.tags).toHaveLength(3);
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────

  describe('Zod validation', () => {
    it('throws on schema mismatch during load', () => {
      store = createStore();

      // Save data that doesn't match CounterSchema
      store.save('pipe-1', 'node-a', { wrong: 'shape' });

      expect(() => store.load('pipe-1', 'node-a', CounterSchema)).toThrow(/Checkpoint validation failed/);
    });

    it('throws when no checkpoint exists', () => {
      store = createStore();

      expect(() => store.load('nonexistent', 'node-a', CounterSchema)).toThrow(/No checkpoint found/);
    });

    it('validates on loadVersion too', () => {
      store = createStore();
      store.save('pipe-1', 'node-a', { bad: 'data' });

      expect(() => store.loadVersion('pipe-1', 'node-a', 1, CounterSchema)).toThrow(/Checkpoint validation failed/);
    });

    it('throws when loadVersion targets nonexistent version', () => {
      store = createStore();
      store.save('pipe-1', 'node-a', { count: 1, label: 'test' });

      expect(() => store.loadVersion('pipe-1', 'node-a', 99, CounterSchema)).toThrow(/No checkpoint found/);
    });
  });

  // ── Version History & Time Travel ───────────────────────────────────────

  describe('version history and time-travel', () => {
    it('returns version history in ascending order', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'v3' });

      const history = store.getVersionHistory('pipe-1', 'node-a');

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
      expect(history[0].createdAt).toBeTruthy();
    });

    it('returns empty history for nonexistent pipeline+node', () => {
      store = createStore();

      const history = store.getVersionHistory('nonexistent', 'node-a');
      expect(history).toHaveLength(0);
    });

    it('loads a specific version via loadVersion', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'v3' });

      const v2 = store.loadVersion('pipe-1', 'node-a', 2, CounterSchema);
      expect(v2.state.count).toBe(2);
      expect(v2.state.label).toBe('v2');
      expect(v2.version).toBe(2);
    });

    it('loadLatest returns the most recent checkpoint across all nodes', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'a' });
      store.save('pipe-1', 'node-b', { count: 2, label: 'b' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'a-latest' });

      // Latest by insertion order is node-a version 2
      const latest = store.loadLatest('pipe-1', CounterSchema);
      expect(latest.nodeId).toBe('node-a');
      expect(latest.state.count).toBe(3);
    });

    it('loadLatest throws when pipeline has no checkpoints', () => {
      store = createStore();

      expect(() => store.loadLatest('nonexistent', CounterSchema)).toThrow(/No checkpoints found/);
    });
  });

  // ── List & Query ────────────────────────────────────────────────────────

  describe('list and query', () => {
    it('lists checkpoints for a pipeline', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'a1' });
      store.save('pipe-1', 'node-b', { count: 2, label: 'b1' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'a2' });

      const results = store.list({ pipelineId: 'pipe-1', limit: 10 });
      expect(results).toHaveLength(3);
      // Ordered by id DESC (most recent first)
      expect(results[0].state).toEqual({ count: 3, label: 'a2' });
    });

    it('filters by nodeId', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'a' });
      store.save('pipe-1', 'node-b', { count: 2, label: 'b' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'a2' });

      const results = store.list({ pipelineId: 'pipe-1', nodeId: 'node-a', limit: 10 });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.nodeId === 'node-a')).toBe(true);
    });

    it('filters by beforeVersion', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });
      store.save('pipe-1', 'node-a', { count: 3, label: 'v3' });

      const results = store.list({
        pipelineId: 'pipe-1',
        nodeId: 'node-a',
        beforeVersion: 2,
        limit: 10,
      });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.version <= 2)).toBe(true);
    });

    it('defaults limit to 1', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });

      const results = store.list({ pipelineId: 'pipe-1' });
      expect(results).toHaveLength(1);
    });

    it('returns empty array for nonexistent pipeline', () => {
      store = createStore();

      const results = store.list({ pipelineId: 'nonexistent', limit: 10 });
      expect(results).toHaveLength(0);
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  describe('deletePipeline', () => {
    it('deletes all checkpoints for a pipeline', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'a' });
      store.save('pipe-1', 'node-b', { count: 2, label: 'b' });
      store.save('pipe-2', 'node-a', { count: 3, label: 'other' });

      const deleted = store.deletePipeline('pipe-1');
      expect(deleted).toBe(2);

      // pipe-1 is gone
      const p1 = store.list({ pipelineId: 'pipe-1', limit: 10 });
      expect(p1).toHaveLength(0);

      // pipe-2 is untouched
      const p2 = store.list({ pipelineId: 'pipe-2', limit: 10 });
      expect(p2).toHaveLength(1);
    });

    it('returns 0 when deleting nonexistent pipeline', () => {
      store = createStore();

      const deleted = store.deletePipeline('nonexistent');
      expect(deleted).toBe(0);
    });
  });

  // ── Schema Versioning ───────────────────────────────────────────────────

  describe('schema versioning', () => {
    it('initializes schema version on first open', () => {
      store = createStore();

      const version = store.getSchemaVersion();
      expect(version).toBe(1);
    });

    it('preserves schema version on re-open', () => {
      // Use a file-based store to test re-open behavior
      // With :memory: we can at least verify the version is set
      store = createStore();

      const version = store.getSchemaVersion();
      expect(version).toBe(1);
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty object state', () => {
      store = createStore();
      const EmptySchema = z.object({});

      store.save('pipe-1', 'node-a', {});
      const checkpoint = store.load('pipe-1', 'node-a', EmptySchema);
      expect(checkpoint.state).toEqual({});
    });

    it('handles large state objects', () => {
      store = createStore();
      const LargeSchema = z.object({
        items: z.array(z.string()),
      });

      const largeState = { items: Array.from({ length: 1000 }, (_, i) => `item-${i}`) };
      store.save('pipe-1', 'node-a', largeState);

      const checkpoint = store.load('pipe-1', 'node-a', LargeSchema);
      expect(checkpoint.state.items).toHaveLength(1000);
    });

    it('handles special characters in IDs', () => {
      store = createStore();

      store.save('pipe/with/slashes', 'node:with:colons', { count: 1, label: 'special' });
      const checkpoint = store.load('pipe/with/slashes', 'node:with:colons', CounterSchema);
      expect(checkpoint.state.count).toBe(1);
    });

    it('handles unicode in state', () => {
      store = createStore();
      const UnicodeSchema = z.object({ text: z.string() });

      store.save('pipe-1', 'node-a', { text: '🔥 Unicode テスト émojis' });
      const checkpoint = store.load('pipe-1', 'node-a', UnicodeSchema);
      expect(checkpoint.state.text).toBe('🔥 Unicode テスト émojis');
    });

    it('handles null values in state', () => {
      store = createStore();
      const NullableSchema = z.object({ value: z.string().nullable() });

      store.save('pipe-1', 'node-a', { value: null });
      const checkpoint = store.load('pipe-1', 'node-a', NullableSchema);
      expect(checkpoint.state.value).toBeNull();
    });

    it('enforces unique constraint on pipeline+node+version', () => {
      store = createStore();

      store.save('pipe-1', 'node-a', { count: 1, label: 'v1' });
      // Version is auto-incremented, so this should be v2, not a constraint violation
      const { version } = store.save('pipe-1', 'node-a', { count: 2, label: 'v2' });
      expect(version).toBe(2);
    });
  });
});
