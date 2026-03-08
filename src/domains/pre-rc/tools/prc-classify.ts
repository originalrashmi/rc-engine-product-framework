import type { StatePersistence } from '../state/state-persistence.js';
import type { ComplexityClassifier } from '../complexity-classifier.js';
import type { PersonaSelector } from '../persona-selector.js';
import type { LLMFactory } from '../../../shared/llm/factory.js';
import type { ContextLoader } from '../context-loader.js';
import type { AgentFactory } from '../agents/agent-factory.js';
import { tokenTracker } from '../../../shared/token-tracker.js';
import { createPreRcCoordinator } from './prc-coordinator-factory.js';

export async function prcClassify(
  persistence: StatePersistence,
  classifier: ComplexityClassifier,
  selector: PersonaSelector,
  llmFactory: LLMFactory,
  projectPath: string,
  contextLoader: ContextLoader,
  agentFactory: AgentFactory,
): Promise<string> {
  const stateManager = await persistence.load(projectPath);
  if (!stateManager) {
    throw new Error('Research not initialized. Run prc_start first.');
  }

  const state = stateManager.getState();
  tokenTracker.setProjectPath(projectPath);

  // ALWAYS attempt autonomous classification first
  try {
    console.error('[prc_classify] Running classification through graph coordinator...');

    // Create coordinator with real handlers and run the graph.
    // The graph executes the classify node (which calls classifier.classify +
    // selector.select + writes artifacts) then stops at gate-1.
    const coordinator = createPreRcCoordinator({
      persistence,
      classifier,
      selector,
      agentFactory,
      llmFactory,
      contextLoader,
    });

    const result = await coordinator.run(projectPath, state);

    // The classify handler updated state with classification + personaSelection.
    // Persist via the domain state manager (same CheckpointStore key -- overwrites
    // the coordinator's checkpoint with the same data + markdown export).
    await persistence.save(result.state);

    const classification = result.state.classification;
    const selection = result.state.personaSelection;

    if (!classification || !selection) {
      throw new Error('Classification handler did not produce results');
    }

    console.error('[prc_classify] Graph coordinator classification succeeded');

    // Build gate presentation (same output format as before)
    return buildGate1Presentation(classification, selection, llmFactory);
  } catch (err) {
    // Autonomous failed - fall back to passthrough with clear reason
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[prc_classify] PASSTHROUGH TRIGGERED - Autonomous classification failed: ${errMsg}`);

    const prompt = await classifier.buildPassthroughPrompt(state.brief);
    return `**Classification -- Manual Mode**

The automatic analysis could not connect to the AI service: ${errMsg}

I've prepared a classification prompt you can run in any AI tool (ChatGPT, Claude.ai, Gemini, etc.). Paste the result back and I'll continue the pipeline.

### Prompt for Classification

${prompt}

After you have the result, provide it and I'll continue.`;
  }
}

function buildGate1Presentation(classification: any, selection: any, _llm: LLMFactory): string {
  const complexityLabel =
    classification.domain === 'clear' ? 'straightforward' :
    classification.domain === 'complicated' ? 'moderately complex' :
    classification.domain === 'complex' ? 'complex' : 'highly uncertain';

  return `**Complexity Assessment: ${classification.domain}**

Your project is ${complexityLabel}, which means ${classification.reasoning}

I've activated **${selection.totalActive} of 20 research specialists** to analyze your idea.

Key complexity factors:
${classification.complexityFactors.map((f: string) => `- ${f}`).join('\n')}

**Checkpoint 1:** Does this research scope look right? Should I add or remove any areas of focus?
- **Approve** -- Start the research
- **Adjust** -- Tell me what to change`;
}
