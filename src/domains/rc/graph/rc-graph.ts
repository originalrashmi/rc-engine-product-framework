/**
 * RC Method Graph Definition -- 8-phase build pipeline.
 *
 * Static topology: illuminate -> gate-1 -> define -> gate-2 -> architect ->
 * gate-3 -> sequence -> gate-4 -> validate -> gate-5 -> forge -> gate-6 ->
 * connect -> gate-7 -> compound -> gate-8
 *
 * Execute functions are injected by the coordinator to decouple graph
 * topology from domain business logic.
 */

import type { ProjectState } from '../types.js';
import { GraphBuilder } from '../../../core/graph/builder.js';
import type { GraphDefinition, NodeExecuteFn } from '../../../core/graph/types.js';

/**
 * Node execute functions must be injected by the coordinator since they
 * depend on runtime services (LLM clients, file I/O, orchestrator).
 */
export interface RcNodeHandlers {
  illuminate: NodeExecuteFn<ProjectState>;
  define: NodeExecuteFn<ProjectState>;
  architect: NodeExecuteFn<ProjectState>;
  sequence: NodeExecuteFn<ProjectState>;
  validate: NodeExecuteFn<ProjectState>;
  forge: NodeExecuteFn<ProjectState>;
  connect: NodeExecuteFn<ProjectState>;
  compound: NodeExecuteFn<ProjectState>;
}

/** Phase definitions in pipeline order. */
const PHASES = [
  { id: 'illuminate', name: 'Step 1: Discovery', gate: 1 },
  { id: 'define', name: 'Step 2: Requirements', gate: 2 },
  { id: 'architect', name: 'Step 3: Architecture', gate: 3 },
  { id: 'sequence', name: 'Step 4: Task Planning', gate: 4 },
  { id: 'validate', name: 'Step 5: Quality Checks', gate: 5 },
  { id: 'forge', name: 'Step 6: Build', gate: 6 },
  { id: 'connect', name: 'Step 7: Integration', gate: 7 },
  { id: 'compound', name: 'Step 8: Production Hardening', gate: 8 },
] as const;

/**
 * Build the RC Method pipeline graph.
 *
 * Every phase is an action node followed by a gate node.
 * The graph is static -- same topology for every project.
 */
export function buildRcGraph(handlers: RcNodeHandlers): GraphDefinition<ProjectState> {
  const builder = new GraphBuilder<ProjectState>('rc-method', 'RC Method Pipeline');

  const handlerMap: Record<string, NodeExecuteFn<ProjectState>> = {
    illuminate: handlers.illuminate,
    define: handlers.define,
    architect: handlers.architect,
    sequence: handlers.sequence,
    validate: handlers.validate,
    forge: handlers.forge,
    connect: handlers.connect,
    compound: handlers.compound,
  };

  let previousNodeId: string | null = null;

  for (const phase of PHASES) {
    // Action node for this phase
    builder.addNode({
      id: phase.id,
      name: phase.name,
      type: 'action',
      execute: handlerMap[phase.id],
      meta: { phase: phase.gate },
    });

    // Gate node after this phase
    const gateId = `gate-${phase.gate}`;
    builder.addNode({
      id: gateId,
      name: `Gate ${phase.gate}: ${phase.name.split(':')[0]} Review`,
      type: 'gate',
    });

    // Wire edges
    if (previousNodeId) {
      builder.addEdge(previousNodeId, phase.id);
    }
    builder.addEdge(phase.id, gateId);
    previousNodeId = gateId;
  }

  builder.setEntry('illuminate');
  return builder.build();
}
