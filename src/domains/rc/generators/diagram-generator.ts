import { readFile, readdir, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

interface DiagramTask {
  id: string;
  title: string;
  type: string;
  layer: string;
  priority: string;
  dependencies: string[];
  effort: string;
  frReferences: string[];
}

export interface DiagramResult {
  mermaidSyntax: string;
  htmlPath: string;
  diagramType: string;
}

// ── Task Parsing ─────────────────────────────────────────────────────────────

/** Parse enhanced task info from TASKS-*.md files */
export async function parseTasksForDiagrams(projectPath: string): Promise<DiagramTask[]> {
  const tasksDir = join(projectPath, 'rc-method', 'tasks');
  if (!existsSync(tasksDir)) return [];

  const files = await readdir(tasksDir);
  const taskFiles = files.filter((f) => f.startsWith('TASKS-') && f.endsWith('.md'));
  const allTasks: DiagramTask[] = [];

  for (const file of taskFiles) {
    const content = await readFile(join(tasksDir, file), 'utf-8');
    allTasks.push(...extractDiagramTasks(content));
  }

  return allTasks;
}

function extractDiagramTasks(content: string): DiagramTask[] {
  const tasks: DiagramTask[] = [];
  const lines = content.split('\n');

  let current: DiagramTask | null = null;

  for (const line of lines) {
    // Match: ### TASK-001 [SETUP] Project scaffolding
    const taskMatch = line.match(/^###\s+(TASK-\d+)\s+\[(.+?)\]\s+(.+)/);
    if (taskMatch) {
      if (current) tasks.push(current);
      current = {
        id: taskMatch[1],
        type: taskMatch[2],
        title: taskMatch[3].trim(),
        layer: '',
        priority: '',
        dependencies: [],
        effort: '',
        frReferences: [],
      };
      continue;
    }

    if (!current) continue;

    // Parse metadata fields
    const layerMatch = line.match(/^\s*-\s+\*\*Layer:\*\*\s*(.+)/);
    if (layerMatch) {
      current.layer = layerMatch[1].trim();
      continue;
    }

    const priorityMatch = line.match(/^\s*-\s+\*\*Priority:\*\*\s*(.+)/);
    if (priorityMatch) {
      current.priority = priorityMatch[1].trim();
      continue;
    }

    const depMatch = line.match(/^\s*-\s+\*\*Dependencies:\*\*\s*(.+)/);
    if (depMatch) {
      const depStr = depMatch[1].trim();
      if (depStr.toLowerCase() !== 'none') {
        current.dependencies = depStr
          .split(/,\s*/)
          .map((d) => d.trim())
          .filter((d) => d.startsWith('TASK-'));
      }
      continue;
    }

    const effortMatch = line.match(/^\s*-\s+\*\*Estimated Effort:\*\*\s*(.+)/);
    if (effortMatch) {
      current.effort = effortMatch[1].trim();
      continue;
    }

    const frMatch = line.match(/^\s*-\s+\*\*(?:FR References|PRD Criteria):\*\*\s*(.+)/);
    if (frMatch) {
      current.frReferences = frMatch[1]
        .split(/,\s*/)
        .map((r) => r.trim())
        .filter(Boolean);
      continue;
    }
  }

  if (current) tasks.push(current);
  return tasks;
}

// ── Mermaid Generators ───────────────────────────────────────────────────────

/** Generate a task dependency DAG as Mermaid flowchart */
export function generateDependencyDiagram(tasks: DiagramTask[], projectName: string): string {
  const lines: string[] = ['graph TD'];

  // Priority colors
  const priorityClass: Record<string, string> = {
    P0: 'fill:#dc2626,color:#fff,stroke:#991b1b',
    P1: 'fill:#f59e0b,color:#000,stroke:#d97706',
    P2: 'fill:#3b82f6,color:#fff,stroke:#2563eb',
    P3: 'fill:#6b7280,color:#fff,stroke:#4b5563',
  };

  // Define nodes
  for (const task of tasks) {
    const label = `${task.id}\\n${truncate(task.title, 30)}`;
    lines.push(`    ${task.id}["${label}"]`);
  }

  lines.push('');

  // Define edges from dependencies
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (tasks.some((t) => t.id === dep)) {
        lines.push(`    ${dep} --> ${task.id}`);
      }
    }
  }

  lines.push('');

  // Style by priority
  for (const task of tasks) {
    const style = priorityClass[task.priority] ?? priorityClass.P3;
    lines.push(`    style ${task.id} ${style}`);
  }

  return `---\ntitle: ${projectName} -- Task Dependencies\n---\n${lines.join('\n')}`;
}

/** Generate a Gantt chart from tasks */
export function generateGanttDiagram(tasks: DiagramTask[], projectName: string): string {
  const lines: string[] = ['gantt', `    title ${projectName} -- Build Plan`, '    dateFormat X', '    axisFormat %s'];

  // Group by layer
  const layers = ['Foundation', 'Core', 'Integration', 'Polish'];
  const byLayer = new Map<string, DiagramTask[]>();

  for (const task of tasks) {
    const layer = layers.find((l) => task.layer.toLowerCase().includes(l.toLowerCase())) ?? 'Core';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(task);
  }

  for (const layer of layers) {
    const layerTasks = byLayer.get(layer);
    if (!layerTasks?.length) continue;

    lines.push(`    section ${layer}`);
    for (const task of layerTasks) {
      const effort = parseEffort(task.effort);
      const depStr =
        task.dependencies.length > 0
          ? `after ${task.dependencies.map((d) => d.toLowerCase().replace('-', '')).join(' ')}`
          : '0';
      const taskId = task.id.toLowerCase().replace('-', '');
      lines.push(`    ${truncate(task.title, 30)} :${taskId}, ${depStr}, ${effort}h`);
    }
  }

  return lines.join('\n');
}

