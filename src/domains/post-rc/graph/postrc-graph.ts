/**
 * Post-RC Graph Definition -- validation pipeline.
 *
 * Topology: scan-fanout -> [security, monitoring, legal-claims, legal-product, edge-case, app-security] -> scan-fanin ->
 * ship-gate
 *
 * Parallelizes scan modules via fan-out/fan-in.
 * Execute functions are injected by the coordinator.
 */

import type { PostRCState } from '../types.js';
import { GraphBuilder } from '../../../core/graph/builder.js';
import type { GraphDefinition, NodeExecuteFn } from '../../../core/graph/types.js';

/**
 * Node execute functions must be injected by the coordinator.
 */
export interface PostRcNodeHandlers {
  scanSecurity: NodeExecuteFn<PostRCState>;
  scanMonitoring: NodeExecuteFn<PostRCState>;
  scanLegalClaims: NodeExecuteFn<PostRCState>;
  scanLegalProduct: NodeExecuteFn<PostRCState>;
  scanEdgeCase: NodeExecuteFn<PostRCState>;
  scanAppSecurity: NodeExecuteFn<PostRCState>;
  mergeScans: (states: PostRCState[], original: PostRCState) => PostRCState;
}

/**
 * Build the Post-RC validation pipeline graph.
 *
 * Security and monitoring modules run in parallel (fan-out/fan-in),
 * followed by a gate for the ship/no-ship decision.
 */
export function buildPostRcGraph(handlers: PostRcNodeHandlers): GraphDefinition<PostRCState> {
  const builder = new GraphBuilder<PostRCState>('post-rc-pipeline', 'Post-RC Validation Pipeline');

  // Fan-out: dispatch to parallel scan modules
  builder.addNode({
    id: 'scan-fanout',
    name: 'Dispatch Scan Modules',
    type: 'fan-out',
  });

  // Parallel scan modules
  builder.addNode({
    id: 'scan-security',
    name: 'Security Scan',
    type: 'action',
    execute: handlers.scanSecurity,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  builder.addNode({
    id: 'scan-monitoring',
    name: 'Monitoring Scan',
    type: 'action',
    execute: handlers.scanMonitoring,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  // Legal scan modules (Pro tier)
  builder.addNode({
    id: 'scan-legal-claims',
    name: 'Legal Claims Audit',
    type: 'action',
    execute: handlers.scanLegalClaims,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  builder.addNode({
    id: 'scan-legal-product',
    name: 'Product Legal Audit',
    type: 'action',
    execute: handlers.scanLegalProduct,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  // Edge case analysis module (Pro tier)
  builder.addNode({
    id: 'scan-edge-case',
    name: 'Edge Case Analysis',
    type: 'action',
    execute: handlers.scanEdgeCase,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  // Application security auditor
  builder.addNode({
    id: 'scan-app-security',
    name: 'Application Security Audit',
    type: 'action',
    execute: handlers.scanAppSecurity,
    errorStrategy: 'skip-and-continue',
    retry: { maxRetries: 1, baseDelayMs: 2000 },
  });

  // Fan-in: merge parallel results
  builder.addNode({
    id: 'scan-fanin',
    name: 'Merge Scan Results',
    type: 'fan-in',
    merge: handlers.mergeScans,
  });

  // Ship gate
  builder.addNode({
    id: 'ship-gate',
    name: 'Ship Decision Gate',
    type: 'gate',
  });

  // Edges
  builder.addEdge('scan-fanout', 'scan-security');
  builder.addEdge('scan-fanout', 'scan-monitoring');
  builder.addEdge('scan-fanout', 'scan-legal-claims');
  builder.addEdge('scan-fanout', 'scan-legal-product');
  builder.addEdge('scan-fanout', 'scan-edge-case');
  builder.addEdge('scan-fanout', 'scan-app-security');
  builder.addEdge('scan-security', 'scan-fanin');
  builder.addEdge('scan-monitoring', 'scan-fanin');
  builder.addEdge('scan-legal-claims', 'scan-fanin');
  builder.addEdge('scan-legal-product', 'scan-fanin');
  builder.addEdge('scan-edge-case', 'scan-fanin');
  builder.addEdge('scan-app-security', 'scan-fanin');
  builder.addEdge('scan-fanin', 'ship-gate');

  builder.setEntry('scan-fanout');
  return builder.build();
}
