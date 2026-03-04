/**
 * Tests for the shared CheckpointStore factory and pipeline ID derivation.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { derivePipelineId, NODE_IDS } from '../../src/shared/state/pipeline-id.js';
import { getProjectStore, closeProjectStore, closeAllStores } from '../../src/shared/state/store-factory.js';

const TestSchema = z.object({ value: z.number() });

// Use :memory: paths -- store-factory creates file-based stores by default,
// but we can test the singleton behavior by using tmp dirs.
// For unit tests we test pipeline-id directly and mock-free store-factory behavior.

describe('derivePipelineId', () => {
  it('returns a 22-character base64url string', () => {
    const id = derivePipelineId('/home/user/project');
    expect(id).toHaveLength(22);
    // base64url characters only
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic -- same path gives same ID', () => {
    const a = derivePipelineId('/some/project/path');
    const b = derivePipelineId('/some/project/path');
    expect(a).toBe(b);
  });

  it('produces different IDs for different paths', () => {
    const a = derivePipelineId('/project/alpha');
    const b = derivePipelineId('/project/beta');
    expect(a).not.toBe(b);
  });

  it('handles edge-case paths', () => {
    const root = derivePipelineId('/');
    const long = derivePipelineId('/a/very/deeply/nested/project/path/that/goes/on/forever');
    const unicode = derivePipelineId('/home/用户/项目');

    expect(root).toHaveLength(22);
    expect(long).toHaveLength(22);
    expect(unicode).toHaveLength(22);

    // All unique
    expect(new Set([root, long, unicode]).size).toBe(3);
  });
});

describe('NODE_IDS', () => {
  it('has the expected domain node IDs', () => {
    expect(NODE_IDS.PRE_RC_STATE).toBe('pre-rc:state');
    expect(NODE_IDS.RC_STATE).toBe('rc:state');
    expect(NODE_IDS.POST_RC_STATE).toBe('post-rc:state');
    expect(NODE_IDS.TRACEABILITY).toBe('traceability:matrix');
  });

  it('all node IDs are unique', () => {
    const values = Object.values(NODE_IDS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('getProjectStore', () => {
  const tmpDir = '/tmp/rc-engine-test-store-factory-' + Date.now();

  afterEach(() => {
    closeAllStores();
  });

  it('returns a store and pipelineId for a project path', () => {
    const { store, pipelineId } = getProjectStore(tmpDir);
    expect(store).toBeDefined();
    expect(pipelineId).toBe(derivePipelineId(tmpDir));
  });

  it('returns the same store instance for repeated calls (singleton)', () => {
    const first = getProjectStore(tmpDir);
    const second = getProjectStore(tmpDir);
    expect(first.store).toBe(second.store);
    expect(first.pipelineId).toBe(second.pipelineId);
  });

  it('returns different stores for different paths', () => {
    const a = getProjectStore(tmpDir + '/project-a');
    const b = getProjectStore(tmpDir + '/project-b');
    expect(a.store).not.toBe(b.store);
    expect(a.pipelineId).not.toBe(b.pipelineId);
  });

  it('can save and load through the factory-provided store', () => {
    const { store, pipelineId } = getProjectStore(tmpDir);
    store.save(pipelineId, 'test:node', { value: 42 });

    const checkpoint = store.load(pipelineId, 'test:node', TestSchema);
    expect(checkpoint.state.value).toBe(42);
  });
});

describe('closeProjectStore', () => {
  const tmpDir = '/tmp/rc-engine-test-close-' + Date.now();

  afterEach(() => {
    closeAllStores();
  });

  it('removes the store from cache so next call creates a new instance', () => {
    const first = getProjectStore(tmpDir);
    closeProjectStore(tmpDir);
    const second = getProjectStore(tmpDir);
    expect(first.store).not.toBe(second.store);
  });

  it('is a no-op for unknown paths', () => {
    expect(() => closeProjectStore('/nonexistent/path')).not.toThrow();
  });
});

describe('closeAllStores', () => {
  const tmpDir = '/tmp/rc-engine-test-closeall-' + Date.now();

  it('closes all cached stores', () => {
    const a = getProjectStore(tmpDir + '/a');
    const b = getProjectStore(tmpDir + '/b');
    closeAllStores();

    // After closeAll, new calls return fresh instances
    const a2 = getProjectStore(tmpDir + '/a');
    const b2 = getProjectStore(tmpDir + '/b');
    expect(a.store).not.toBe(a2.store);
    expect(b.store).not.toBe(b2.store);
  });
});
