/**
 * Tests for domain graph definitions -- verify topology builds without errors
 * and has the expected structure (nodes, edges, gates).
 */

import { describe, it, expect } from 'vitest';
import { buildPreRcGraph } from '../../src/domains/pre-rc/graph/pre-rc-graph.js';
import { buildRcGraph } from '../../src/domains/rc/graph/rc-graph.js';
import { buildPostRcGraph } from '../../src/domains/post-rc/graph/postrc-graph.js';
import type { ResearchState } from '../../src/domains/pre-rc/types.js';
import type { ProjectState } from '../../src/domains/rc/types.js';
import type { PostRCState } from '../../src/domains/post-rc/types.js';
import type { NodeResult } from '../../src/core/graph/types.js';

// ── Stub handlers (no-op) ──────────────────────────────────────────────────

const noopPreRcHandlers = {
  classify: async (s: ResearchState): Promise<NodeResult<ResearchState>> => ({ state: s }),
  runStage:
    () =>
    async (s: ResearchState): Promise<NodeResult<ResearchState>> => ({ state: s }),
  synthesize: async (s: ResearchState): Promise<NodeResult<ResearchState>> => ({ state: s }),
};

const noopRcHandlers = {
  illuminate: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  define: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  architect: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  sequence: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  validate: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  forge: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  connect: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
  compound: async (s: ProjectState): Promise<NodeResult<ProjectState>> => ({ state: s }),
};

const noopPostRcHandlers = {
  scanSecurity: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  scanMonitoring: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  scanLegalClaims: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  scanLegalProduct: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  scanEdgeCase: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  scanAppSecurity: async (s: PostRCState): Promise<NodeResult<PostRCState>> => ({ state: s }),
  mergeScans: (_states: PostRCState[], original: PostRCState): PostRCState => original,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Pre-RC Graph Definition', () => {
  it('builds without errors', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    expect(graph.id).toBe('pre-rc-pipeline');
    expect(graph.entryNodeId).toBe('classify');
  });

  it('has classify as entry node', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    const entry = graph.nodes.find((n) => n.id === graph.entryNodeId);
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('action');
  });

  it('contains 3 gate nodes', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    const gates = graph.nodes.filter((n) => n.type === 'gate');
    expect(gates).toHaveLength(3);
    expect(gates.map((g) => g.id).sort()).toEqual(['gate-1', 'gate-2', 'gate-3']);
  });

  it('contains 6 stage nodes with skip-and-continue error strategy', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    const stages = graph.nodes.filter((n) => n.id.startsWith('stage-'));
    expect(stages).toHaveLength(6);
    for (const stage of stages) {
      expect(stage.errorStrategy).toBe('skip-and-continue');
    }
  });

  it('has a synthesize node', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    const synth = graph.nodes.find((n) => n.id === 'synthesize');
    expect(synth).toBeDefined();
    expect(synth!.type).toBe('action');
  });

  it('has correct total node count (1 classify + 6 stages + 3 gates + 1 synthesize)', () => {
    const graph = buildPreRcGraph(noopPreRcHandlers);
    expect(graph.nodes).toHaveLength(11);
  });
});

describe('RC Method Graph Definition', () => {
  it('builds without errors', () => {
    const graph = buildRcGraph(noopRcHandlers);
    expect(graph.id).toBe('rc-method');
    expect(graph.entryNodeId).toBe('illuminate');
  });

  it('has 8 phase action nodes', () => {
    const graph = buildRcGraph(noopRcHandlers);
    const phases = graph.nodes.filter((n) => n.type === 'action');
    expect(phases).toHaveLength(8);
    expect(phases.map((p) => p.id)).toEqual([
      'illuminate',
      'define',
      'architect',
      'sequence',
      'validate',
      'forge',
      'connect',
      'compound',
    ]);
  });

  it('has 8 gate nodes (one per phase)', () => {
    const graph = buildRcGraph(noopRcHandlers);
    const gates = graph.nodes.filter((n) => n.type === 'gate');
    expect(gates).toHaveLength(8);
  });

  it('has correct total node count (8 phases + 8 gates)', () => {
    const graph = buildRcGraph(noopRcHandlers);
    expect(graph.nodes).toHaveLength(16);
  });

  it('alternates phase -> gate in edge structure', () => {
    const graph = buildRcGraph(noopRcHandlers);
    // Each phase should have an edge to its gate
    const phaseIds = ['illuminate', 'define', 'architect', 'sequence', 'validate', 'forge', 'connect', 'compound'];
    for (let i = 0; i < phaseIds.length; i++) {
      const phaseId = phaseIds[i];
      const gateId = `gate-${i + 1}`;
      const edge = graph.edges.find((e) => e.from === phaseId && e.to === gateId);
      expect(edge, `Expected edge from ${phaseId} to ${gateId}`).toBeDefined();
    }
  });
});

describe('Post-RC Graph Definition', () => {
  it('builds without errors', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    expect(graph.id).toBe('post-rc-pipeline');
    expect(graph.entryNodeId).toBe('scan-fanout');
  });

  it('has fan-out and fan-in nodes', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const fanOut = graph.nodes.find((n) => n.type === 'fan-out');
    const fanIn = graph.nodes.find((n) => n.type === 'fan-in');
    expect(fanOut).toBeDefined();
    expect(fanIn).toBeDefined();
    expect(fanOut!.id).toBe('scan-fanout');
    expect(fanIn!.id).toBe('scan-fanin');
  });

  it('has 6 parallel scan nodes', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const scans = graph.nodes.filter((n) => n.type === 'action');
    expect(scans).toHaveLength(6);
    expect(scans.map((s) => s.id).sort()).toEqual([
      'scan-app-security',
      'scan-edge-case',
      'scan-legal-claims',
      'scan-legal-product',
      'scan-monitoring',
      'scan-security',
    ]);
  });

  it('has a ship gate', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const gates = graph.nodes.filter((n) => n.type === 'gate');
    expect(gates).toHaveLength(1);
    expect(gates[0].id).toBe('ship-gate');
  });

  it('scan nodes have skip-and-continue error strategy', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const scans = graph.nodes.filter((n) => n.type === 'action');
    for (const scan of scans) {
      expect(scan.errorStrategy).toBe('skip-and-continue');
    }
  });

  it('fan-out edges connect to all scan modules', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const fanOutEdges = graph.edges.filter((e) => e.from === 'scan-fanout');
    expect(fanOutEdges).toHaveLength(6);
    expect(fanOutEdges.map((e) => e.to).sort()).toEqual([
      'scan-app-security',
      'scan-edge-case',
      'scan-legal-claims',
      'scan-legal-product',
      'scan-monitoring',
      'scan-security',
    ]);
  });

  it('all scan modules connect to fan-in', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    const fanInEdges = graph.edges.filter((e) => e.to === 'scan-fanin');
    expect(fanInEdges).toHaveLength(6);
    expect(fanInEdges.map((e) => e.from).sort()).toEqual([
      'scan-app-security',
      'scan-edge-case',
      'scan-legal-claims',
      'scan-legal-product',
      'scan-monitoring',
      'scan-security',
    ]);
  });

  it('has correct total node count (1 fan-out + 6 scans + 1 fan-in + 1 gate)', () => {
    const graph = buildPostRcGraph(noopPostRcHandlers);
    expect(graph.nodes).toHaveLength(9);
  });
});
