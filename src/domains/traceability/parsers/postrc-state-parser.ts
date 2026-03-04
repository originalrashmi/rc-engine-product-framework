import type { ParsedFinding } from '../types.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { PostRCStateSchema } from '../../post-rc/state/schemas.js';

/**
 * Load Post-RC scan findings via CheckpointStore.
 *
 * Cross-domain read: traceability domain reads post-rc domain state
 * through the shared store (same SQLite file, same pipelineId).
 * Replaces the old bracket-counting JSON extractor.
 */
export async function parsePostRcState(projectPath: string): Promise<ParsedFinding[]> {
  const { store, pipelineId } = getProjectStore(projectPath);
  try {
    const checkpoint = store.load(pipelineId, NODE_IDS.POST_RC_STATE, PostRCStateSchema);
    return extractFindings(checkpoint.state);
  } catch {
    // No Post-RC state yet or validation failed -- no findings to map
    return [];
  }
}

function extractFindings(state: {
  lastScan?: {
    findings: Array<{
      id: string;
      title: string;
      severity: string;
      module: string;
      category: string;
      description: string;
    }>;
  };
  scans?: Array<{
    findings: Array<{
      id: string;
      title: string;
      severity: string;
      module: string;
      category: string;
      description: string;
    }>;
  }>;
}): ParsedFinding[] {
  const findings: ParsedFinding[] = [];
  const seen = new Set<string>();

  const addFinding = (f: {
    id: string;
    title: string;
    severity: string;
    module: string;
    category: string;
    description: string;
  }) => {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      findings.push({
        id: f.id || '',
        title: f.title || '',
        severity: f.severity || '',
        module: f.module || '',
        category: f.category || '',
        description: f.description || '',
      });
    }
  };

  if (state.lastScan?.findings) {
    state.lastScan.findings.forEach(addFinding);
  }
  if (state.scans) {
    for (const scan of state.scans) {
      scan.findings?.forEach(addFinding);
    }
  }

  return findings;
}
