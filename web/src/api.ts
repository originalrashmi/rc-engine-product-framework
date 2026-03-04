/**
 * API client for the RC Engine web server.
 */

// Derive base from the page's base path (handles reverse proxy prefixes like /rc-engine/)
const basePath = document.querySelector('base')?.getAttribute('href') || import.meta.env.BASE_URL || '/';
/** Root prefix for all server requests (e.g. '' or '/rc-engine') */
export const ROOT = basePath.replace(/\/$/, '');
/** API prefix (e.g. '/api' or '/rc-engine/api') */
export const BASE = `${ROOT}/api`;

// ── Types ───────────────────────────────────────────────────────────────────

export interface ToolInfo {
  name: string;
  description: string;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface ProjectInfo {
  path: string;
  name: string;
  domains: string[];
}

export interface HealthInfo {
  status: string;
  tools: number;
  apiKeys: Record<string, boolean>;
  knowledge: { files: number; mode: string };
  uptime: number;
}

export interface PipelineState {
  preRc: PreRcState | null;
  rc: RcState | null;
  postRc: PostRcState | null;
  traceability: TraceState | null;
  tokens: { summary: string; totalTokens: number };
}

export interface PreRcState {
  projectName: string;
  classification: string | null;
  stages: Array<{ name: string; status: string; phase: string }>;
  gates: Array<{ number: number; status: string; timestamp: string }>;
  artifactCount: number;
  totalTokens: number;
  pipelineMessage: string;
}

export interface RcState {
  projectName: string;
  currentPhase: number;
  phaseName: string;
  phases: Array<{ number: number; name: string; status: string }>;
  gatesPassed: number;
  totalGates: number;
  prdCount: number;
  taskCount: number;
  uxScore: string;
}

export interface PostRcState {
  projectName: string;
  scanCount: number;
  activeOverrides: number;
  latestScan: {
    id: string;
    date: string;
    gate: string;
    critical: number;
    high: number;
    medium: number;
    total: number;
  } | null;
  activeModules: string[];
  gateHistory: Array<{ decision: string; timestamp: string }>;
}

export interface TraceState {
  projectName: string;
  totalRequirements: number;
  coveragePercent: number;
  requirements: Array<{
    id: string;
    category: string;
    title: string;
    status: string;
    taskCount: number;
    findingCount: number;
    verification: string;
  }>;
  orphanRequirements: string[];
  orphanTasks: string[];
}

export interface ArtifactInfo {
  name: string;
  path: string;
  domain: string;
  type: string;
  size: number;
}

// ── REST API ────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthInfo> {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Health check failed');
  return data;
}

export async function listTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${BASE}/tools`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to list tools');
  return data.tools;
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await fetch(`${BASE}/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Tool execution failed');
  return data.result;
}

export interface ProjectsResponse {
  projects: ProjectInfo[];
  projectsDir: string;
}

export async function listProjects(dir?: string): Promise<ProjectsResponse> {
  const params = dir ? `?dir=${encodeURIComponent(dir)}` : '';
  const res = await fetch(`${BASE}/projects${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to list projects');
  return { projects: data.projects, projectsDir: data.projectsDir || '' };
}

export async function getPipelineState(projectPath: string): Promise<PipelineState> {
  const res = await fetch(`${BASE}/project/state?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get state');
  return data.state;
}

export async function listArtifacts(projectPath: string): Promise<ArtifactInfo[]> {
  const res = await fetch(`${BASE}/project/artifacts?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to list artifacts');
  return data.artifacts;
}

export function getDownloadUrl(projectPath: string, filePath: string): string {
  return `${BASE}/project/download?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(filePath)}`;
}

export function getExportUrl(
  projectPath: string,
  options?: { files?: string[]; title?: string; subtitle?: string },
): string {
  const params = new URLSearchParams({ path: projectPath });
  if (options?.files) params.set('files', options.files.join(','));
  if (options?.title) params.set('title', options.title);
  if (options?.subtitle) params.set('subtitle', options.subtitle);
  return `${BASE}/project/export?${params.toString()}`;
}

export interface DiagramInfo {
  type: string;
  htmlPath: string;
  mermaidSyntax: string;
}

export async function generateDiagrams(projectPath: string): Promise<DiagramInfo[]> {
  const res = await fetch(`${BASE}/project/diagrams?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate diagrams');
  return data.diagrams;
}

export async function selectDesign(projectPath: string, optionId: string, specPath: string): Promise<void> {
  const res = await fetch(`${BASE}/project/design-select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, optionId, specPath }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save design selection');
}

/** Configure which personas are active for research (pass disabled IDs to exclude). */
export async function configurePersonas(projectPath: string, disabledIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/project/configure-personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, disabledIds }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to configure personas');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function extractText(result: ToolResult): string {
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

// ── WebSocket ───────────────────────────────────────────────────────────────

export type WsEvent =
  | { type: 'connected'; tools: string[] }
  | { type: 'tool:start'; tool: string; args: Record<string, unknown>; timestamp: number }
  | { type: 'tool:complete'; tool: string; timestamp: number }
  | { type: 'tool:error'; tool: string; error: string; timestamp: number };

export function connectWebSocket(onEvent: (event: WsEvent) => void): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBase = basePath.replace(/\/$/, '');
  const ws = new WebSocket(`${proto}//${window.location.host}${wsBase}/ws`);

  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data as string) as WsEvent;
      onEvent(event);
    } catch {
      // Ignore non-JSON messages
    }
  };

  ws.onclose = () => {
    setTimeout(() => connectWebSocket(onEvent), 3000);
  };

  return ws;
}
