import { writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomBytes } from 'node:crypto';
import { join } from 'path';
import type { TraceabilityMatrix } from '../types.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { TraceabilityMatrixSchema } from './schemas.js';

const TRACE_DIR = 'rc-traceability';
const TRACE_FILE = 'TRACEABILITY.json';
const ENHANCED_DIR = 'enhanced';
const REPORTS_DIR = 'reports';

export function getTraceabilityPath(projectPath: string): string {
  return join(projectPath, TRACE_DIR, TRACE_FILE);
}

export function getEnhancedDir(projectPath: string): string {
  return join(projectPath, TRACE_DIR, ENHANCED_DIR);
}

export function getReportsDir(projectPath: string): string {
  return join(projectPath, TRACE_DIR, REPORTS_DIR);
}

export async function ensureDirectories(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, TRACE_DIR), { recursive: true });
  await mkdir(getEnhancedDir(projectPath), { recursive: true });
  await mkdir(getReportsDir(projectPath), { recursive: true });
}

export async function loadTraceability(projectPath: string): Promise<TraceabilityMatrix | null> {
  const { store, pipelineId } = getProjectStore(projectPath);
  try {
    const checkpoint = store.load(pipelineId, NODE_IDS.TRACEABILITY, TraceabilityMatrixSchema);
    return checkpoint.state;
  } catch (err) {
    if ((err as Error).message.includes('No checkpoint found')) {
      return migrateFromJson(projectPath);
    }
    throw err;
  }
}

export async function saveTraceability(projectPath: string, matrix: TraceabilityMatrix): Promise<void> {
  await ensureDirectories(projectPath);
  matrix.updatedAt = new Date().toISOString();
  const { store, pipelineId } = getProjectStore(projectPath);
  store.save(pipelineId, NODE_IDS.TRACEABILITY, matrix);
  // Best-effort JSON export for human readability
  void writeJsonExport(projectPath, matrix);
}

// ── Migration ──────────────────────────────────────────────────────────────

async function migrateFromJson(projectPath: string): Promise<TraceabilityMatrix | null> {
  const filePath = getTraceabilityPath(projectPath);
  if (!existsSync(filePath)) return null;

  try {
    const { readFile: read } = await import('fs/promises');
    const raw = await read(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TraceabilityMatrix;
    const validated = TraceabilityMatrixSchema.parse(parsed);
    const { store, pipelineId } = getProjectStore(projectPath);
    store.save(pipelineId, NODE_IDS.TRACEABILITY, validated);
    return validated;
  } catch {
    return null;
  }
}

async function writeJsonExport(projectPath: string, matrix: TraceabilityMatrix): Promise<void> {
  try {
    const filePath = getTraceabilityPath(projectPath);
    const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmpPath, JSON.stringify(matrix, null, 2), 'utf-8');
    await rename(tmpPath, filePath);
  } catch (err) {
    console.error('[traceability] Warning: failed to write JSON export:', (err as Error).message);
  }
}
