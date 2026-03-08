/**
 * Pre-RC Graph Definition - dynamic research pipeline.
 *
 * Built after classification from the persisted personaSelection.
 * Topology: classify -> gate-1 -> [stage-1..6 with gates 2,3] -> synthesize
 *
 * Each stage is a fan-out over active personas for that stage, with
 * fan-in merging results back into the shared state.
 */

import type { ResearchState } from '../types.js';
import { ResearchStage } from '../types.js';
import { GraphBuilder } from '../../../core/graph/builder.js';
import type { GraphDefinition, NodeExecuteFn } from '../../../core/graph/types.js';

/** All 6 research stages in pipeline order. */
const STAGE_ORDER: ResearchStage[] = [
  ResearchStage.MetaOrchestration,
  ResearchStage.UserIntelligence,
  ResearchStage.BusinessMarket,
  ResearchStage.Technical,
  ResearchStage.UXCognitive,
  ResearchStage.Validation,
];

/** Gates fire after these stages. */
const GATE_AFTER_STAGE: Partial<Record<ResearchStage, number>> = {
  [ResearchStage.MetaOrchestration]: 1, // Gate 1: after classification
  [ResearchStage.Technical]: 2, // Gate 2: after stages 1-4
  [ResearchStage.UXCognitive]: 3, // Gate 3: after stages 1-5
};

/**
 * Node execute functions must be injected by the coordinator since they
 * depend on runtime services (LLM clients, file I/O, persona agents).
 *
 * This interface defines what the coordinator must provide.
 */
export interface PreRcNodeHandlers {
  classify: NodeExecuteFn<ResearchState>;
  runStage: (stage: ResearchStage) => NodeExecuteFn<ResearchState>;
  synthesize: NodeExecuteFn<ResearchState>;
  /** Optional: Idea Stress Test runs after synthesis (Pro/Enterprise only). */
  stressTest?: NodeExecuteFn<ResearchState>;
}

/**
 * Build the Pre-RC research pipeline graph.
 *
 * The graph is static in topology but the execute functions are injected,
 * allowing the coordinator to wire in the actual domain logic.
 */
export function buildPreRcGraph(handlers: PreRcNodeHandlers): GraphDefinition<ResearchState> {
  const builder = new GraphBuilder<ResearchState>('pre-rc-pipeline', 'Pre-RC Research Pipeline');

  // Entry: classification
  builder.addNode({
    id: 'classify',
    name: 'Classify Product Complexity',
    type: 'action',
    execute: handlers.classify,
  });

  // Gate 1: post-classification approval
  builder.addNode({
    id: 'gate-1',
    name: 'Gate 1: Classification Review',
    type: 'gate',
  });

  builder.addEdge('classify', 'gate-1');

  // Stages 1-6 with gates after stages 1, 4, 5
  let previousNodeId = 'gate-1';

  for (const stage of STAGE_ORDER) {
    const stageId = stage; // e.g. 'stage-1-meta'

    builder.addNode({
      id: stageId,
      name: `Research: ${stage}`,
      type: 'action',
      execute: handlers.runStage(stage),
      errorStrategy: 'skip-and-continue',
      retry: { maxRetries: 1, baseDelayMs: 2000 },
    });

    builder.addEdge(previousNodeId, stageId);
    previousNodeId = stageId;

    // Insert gate after this stage if applicable
    const gateNumber = GATE_AFTER_STAGE[stage];
    if (gateNumber) {
      const gateId = `gate-${gateNumber}`;
      // Gate 1 is already added above
      if (gateNumber > 1) {
        builder.addNode({
          id: gateId,
          name: `Gate ${gateNumber}: Research Review`,
          type: 'gate',
        });
      }
      if (gateNumber > 1) {
        builder.addEdge(stageId, gateId);
        previousNodeId = gateId;
      }
    }
  }

  // Synthesize: after all stages + gate 3
  builder.addNode({
    id: 'synthesize',
    name: 'Synthesize PRD',
    type: 'action',
    execute: handlers.synthesize,
  });

  builder.addEdge(previousNodeId, 'synthesize');

  // Idea Stress Test: runs after synthesis when handler is provided (Pro/Enterprise)
  if (handlers.stressTest) {
    builder.addNode({
      id: 'stress-test',
      name: 'Idea Stress Test',
      type: 'action',
      execute: handlers.stressTest,
      errorStrategy: 'skip-and-continue',
    });
    builder.addEdge('synthesize', 'stress-test');
  }

  builder.setEntry('classify');
  return builder.build();
}