/** Generate a layer-based swimlane flowchart */
export function generateLayerDiagram(tasks: DiagramTask[], projectName: string): string {
  const lines: string[] = [`graph TD`];

  const layers = ['Foundation', 'Core', 'Integration', 'Polish'];
  const byLayer = new Map<string, DiagramTask[]>();

  for (const task of tasks) {
    const layer = layers.find((l) => task.layer.toLowerCase().includes(l.toLowerCase())) ?? 'Core';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(task);
  }

  // Create subgraphs per layer
  for (const layer of layers) {
    const layerTasks = byLayer.get(layer);
    if (!layerTasks?.length) continue;

    lines.push(`    subgraph ${layer}["${layer} Layer"]`);
    for (const task of layerTasks) {
      lines.push(`        ${task.id}["${task.id}: ${truncate(task.title, 25)}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  // Add dependency edges
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (tasks.some((t) => t.id === dep)) {
        lines.push(`    ${dep} --> ${task.id}`);
      }
    }
  }

  return `---\ntitle: ${projectName} -- Architecture Layers\n---\n${lines.join('\n')}`;
}

// ── HTML Generation ──────────────────────────────────────────────────────────

/** Create a self-contained HTML page that renders a Mermaid diagram */
function mermaidToHtml(mermaidSyntax: string, title: string): string {
  // Escape for embedding in HTML
  const escaped = mermaidSyntax.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      color: #f1c40f;
    }
    .diagram-container {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 2rem;
      max-width: 1200px;
      width: 100%;
      overflow-x: auto;
    }
    .mermaid { text-align: center; }
    .mermaid svg { max-width: 100%; height: auto; }
    .source-toggle {
      margin-top: 1rem;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.75rem;
      text-decoration: underline;
    }
    .source-code {
      display: none;
      margin-top: 1rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.75rem;
      white-space: pre-wrap;
      color: #94a3b8;
      max-height: 300px;
      overflow: auto;
    }
    .source-code.visible { display: block; }
    @media print {
      body { background: white; color: black; padding: 1cm; }
      h1 { color: #333; }
      .diagram-container { border: 1px solid #ddd; background: white; }
      .source-toggle, .source-code { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="diagram-container">
    <pre class="mermaid">
${mermaidSyntax}
    </pre>
  </div>
  <div class="source-toggle" onclick="document.querySelector('.source-code').classList.toggle('visible')">
    Show/Hide Mermaid Source
  </div>
  <pre class="source-code">${escaped}</pre>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#f59e0b',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#d97706',
        lineColor: '#94a3b8',
        secondaryColor: '#1e293b',
        tertiaryColor: '#334155',
      },
    });
  </script>
</body>
</html>`;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/** Generate all diagrams for a project and save to rc-method/diagrams/ */
export async function generateDiagrams(projectPath: string, projectName: string): Promise<DiagramResult[]> {
  const tasks = await parseTasksForDiagrams(projectPath);
  if (tasks.length === 0) {
    return [];
  }

  const diagramsDir = join(projectPath, 'rc-method', 'diagrams');
  await mkdir(diagramsDir, { recursive: true });

  const results: DiagramResult[] = [];

  // 1. Dependency DAG
  const depMermaid = generateDependencyDiagram(tasks, projectName);
  const depHtml = mermaidToHtml(depMermaid, `${projectName} -- Task Dependencies`);
  const depPath = join(diagramsDir, 'dependency-graph.html');
  await writeFile(depPath, depHtml, 'utf-8');
  results.push({
    mermaidSyntax: depMermaid,
    htmlPath: 'rc-method/diagrams/dependency-graph.html',
    diagramType: 'dependency',
  });

  // 2. Gantt chart
  const ganttMermaid = generateGanttDiagram(tasks, projectName);
  const ganttHtml = mermaidToHtml(ganttMermaid, `${projectName} -- Build Timeline`);
  const ganttPath = join(diagramsDir, 'build-timeline.html');
  await writeFile(ganttPath, ganttHtml, 'utf-8');
  results.push({
    mermaidSyntax: ganttMermaid,
    htmlPath: 'rc-method/diagrams/build-timeline.html',
    diagramType: 'gantt',
  });

  // 3. Layer swimlane
  const layerMermaid = generateLayerDiagram(tasks, projectName);
  const layerHtml = mermaidToHtml(layerMermaid, `${projectName} -- Architecture Layers`);
  const layerPath = join(diagramsDir, 'architecture-layers.html');
  await writeFile(layerPath, layerHtml, 'utf-8');
  results.push({
    mermaidSyntax: layerMermaid,
    htmlPath: 'rc-method/diagrams/architecture-layers.html',
    diagramType: 'layers',
  });

  return results;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function parseEffort(effort: string): number {
  const match = effort.match(/([\d.]+)\s*h/i);
  return match ? parseFloat(match[1]) : 2;
}
