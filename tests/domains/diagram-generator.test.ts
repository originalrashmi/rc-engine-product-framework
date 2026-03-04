import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  parseTasksForDiagrams,
  generateDependencyDiagram,
  generateGanttDiagram,
  generateLayerDiagram,
  generateDiagrams,
} from '../../src/domains/rc/generators/diagram-generator.js';

const TEMP_DIR = join(process.cwd(), '.test-diagrams-temp');

const SAMPLE_TASKS_MD = `# Tasks

### TASK-001 [SETUP] Project scaffolding
- **Description:** Initialize project structure and build tooling.
- **Layer:** Foundation
- **Priority:** P0
- **Dependencies:** None
- **Estimated Effort:** 2 hours
- **FR References:** FR-A1

### Description
Set up the monorepo with TypeScript, ESLint, and Vitest.

### TASK-002 [FEATURE] User authentication
- **Description:** Implement login/signup with JWT tokens.
- **Layer:** Core
- **Priority:** P1
- **Dependencies:** TASK-001
- **Estimated Effort:** 4 hours
- **FR References:** FR-B1, FR-B2

### TASK-003 [FEATURE] Dashboard UI
- **Description:** Create the main dashboard with data visualizations.
- **Layer:** Integration
- **Priority:** P1
- **Dependencies:** TASK-001, TASK-002
- **Estimated Effort:** 3 hours
- **FR References:** FR-C1

### TASK-004 [POLISH] Error handling
- **Description:** Add global error boundary and user-friendly error pages.
- **Layer:** Polish
- **Priority:** P2
- **Dependencies:** TASK-003
- **Estimated Effort:** 1.5 hours
- **FR References:** FR-D1
`;

describe('diagram-generator', () => {
  describe('parseTasksForDiagrams', () => {
    beforeEach(() => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
    });

    afterEach(() => {
      if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
    });

    it('parses all tasks from markdown', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks).toHaveLength(4);
    });

    it('extracts task IDs and titles', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks[0].id).toBe('TASK-001');
      expect(tasks[0].title).toBe('Project scaffolding');
      expect(tasks[0].type).toBe('SETUP');
    });

    it('extracts layer and priority', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks[0].layer).toBe('Foundation');
      expect(tasks[0].priority).toBe('P0');
      expect(tasks[1].layer).toBe('Core');
      expect(tasks[1].priority).toBe('P1');
    });

    it('extracts dependencies', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks[0].dependencies).toEqual([]);
      expect(tasks[1].dependencies).toEqual(['TASK-001']);
      expect(tasks[2].dependencies).toEqual(['TASK-001', 'TASK-002']);
    });

    it('extracts effort', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks[0].effort).toBe('2 hours');
      expect(tasks[3].effort).toBe('1.5 hours');
    });

    it('extracts FR references', async () => {
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      expect(tasks[0].frReferences).toEqual(['FR-A1']);
      expect(tasks[1].frReferences).toEqual(['FR-B1', 'FR-B2']);
    });

    it('returns empty array when no tasks directory exists', async () => {
      const nonExistent = join(TEMP_DIR, 'nonexistent');
      const tasks = await parseTasksForDiagrams(nonExistent);
      expect(tasks).toEqual([]);
    });
  });

  describe('generateDependencyDiagram', () => {
    it('produces valid Mermaid syntax with graph TD', async () => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      rmSync(TEMP_DIR, { recursive: true, force: true });

      const mermaid = generateDependencyDiagram(tasks, 'TestProject');
      expect(mermaid).toContain('graph TD');
      expect(mermaid).toContain('TASK-001');
      expect(mermaid).toContain('TASK-002');
      expect(mermaid).toContain('TASK-001 --> TASK-002');
      expect(mermaid).toContain('TASK-001 --> TASK-003');
      expect(mermaid).toContain('TASK-003 --> TASK-004');
    });

    it('includes priority-based styling', async () => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      rmSync(TEMP_DIR, { recursive: true, force: true });

      const mermaid = generateDependencyDiagram(tasks, 'TestProject');
      expect(mermaid).toContain('style TASK-001');
      expect(mermaid).toContain('#dc2626'); // P0 red
    });
  });

  describe('generateGanttDiagram', () => {
    it('produces a Gantt chart with sections by layer', async () => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      rmSync(TEMP_DIR, { recursive: true, force: true });

      const mermaid = generateGanttDiagram(tasks, 'TestProject');
      expect(mermaid).toContain('gantt');
      expect(mermaid).toContain('section Foundation');
      expect(mermaid).toContain('section Core');
      expect(mermaid).toContain('section Integration');
      expect(mermaid).toContain('section Polish');
    });
  });

  describe('generateLayerDiagram', () => {
    it('produces subgraphs per layer', async () => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
      const tasks = await parseTasksForDiagrams(TEMP_DIR);
      rmSync(TEMP_DIR, { recursive: true, force: true });

      const mermaid = generateLayerDiagram(tasks, 'TestProject');
      expect(mermaid).toContain('subgraph Foundation');
      expect(mermaid).toContain('subgraph Core');
      expect(mermaid).toContain('subgraph Integration');
      expect(mermaid).toContain('subgraph Polish');
    });
  });

  describe('generateDiagrams', () => {
    beforeEach(() => {
      const tasksDir = join(TEMP_DIR, 'rc-method', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'TASKS-test-master.md'), SAMPLE_TASKS_MD, 'utf-8');
    });

    afterEach(() => {
      if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
    });

    it('generates 3 HTML diagram files', async () => {
      const results = await generateDiagrams(TEMP_DIR, 'TestProject');
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.diagramType)).toEqual(['dependency', 'gantt', 'layers']);
    });

    it('creates HTML files on disk', async () => {
      await generateDiagrams(TEMP_DIR, 'TestProject');
      expect(existsSync(join(TEMP_DIR, 'rc-method', 'diagrams', 'dependency-graph.html'))).toBe(true);
      expect(existsSync(join(TEMP_DIR, 'rc-method', 'diagrams', 'build-timeline.html'))).toBe(true);
      expect(existsSync(join(TEMP_DIR, 'rc-method', 'diagrams', 'architecture-layers.html'))).toBe(true);
    });

    it('returns empty array when no tasks exist', async () => {
      const emptyDir = join(TEMP_DIR, 'empty');
      mkdirSync(emptyDir, { recursive: true });
      const results = await generateDiagrams(emptyDir, 'EmptyProject');
      expect(results).toEqual([]);
    });

    it('HTML files include mermaid script', async () => {
      const results = await generateDiagrams(TEMP_DIR, 'TestProject');
      expect(results[0].mermaidSyntax).toContain('TASK-001');

      const { readFileSync } = await import('fs');
      const html = readFileSync(join(TEMP_DIR, 'rc-method', 'diagrams', 'dependency-graph.html'), 'utf-8');
      expect(html).toContain('mermaid');
      expect(html).toContain('cdn.jsdelivr.net');
    });
  });
});
