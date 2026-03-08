/**
 * State Parser - Parses text output from domain status tools into structured data.
 *
 * The MCP tools return formatted text. This module extracts structured data
 * so the React frontend gets clean JSON instead of parsing text client-side.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface PipelineState {
  preRc: PreRcState | null;
  rc: RcState | null;
  postRc: PostRcState | null;
  traceability: TraceState | null;
  tokens: TokenState;
}

export interface PreRcState {
  projectName: string;
  classification: string | null;
  stages: StageInfo[];
  gates: GateInfo[];
  artifactCount: number;
  totalTokens: number;
  pipelineMessage: string;
}

export interface StageInfo {
  name: string;
  status: 'pending' | 'running' | 'done' | 'skip';
  phase: string;
}

export interface GateInfo {
  number: number;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

export interface RcState {
  projectName: string;
  currentPhase: number;
  phaseName: string;
  phases: PhaseInfo[];
  gatesPassed: number;
  totalGates: number;
  prdCount: number;
  taskCount: number;
  uxScore: string;
}

export interface PhaseInfo {
  number: number;
  name: string;
  status: 'pending' | 'active' | 'complete';
}

export interface PostRcState {
  projectName: string;
  scanCount: number;
  activeOverrides: number;
  latestScan: LatestScan | null;
  activeModules: string[];
  gateHistory: Array<{ decision: string; timestamp: string }>;
}

export interface LatestScan {
  id: string;
  date: string;
  gate: string;
  critical: number;
  high: number;
  medium: number;
  total: number;
}

export interface TraceState {
  projectName: string;
  totalRequirements: number;
  coveragePercent: number;
  requirements: TraceRequirement[];
  orphanRequirements: string[];
  orphanTasks: string[];
}

export interface TraceRequirement {
  id: string;
  category: string;
  title: string;
  status: string;
  taskCount: number;
  findingCount: number;
  verification: string;
}

export interface TokenState {
  summary: string;
  totalTokens: number;
}

export interface ArtifactInfo {
  name: string;
  path: string;
  domain: string;
  type: string;
  size: number;
}

// ── Parsers ─────────────────────────────────────────────────────────────────

export function parsePreRcStatus(text: string): PreRcState | null {
  if (!text || text.includes('Error:') || !text.includes('PRE-RC')) return null;

  const projectName = extractField(text, /Project:\s*(.+)/);
  const classification = extractField(text, /Domain:\s*(.+)/) || extractField(text, /Classification:\s*(.+)/);
  const artifactCount = parseInt(extractField(text, /ARTIFACTS:\s*(\d+)/) || '0', 10);
  const totalTokens = parseInt(extractField(text, /TOTAL TOKENS:\s*([\d,]+)/)?.replace(/,/g, '') || '0', 10);

  // Parse stages
  const stages: StageInfo[] = [];
  const stageSection = text.match(/STAGE PROGRESS:\n([\s\S]*?)(?=\n\s*GATES:|\n\s*===)/);
  if (stageSection) {
    const lines = stageSection[1].split('\n').filter((l) => l.includes('stage-'));
    for (const line of lines) {
      const match = line.match(/\s+(pending|running|done|skip)\s+(stage-[\w-]+)\s+\[(.*?)\]/);
      if (match) {
        stages.push({ name: match[2], status: match[1] as StageInfo['status'], phase: match[3] });
      }
    }
  }

  // Parse gates
  const gates: GateInfo[] = [];
  const gateSection = text.match(/GATES:\n([\s\S]*?)(?=\n\s*===|\n\s*\*\*|\n\s*ARTIFACTS)/);
  if (gateSection) {
    const gateMatches = gateSection[1].matchAll(/Gate\s+(\d):\s+(pending|approved|rejected)(?:\s+\(([^)]+)\))?/g);
    for (const m of gateMatches) {
      gates.push({
        number: parseInt(m[1], 10),
        status: m[2] as GateInfo['status'],
        timestamp: m[3] || '',
      });
    }
  }

  // Pipeline message
  const pipelineMsg = extractField(text, /PIPELINE:\s*\n\s*(.+)/) || '';

  return {
    projectName: projectName || '',
    classification,
    stages,
    gates,
    artifactCount,
    totalTokens,
    pipelineMessage: pipelineMsg,
  };
}

export function parseRcStatus(text: string): RcState | null {
  if (!text || text.includes('Error:') || !text.includes('RC METHOD')) return null;

  const projectName = extractField(text, /Project:\s*(.+)/) || '';
  const phaseMatch = text.match(/Current Phase:\s*(\d)\s*-\s*(\w+)/);
  const currentPhase = phaseMatch ? parseInt(phaseMatch[1], 10) : 0;
  const phaseName = phaseMatch ? phaseMatch[2] : '';

  // Parse phase progress
  const phases: PhaseInfo[] = [];
  const phaseNames = ['Illuminate', 'Define', 'Architect', 'Sequence', 'Validate', 'Forge', 'Connect', 'Compound'];
  const progressSection = text.match(/Phase Progress:\n([\s\S]*?)(?=\n\nPRDs:|\n\n\s*PRDs:)/);

  if (progressSection) {
    const lines = progressSection[1].split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const match = line.match(/(\d+)\.\s+(\w+)\s+\[(.)\]/);
      if (match) {
        const num = parseInt(match[1], 10);
        const icon = match[3];
        phases.push({
          number: num,
          name: match[2],
          status: icon === 'x' ? 'complete' : icon === '>' ? 'active' : 'pending',
        });
      }
    }
  }

  // Fallback: if parsing failed, build from currentPhase
  if (phases.length === 0) {
    for (let i = 0; i < 8; i++) {
      phases.push({
        number: i + 1,
        name: phaseNames[i],
        status: i + 1 < currentPhase ? 'complete' : i + 1 === currentPhase ? 'active' : 'pending',
      });
    }
  }

  const gatesMatch = text.match(/Gates Passed:\s*(\d+)\s*of\s*(\d+)/);
  const prdCount = parseInt(extractField(text, /PRDs:\s*(\d+)/) || '0', 10);
  const taskCount = parseInt(extractField(text, /Tasks:\s*(\d+)/) || '0', 10);
  const uxScore = extractField(text, /UX Score:\s*(.+)/) || 'not scored';

  return {
    projectName,
    currentPhase,
    phaseName,
    phases,
    gatesPassed: gatesMatch ? parseInt(gatesMatch[1], 10) : 0,
    totalGates: gatesMatch ? parseInt(gatesMatch[2], 10) : 7,
    prdCount,
    taskCount,
    uxScore,
  };
}

export function parsePostRcStatus(text: string): PostRcState | null {
  if (!text || text.includes('Error:') || !text.includes('POST-RC')) return null;

  const projectName = extractField(text, /Project:\s*(.+)/) || '';
  const scanCount = parseInt(extractField(text, /Total Scans:\s*(\d+)/) || '0', 10);
  const activeOverrides = parseInt(extractField(text, /Active Overrides:\s*(\d+)/) || '0', 10);

  // Parse active modules
  const modules: string[] = [];
  const moduleSection = text.match(/ACTIVE MODULES:\n([\s\S]*?)(?=\n\s*SCAN HISTORY:)/);
  if (moduleSection) {
    const moduleMatches = moduleSection[1].matchAll(/Y\s+(\w+)/g);
    for (const m of moduleMatches) {
      modules.push(m[1]);
    }
  }

  // Parse latest scan
  let latestScan: LatestScan | null = null;
  const scanSection = text.match(/LATEST SCAN:\n([\s\S]*?)(?=\n\s*NEXT STEPS:|\n\s*===)/);
  if (scanSection) {
    const section = scanSection[1];
    latestScan = {
      id: extractField(section, /ID:\s*(.+)/) || '',
      date: extractField(section, /Date:\s*(.+)/) || '',
      gate: extractField(section, /Gate:\s*(.+)/) || '',
      critical: parseInt(extractField(section, /Critical:\s*(\d+)/) || '0', 10),
      high: parseInt(extractField(section, /High:\s*(\d+)/) || '0', 10),
      medium: parseInt(extractField(section, /Medium:\s*(\d+)/) || '0', 10),
      total: parseInt(extractField(section, /Total Findings:\s*(\d+)/) || '0', 10),
    };
  }

  return {
    projectName,
    scanCount,
    activeOverrides,
    latestScan,
    activeModules: modules,
    gateHistory: [],
  };
}

export function parseTraceStatus(text: string): TraceState | null {
  if (!text || text.includes('Error:') || !text.includes('TRACEABILITY')) return null;

  const projectName = extractField(text, /Project:\s*(.+)/) || '';
  const totalRequirements = parseInt(extractField(text, /Requirements:\s*(\d+)/) || '0', 10);
  const coveragePercent = parseFloat(extractField(text, /Coverage:\s*([\d.]+)/) || '0');

  // Parse requirements table
  const requirements: TraceRequirement[] = [];
  const lines = text.split('\n');
  const headerIdx = lines.findIndex((l) => l.includes('ID') && l.includes('Cat') && l.includes('Title'));

  if (headerIdx !== -1) {
    for (let i = headerIdx + 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('---') || !line.trim()) continue;
      if (line.includes('COVERAGE') || line.includes('ORPHAN') || line.includes('===')) break;

      const id = line.substring(0, 16).trim();
      if (!id || id.startsWith('-')) continue;

      requirements.push({
        id,
        category: line.substring(16, 22).trim(),
        title: line.substring(22, 58).trim(),
        status: line.substring(58, 72).trim(),
        taskCount: parseInt(line.substring(72, 78).trim()) || 0,
        findingCount: parseInt(line.substring(78, 84).trim()) || 0,
        verification: line.substring(84).trim(),
      });
    }
  }

  // Parse orphans
  const orphanReqs: string[] = [];
  const orphanReqSection = text.match(/ORPHAN REQUIREMENTS\s*\(\d+\):\n([\s\S]*?)(?=\n\s*ORPHAN TASKS|\n\s*===)/);
  if (orphanReqSection) {
    const lines = orphanReqSection[1].split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const m = line.match(/^\s+([\w-]+)/);
      if (m) orphanReqs.push(m[1]);
    }
  }

  const orphanTasks: string[] = [];
  const orphanTaskSection = text.match(/ORPHAN TASKS\s*\(\d+\):\n([\s\S]*?)(?=\n\s*===)/);
  if (orphanTaskSection) {
    const lines = orphanTaskSection[1].split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const m = line.match(/^\s+([\w-]+)/);
      if (m) orphanTasks.push(m[1]);
    }
  }

  return {
    projectName,
    totalRequirements,
    coveragePercent,
    requirements,
    orphanRequirements: orphanReqs,
    orphanTasks,
  };
}

export function parseTokenSummary(text: string): TokenState {
  const totalMatch = text.match(/Total.*?:\s*([\d,]+)\s*tokens/i);
  const totalTokens = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;

  // Extract just the token summary section
  const summaryMatch = text.match(/TOKEN.*?USAGE[\s\S]*?(?=\n\s*REGISTERED|\n\s*PIPELINE|\n\s*===)/i);
  const summary = summaryMatch ? summaryMatch[0].trim() : text.trim();

  return { summary, totalTokens };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractField(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  return m ? m[1].trim() : null;
}
