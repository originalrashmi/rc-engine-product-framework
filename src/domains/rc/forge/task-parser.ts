/**
 * Task Parser — Parse TASKS-*.md into structured BuildTask objects.
 *
 * Reads the sequenced task list from Phase 4 and extracts:
 * - Task IDs (TASK-001, TASK-002, ...)
 * - Tags ([UI], [API], [DATA], ...)
 * - Dependencies
 * - Task specifications
 */

import type { BuildTask, TaskTag } from './types.js';
import { BuildLayer, TAG_LAYER_MAP } from './types.js';

/** All recognized task tags */
const VALID_TAGS: TaskTag[] = ['SETUP', 'CONFIG', 'DATA', 'API', 'UI', 'INTEGRATION', 'OBS', 'TEST'];

/**
 * Parse a TASKS-*.md file content into structured BuildTask objects.
 */
export function parseTasks(content: string): BuildTask[] {
  const tasks: BuildTask[] = [];
  const lines = content.split('\n');

  let currentTask: Partial<BuildTask> | null = null;
  let specLines: string[] = [];

  for (const line of lines) {
    // Match task header: "### TASK-001: [UI] Create login page"
    // or "## TASK-001 [DATA] Setup database schema"
    const taskMatch = line.match(/^#{2,3}\s+(TASK-\d+)[:\s]*\[(\w+)\]\s*(.*)/);

    if (taskMatch) {
      // Save previous task
      if (currentTask?.taskId) {
        tasks.push(finalizeTask(currentTask, specLines));
      }

      const [, taskId, rawTag, title] = taskMatch;
      const tag = normalizeTag(rawTag);

      currentTask = {
        taskId,
        title: title.trim(),
        tag,
        layer: TAG_LAYER_MAP[tag] ?? BuildLayer.Integration,
        dependencies: [],
      };
      specLines = [line];
      continue;
    }

    // Match dependency lines: "Dependencies: TASK-001, TASK-002"
    if (currentTask && /^\s*(?:depend|requires|after|blocked)/i.test(line)) {
      const deps = extractDependencies(line);
      currentTask.dependencies = [...(currentTask.dependencies ?? []), ...deps];
    }

    // Match effort: "Effort: Medium" or "Estimated: 2 hours"
    if (currentTask && /^\s*(?:effort|estimated|estimate)/i.test(line)) {
      const effortMatch = line.match(/:\s*(.+)/);
      if (effortMatch) {
        currentTask.effort = effortMatch[1].trim();
      }
    }

    // Accumulate spec lines
    if (currentTask) {
      specLines.push(line);
    }
  }

  // Save last task
  if (currentTask?.taskId) {
    tasks.push(finalizeTask(currentTask, specLines));
  }

  return tasks;
}

/**
 * Group tasks by execution layer.
 */
export function groupByLayer(tasks: BuildTask[]): Map<BuildLayer, BuildTask[]> {
  const layers = new Map<BuildLayer, BuildTask[]>();

  for (const task of tasks) {
    const existing = layers.get(task.layer) ?? [];
    existing.push(task);
    layers.set(task.layer, existing);
  }

  return layers;
}

/**
 * Get layers in execution order.
 */
export function getLayerOrder(): BuildLayer[] {
  return [
    BuildLayer.Foundation,
    BuildLayer.Backend,
    BuildLayer.Frontend,
    BuildLayer.Integration,
    BuildLayer.QA,
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeTag(raw: string): TaskTag {
  const upper = raw.toUpperCase();
  if (VALID_TAGS.includes(upper as TaskTag)) return upper as TaskTag;
  // Common aliases
  const aliases: Record<string, TaskTag> = {
    DATABASE: 'DATA', DB: 'DATA', SCHEMA: 'DATA',
    FRONTEND: 'UI', COMPONENT: 'UI',
    BACKEND: 'API', ENDPOINT: 'API',
    INFRA: 'SETUP', DEPLOY: 'SETUP',
    MONITORING: 'OBS', LOGGING: 'OBS',
  };
  return aliases[upper] ?? 'INTEGRATION';
}

function extractDependencies(line: string): string[] {
  const matches = line.match(/TASK-\d+/g);
  return matches ?? [];
}

function finalizeTask(partial: Partial<BuildTask>, specLines: string[]): BuildTask {
  return {
    taskId: partial.taskId!,
    title: partial.title ?? '',
    tag: partial.tag ?? 'INTEGRATION',
    layer: partial.layer ?? BuildLayer.Integration,
    dependencies: partial.dependencies ?? [],
    effort: partial.effort,
    spec: specLines.join('\n').trim(),
  };
}
