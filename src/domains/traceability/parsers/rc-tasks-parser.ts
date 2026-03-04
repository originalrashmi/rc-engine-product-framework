import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ParsedTask } from '../types.js';

const RC_TASKS_DIR = 'rc-method/tasks';

/**
 * Parse RC Method task files and extract task entries.
 * Reads all TASKS-*.md files from the rc-method/tasks/ directory.
 */
export async function parseRcTasks(projectPath: string): Promise<ParsedTask[]> {
  const tasksDir = join(projectPath, RC_TASKS_DIR);

  if (!existsSync(tasksDir)) {
    return [];
  }

  const files = await readdir(tasksDir);
  const taskFiles = files.filter((f) => f.startsWith('TASKS-') && f.endsWith('.md'));

  const allTasks: ParsedTask[] = [];

  for (const file of taskFiles) {
    const content = await readFile(join(tasksDir, file), 'utf-8');
    const tasks = extractTasksFromMarkdown(content);
    allTasks.push(...tasks);
  }

  return allTasks;
}

function extractTasksFromMarkdown(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split('\n');

  let currentTaskId = '';
  let currentDescription = '';
  let currentPrdCriteria = '';
  let inTask = false;

  for (const line of lines) {
    // Match task heading: ### TASK-001 [TYPE] Description
    const taskMatch = line.match(/^###\s+(TASK-\d+)\s+\[.+?\]\s+(.+)/);
    if (taskMatch) {
      // Save previous task
      if (inTask && currentTaskId) {
        tasks.push({
          id: currentTaskId,
          description: currentDescription.trim(),
          prdCriteria: currentPrdCriteria.trim(),
        });
      }

      currentTaskId = taskMatch[1];
      currentDescription = taskMatch[2];
      currentPrdCriteria = '';
      inTask = true;
      continue;
    }

    if (inTask) {
      // Capture description line
      const descMatch = line.match(/^\s*-\s+\*\*Description:\*\*\s*(.+)/);
      if (descMatch) {
        currentDescription = descMatch[1];
      }

      // Capture PRD criteria reference
      const prdMatch = line.match(/^\s*-\s+\*\*PRD Criteria:\*\*\s*(.+)/);
      if (prdMatch) {
        currentPrdCriteria = prdMatch[1];
      }
    }
  }

  // Don't forget last task
  if (inTask && currentTaskId) {
    tasks.push({
      id: currentTaskId,
      description: currentDescription.trim(),
      prdCriteria: currentPrdCriteria.trim(),
    });
  }

  return tasks;
}
