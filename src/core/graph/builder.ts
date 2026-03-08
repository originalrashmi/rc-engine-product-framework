/**
 * Graph Builder - Fluent API for constructing validated GraphDefinitions.
 *
 * Usage:
 *   const graph = new GraphBuilder<MyState>('my-pipeline', 'My Pipeline')
 *     .addNode({ id: 'start', name: 'Start', type: 'action', execute: startFn })
 *     .addNode({ id: 'gate1', name: 'Gate 1', type: 'gate' })
 *     .addNode({ id: 'end', name: 'End', type: 'action', execute: endFn })
 *     .addEdge('start', 'gate1')
 *     .addEdge('gate1', 'end')
 *     .setEntry('start')
 *     .build();
 */

import type { GraphNode, GraphEdge, GraphDefinition, EdgeCondition } from './types.js';

export class GraphBuilder<S> {
  private nodes: Map<string, GraphNode<S>> = new Map();
  private edges: GraphEdge<S>[] = [];
  private entryNodeId: string | null = null;

  constructor(
    private readonly id: string,
    private readonly name: string,
  ) {}

  /** Add a node to the graph. Throws if duplicate ID. */
  addNode(node: GraphNode<S>): this {
    if (this.nodes.has(node.id)) {
      throw new Error(`Duplicate node ID: "${node.id}"`);
    }
    this.nodes.set(node.id, node);
    return this;
  }

  /** Add an unconditional edge between two nodes. */
  addEdge(from: string, to: string): this {
    this.edges.push({ from, to });
    return this;
  }

  /** Add a conditional edge between two nodes. */
  addConditionalEdge(from: string, to: string, condition: EdgeCondition<S>): this {
    this.edges.push({ from, to, condition });
    return this;
  }

  /** Set the entry node ID (where execution starts). */
  setEntry(nodeId: string): this {
    this.entryNodeId = nodeId;
    return this;
  }

  /**
   * Validate and build the GraphDefinition.
   *
   * Validation rules:
   * 1. Entry node must be set and must exist
   * 2. All edge endpoints must reference existing nodes
   * 3. Fan-in nodes must have a merge function
   * 4. Fallback nodes must exist when error strategy is 'fallback'
   * 5. At least one node must exist
   */
  build(): GraphDefinition<S> {
    // Must have nodes
    if (this.nodes.size === 0) {
      throw new Error('Graph must have at least one node');
    }

    // Entry node must be set
    if (!this.entryNodeId) {
      throw new Error('Entry node must be set via setEntry()');
    }

    // Entry node must exist
    if (!this.nodes.has(this.entryNodeId)) {
      throw new Error(`Entry node "${this.entryNodeId}" does not exist`);
    }

    // Validate all edge endpoints
    for (const edge of this.edges) {
      if (!this.nodes.has(edge.from)) {
        throw new Error(`Edge references non-existent source node: "${edge.from}"`);
      }
      if (!this.nodes.has(edge.to)) {
        throw new Error(`Edge references non-existent target node: "${edge.to}"`);
      }
    }

    // Fan-in nodes must have merge
    for (const node of this.nodes.values()) {
      if (node.type === 'fan-in' && !node.merge) {
        throw new Error(`Fan-in node "${node.id}" must have a merge function`);
      }
    }

    // Fallback nodes must exist
    for (const node of this.nodes.values()) {
      if (node.errorStrategy === 'fallback' && node.fallbackNodeId) {
        if (!this.nodes.has(node.fallbackNodeId)) {
          throw new Error(`Fallback node "${node.fallbackNodeId}" for node "${node.id}" does not exist`);
        }
      }
    }

    return {
      id: this.id,
      name: this.name,
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
      entryNodeId: this.entryNodeId,
    };
  }
}
