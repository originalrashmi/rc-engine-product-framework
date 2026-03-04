import { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  Users,
  Loader2,
  FileText,
  Palette,
  Code2,
  Hammer,
  Shield,
  Trophy,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  DollarSign,
  Star,
  RotateCcw,
} from 'lucide-react';
import {
  callTool,
  extractText,
  getDownloadUrl,
  getExportUrl,
  listArtifacts,
  generateDiagrams,
  selectDesign,
  configurePersonas,
  type ArtifactInfo,
  type DiagramInfo,
  BASE,
} from '../api';
import { TeamMemberCard, type MemberStatus } from '../components/TeamMemberCard';
import { GateApproval } from '../components/GateApproval';
import { ValueDisplay } from '../components/ValueDisplay';
import { DesignOptionCard } from '../components/DesignOptionCard';
import { DesignPreview } from '../components/DesignPreview';
import { DiagramTabs } from '../components/DiagramTabs';

// ── Types ───────────────────────────────────────────────────────────────────

interface WizardProps {
  onComplete: (projectPath: string) => void;
  onBack: () => void;
}

interface PersonaInfo {
  id: string;
  roleTitle: string;
  description: string;
  category: string;
  hourlyRate: number;
  estimatedHours: number;
  enabled: boolean;
  status: MemberStatus;
}

interface ParsedDesignOption {
  id: string;
  name: string;
  personality: string;
  icpAlignment: number;
  colors: { primary: string; secondary: string; background: string; surface: string };
  typography: { headingFont: string; bodyFont: string };
  strengths: string[];
  weaknesses: string[];
}

// Default personas (mapped from role-registry.ts)
const DEFAULT_PERSONAS: PersonaInfo[] = [
  {
    id: 'primary-user-archetype',
    roleTitle: 'UX Researcher',
    description: 'Studies primary user personas, pain points, and behavioral patterns.',
    category: 'research',
    hourlyRate: 85,
    estimatedHours: 16,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'secondary-edge-user',
    roleTitle: 'Senior UX Researcher',
    description: 'Analyzes edge cases, minority users, and accessibility requirements.',
    category: 'research',
    hourlyRate: 95,
    estimatedHours: 12,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'demand-side-theorist',
    roleTitle: 'Market Research Analyst',
    description: 'Analyzes market demand, willingness to pay, and competitive positioning.',
    category: 'research',
    hourlyRate: 90,
    estimatedHours: 12,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'market-landscape-analyst',
    roleTitle: 'Competitive Intelligence Analyst',
    description: 'Maps the competitive landscape, pricing models, and market gaps.',
    category: 'research',
    hourlyRate: 85,
    estimatedHours: 16,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'business-model-strategist',
    roleTitle: 'Business Strategy Consultant',
    description: 'Designs the revenue model, pricing strategy, and unit economics.',
    category: 'management',
    hourlyRate: 150,
    estimatedHours: 12,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'gtm-strategist',
    roleTitle: 'GTM Marketing Manager',
    description: 'Plans launch strategy, distribution channels, and growth tactics.',
    category: 'management',
    hourlyRate: 100,
    estimatedHours: 12,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'systems-architect',
    roleTitle: 'Senior Software Architect',
    description: 'Designs the technical architecture, system boundaries, and integration patterns.',
    category: 'engineering',
    hourlyRate: 175,
    estimatedHours: 24,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'ai-ml-specialist',
    roleTitle: 'ML Engineer',
    description: 'Evaluates AI/ML requirements, model selection, and data pipeline design.',
    category: 'engineering',
    hourlyRate: 165,
    estimatedHours: 16,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'security-compliance-analyst',
    roleTitle: 'Security Consultant',
    description: 'Identifies security risks, compliance requirements, and threat modeling.',
    category: 'security',
    hourlyRate: 140,
    estimatedHours: 16,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'ux-systems-designer',
    roleTitle: 'Senior UX/UI Designer',
    description: 'Designs the interface architecture, component systems, and interaction patterns.',
    category: 'design',
    hourlyRate: 110,
    estimatedHours: 24,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'accessibility-advocate',
    roleTitle: 'Accessibility Consultant',
    description: 'Ensures the product is usable by people with disabilities (WCAG compliance).',
    category: 'design',
    hourlyRate: 100,
    estimatedHours: 8,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'content-language-strategist',
    roleTitle: 'Content Strategist',
    description: 'Plans content structure, messaging, and communication tone.',
    category: 'design',
    hourlyRate: 85,
    estimatedHours: 8,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'data-telemetry-strategist',
    roleTitle: 'Data Analyst',
    description: 'Designs data collection, analytics strategy, and success metrics.',
    category: 'research',
    hourlyRate: 95,
    estimatedHours: 12,
    enabled: true,
    status: 'pending',
  },
  {
    id: 'cognitive-load-analyst',
    roleTitle: 'UX Psychologist',
    description: 'Analyzes cognitive load, information architecture, and user mental models.',
    category: 'design',
    hourlyRate: 120,
    estimatedHours: 8,
    enabled: true,
    status: 'pending',
  },
];

const STAGES = [
  'stage-1-meta',
  'stage-2-user-intelligence',
  'stage-3-business-market',
  'stage-4-technical',
  'stage-5-ux',
  'stage-6-validation',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

// ── Steps ───────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Your Idea', icon: Lightbulb },
  { label: 'Your Team', icon: Users },
  { label: 'Research', icon: Loader2 },
  { label: 'Results', icon: FileText },
  { label: 'Design', icon: Palette },
  { label: 'Architecture', icon: Code2 },
  { label: 'Building', icon: Hammer },
  { label: 'Security', icon: Shield },
  { label: 'Complete', icon: Trophy },
];

// ── Wizard ──────────────────────────────────────────────────────────────────

export function Wizard({ onComplete, onBack }: WizardProps) {
  const [step, setStep] = useState(0);

  // Step 1: Idea
  const [ideaText, setIdeaText] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [problem, setProblem] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [mode, setMode] = useState<'full' | 'research' | 'build'>('full');

  // Project state
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [progress, setProgress] = useState('');

  // Step 2: Team
  const [personas, setPersonas] = useState<PersonaInfo[]>(DEFAULT_PERSONAS);

  // Step 3: Research progress
  const [currentStage, setCurrentStage] = useState(0);
  const [researchLog, setResearchLog] = useState<string[]>([]);

  // Step 4: Results
  const [synthesisResult, setSynthesisResult] = useState('');
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);

  // Step 4: Design
  const [designOptionCount, setDesignOptionCount] = useState<1 | 3>(1);
  const [designInspiration, setDesignInspiration] = useState('');
  const [designResult, setDesignResult] = useState('');
  const [designWireframeUrls, setDesignWireframeUrls] = useState<Array<{ name: string; path: string }>>([]);
  const [designOptions, setDesignOptions] = useState<ParsedDesignOption[]>([]);
  const [designRecommendation, setDesignRecommendation] = useState('');
  const [selectedDesignOption, setSelectedDesignOption] = useState('');
  const [designSpecPath, setDesignSpecPath] = useState('');

  // Step 5: Architecture
  const [techPrefs, setTechPrefs] = useState('');
  const [architectureResult, setArchitectureResult] = useState('');
  const [diagramUrls, setDiagramUrls] = useState<DiagramInfo[]>([]);

  // Step 6: Build
  const [buildProgress, setBuildProgress] = useState<Array<{ id: string; name: string; done: boolean }>>([]);
  const [buildingTask, setBuildingTask] = useState('');

  // Step 7: Security
  const [scanResult, setScanResult] = useState('');
  const [scanGate, setScanGate] = useState<'pass' | 'warn' | 'block' | null>(null);

  // Step 8: Complete (value stats)
  const [totalAiCost, setTotalAiCost] = useState(0);
  const [totalAiMinutes, setTotalAiMinutes] = useState(0);

  // ── Session Persistence ─────────────────────────────────────────────────

  const SESSION_KEY = 'rc-wizard-session';

  const saveSession = useCallback(() => {
    if (!projectPath) return;
    const session = {
      step,
      projectPath,
      projectName,
      mode,
      ideaText,
      techPrefs,
      totalAiCost,
      totalAiMinutes,
      synthesisResult: synthesisResult.slice(0, 5000),
      designResult: designResult.slice(0, 2000),
      selectedDesignOption,
      architectureResult: architectureResult.slice(0, 2000),
      scanResult: scanResult.slice(0, 2000),
      scanGate,
      savedAt: Date.now(),
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage full or unavailable
    }
  }, [
    step,
    projectPath,
    projectName,
    mode,
    ideaText,
    techPrefs,
    totalAiCost,
    totalAiMinutes,
    synthesisResult,
    designResult,
    selectedDesignOption,
    architectureResult,
    scanResult,
    scanGate,
  ]);

  // Auto-save on step changes
  useEffect(() => {
    if (step > 0) saveSession();
  }, [step, saveSession]);

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const session = JSON.parse(saved);
      // Only restore if less than 4 hours old
      if (Date.now() - session.savedAt > 4 * 60 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      // Restore state
      if (session.projectPath) setProjectPath(session.projectPath);
      if (session.projectName) setProjectName(session.projectName);
      if (session.ideaText) setIdeaText(session.ideaText);
      if (session.mode) setMode(session.mode);
      if (session.techPrefs) setTechPrefs(session.techPrefs);
      if (session.totalAiCost) setTotalAiCost(session.totalAiCost);
      if (session.totalAiMinutes) setTotalAiMinutes(session.totalAiMinutes);
      if (session.synthesisResult) setSynthesisResult(session.synthesisResult);
      if (session.designResult) setDesignResult(session.designResult);
      if (session.selectedDesignOption) setSelectedDesignOption(session.selectedDesignOption);
      if (session.architectureResult) setArchitectureResult(session.architectureResult);
      if (session.scanResult) setScanResult(session.scanResult);
      if (session.scanGate) setScanGate(session.scanGate);
      // Restore to the step (but not mid-running steps like 2 or 5)
      const safeStep = [0, 1, 3, 4, 6, 7, 8].includes(session.step) ? session.step : session.step - 1;
      if (safeStep > 0) setStep(Math.max(0, safeStep));
    } catch {
      // Corrupt session -- ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Back Navigation ─────────────────────────────────────────────────────

  const BACK_MAP: Record<number, number> = {
    1: 0, // Team -> Idea
    3: 1, // Results -> Team
    4: 3, // Design -> Results
    6: 4, // Building -> Design
    7: 6, // Security -> Building
    8: 7, // Complete -> Security
  };

  function handleBack() {
    const prev = BACK_MAP[step];
    if (prev !== undefined && !isRunning) {
      setStep(prev);
    }
  }

  const canGoBack = !isRunning && step in BACK_MAP;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getTeamCost(): number {
    return personas.filter((p) => p.enabled).reduce((sum, p) => sum + p.hourlyRate * p.estimatedHours, 0);
  }

  function getTeamHours(): number {
    return personas.filter((p) => p.enabled).reduce((sum, p) => sum + p.estimatedHours, 0);
  }

  function getEnabledCount(): number {
    return personas.filter((p) => p.enabled).length;
  }

  // ── Step 1: Start project ──────────────────────────────────────────────

  async function handleStartProject() {
    if (!ideaText.trim()) return;

    setIsRunning(true);
    setError('');

    const name = ideaText.trim().split(/\s+/).slice(0, 5).join(' ');
    const slug = slugify(name);

    // Get user's project directory from the API (per-user isolation)
    let home = '/tmp/rc-projects';
    try {
      const res = await fetch(`${BASE}/projects`);
      const data = await res.json();
      if (data.projectsDir) home = data.projectsDir;
    } catch {
      // Fall back to default
    }
    const path = `${home}/${slug}`;

    setProjectName(name);
    setProjectPath(path);

    try {
      setProgress('Setting up your project...');
      const brief = [ideaText, targetUsers ? `Target users: ${targetUsers}` : '', problem ? `Problem: ${problem}` : '']
        .filter(Boolean)
        .join('\n\n');

      if (mode === 'build') {
        // Build Only: skip Pre-RC research, start RC directly
        setProgress('Starting build pipeline...');
        await callTool('rc_start', {
          project_path: path,
          project_name: name,
          description: brief,
        });
        // Auto-approve phases 1-2 to advance to Phase 3 (Architect)
        await callTool('rc_gate', { project_path: path, decision: 'approve' });
        await callTool('rc_gate', { project_path: path, decision: 'approve' });
        setStep(4); // Go to Design step (skip research)
      } else {
        await callTool('prc_start', {
          project_path: path,
          project_name: name,
          brief,
        });
        setProgress('Analyzing complexity...');
        await callTool('prc_classify', { project_path: path });
        setStep(1);
      }
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message}`);
      setRetryAction(() => handleStartProject);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Step 2 -> 3: Start research ────────────────────────────────────────

  async function handleStartResearch() {
    setStep(2);
    setIsRunning(true);
    setError('');
    const startTime = Date.now();

    try {
      // Apply persona toggles -- disable unchecked personas
      const disabledIds = personas.filter((p) => !p.enabled).map((p) => p.id);
      if (disabledIds.length > 0) {
        setProgress('Configuring research team...');
        await configurePersonas(projectPath, disabledIds);
      }

      // Gate 1
      setProgress('Approving research scope...');
      await callTool('prc_gate', {
        project_path: projectPath,
        decision: 'approve',
      });

      // Run stages
      for (let i = 0; i < STAGES.length; i++) {
        setCurrentStage(i + 1);
        setProgress(`Running research stage ${i + 1} of ${STAGES.length}...`);
        setResearchLog((prev) => [...prev, `Stage ${i + 1}: ${STAGES[i].replace('stage-', '').replace(/-/g, ' ')}...`]);

        try {
          await callTool('prc_run_stage', {
            project_path: projectPath,
            stage: STAGES[i],
          });
          setResearchLog((prev) => [...prev, `  Stage ${i + 1} complete.`]);
        } catch {
          setResearchLog((prev) => [...prev, `  Stage ${i + 1} had issues (continuing).`]);
        }

        // Gates 2 and 3 at the right times
        if (i === 2) {
          setProgress('Checkpoint 2...');
          await callTool('prc_gate', {
            project_path: projectPath,
            decision: 'approve',
          });
        }
        if (i === 4) {
          setProgress('Checkpoint 3...');
          await callTool('prc_gate', {
            project_path: projectPath,
            decision: 'approve',
          });
        }
      }

      // Synthesize
      setProgress('Combining research into your requirements document...');
      const synthResult = await callTool('prc_synthesize', { project_path: projectPath });
      setSynthesisResult(extractText(synthResult));

      // Load actual artifacts for download links
      try {
        const arts = await listArtifacts(projectPath);
        setArtifacts(arts);
      } catch {
        // Non-fatal -- downloads just won't show
      }

      const elapsedMin = (Date.now() - startTime) / 60000;
      setTotalAiMinutes((prev) => prev + elapsedMin);

      // Mark personas complete
      setPersonas((prev) => prev.map((p) => ({ ...p, status: 'complete' as MemberStatus })));

      setStep(3);
    } catch (err) {
      setError(`Research error: ${(err as Error).message}`);
      setRetryAction(() => handleStartResearch);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Step 4: Design generation ──────────────────────────────────────────

  async function handleGenerateDesign() {
    setIsRunning(true);
    setError('');
    const startTime = Date.now();

    try {
      setProgress('Generating design options based on your research...');
      const result = await callTool('ux_design', {
        project_path: projectPath,
        option_count: designOptionCount,
        ...(designInspiration ? { inspiration: designInspiration } : {}),
      });
      const text = extractText(result);
      setDesignResult(text);

      // Reload artifacts for wireframe previews
      try {
        const arts = await listArtifacts(projectPath);
        const wireframes = arts.filter((a) => a.path.includes('design/') && a.path.endsWith('.html'));
        setDesignWireframeUrls(wireframes.map((a) => ({ name: a.name, path: a.path })));
      } catch {
        // Non-fatal
      }

      // Parse design spec JSON from the design directory
      try {
        const arts = await listArtifacts(projectPath);
        const specFile = arts.find((a) => a.path.includes('design-spec-') && a.path.endsWith('.json'));
        if (specFile) {
          const specResponse = await fetch(getDownloadUrl(projectPath, specFile.path));
          const spec = await specResponse.json();
          if (spec.options && Array.isArray(spec.options)) {
            const parsed: ParsedDesignOption[] = spec.options.map((opt: Record<string, unknown>) => {
              const style = opt.style as Record<string, unknown> | undefined;
              const palette = (style?.colorPalette ?? {}) as Record<string, string>;
              const typo = (style?.typography ?? {}) as Record<string, string>;
              const tradeoffs = (opt.tradeoffs ?? {}) as Record<string, string[]>;
              return {
                id: String(opt.id ?? ''),
                name: String(opt.name ?? ''),
                personality: String(style?.personality ?? ''),
                icpAlignment: Number(opt.icpAlignment ?? 0),
                colors: {
                  primary: palette.primary ?? '#333',
                  secondary: palette.secondary ?? '#666',
                  background: palette.background ?? '#fff',
                  surface: palette.surface ?? '#f5f5f5',
                },
                typography: {
                  headingFont: typo.headingFont ?? 'sans-serif',
                  bodyFont: typo.bodyFont ?? 'sans-serif',
                },
                strengths: tradeoffs.strengths ?? [],
                weaknesses: tradeoffs.weaknesses ?? [],
              };
            });
            setDesignOptions(parsed);
            setDesignSpecPath(specFile.path);
            if (spec.recommendation?.optionId) {
              setDesignRecommendation(spec.recommendation.optionId);
            }
            // Auto-select if only 1 option
            if (parsed.length === 1) {
              setSelectedDesignOption(parsed[0].id);
              selectDesign(projectPath, parsed[0].id, specFile.path).catch(() => {});
            }
          }
        }
      } catch {
        // Non-fatal -- raw text display is still available
      }

      // Run UX scoring on the design
      setProgress('Scoring UX quality...');
      try {
        await callTool('ux_score', { project_path: projectPath });
      } catch {
        // Non-fatal
      }

      const elapsedMin = (Date.now() - startTime) / 60000;
      setTotalAiMinutes((prev) => prev + elapsedMin);
    } catch (err) {
      setError(`Design generation error: ${(err as Error).message}`);
      setRetryAction(() => handleGenerateDesign);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Step 4 -> 5 -> 6: Architecture ──────────────────────────────────────

  async function handleStartArchitecture() {
    setStep(5);
    setIsRunning(true);
    setError('');
    const startTime = Date.now();

    try {
      if (mode !== 'build') {
        setProgress('Importing research into build pipeline...');
        await callTool('rc_import_prerc', { project_path: projectPath });
        // rc_import_prerc auto-approves Phases 1-2 (Illuminate + Define)
      }
      // Skip directly to Phase 3 (Architect)

      setProgress('Designing architecture...');
      const archResult = await callTool('rc_architect', {
        project_path: projectPath,
        architecture_notes: techPrefs || 'Use best practices based on the PRD requirements.',
      });
      setArchitectureResult(extractText(archResult));

      setProgress('Approving architecture...');
      await callTool('rc_gate', {
        project_path: projectPath,
        decision: 'approve',
      });

      setProgress('Creating build plan...');
      await callTool('rc_sequence', { project_path: projectPath });

      setProgress('Running quality checks...');
      await callTool('rc_validate', { project_path: projectPath });

      await callTool('rc_gate', {
        project_path: projectPath,
        decision: 'approve',
      });

      // Generate diagrams from task data
      setProgress('Generating architecture diagrams...');
      try {
        const diagrams = await generateDiagrams(projectPath);
        setDiagramUrls(diagrams);
      } catch {
        // Non-fatal -- diagrams are optional
      }

      const elapsedMin = (Date.now() - startTime) / 60000;
      setTotalAiMinutes((prev) => prev + elapsedMin);

      setStep(6);
    } catch (err) {
      setError(`Architecture error: ${(err as Error).message}`);
      setRetryAction(() => handleStartArchitecture);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Step 6 -> 7: Build ────────────────────────────────────────────────

  async function handleStartBuild() {
    setStep(6);
    setIsRunning(true);
    setError('');
    const startTime = Date.now();

    try {
      // Get task list from state
      const stateResult = await callTool('rc_status', { project_path: projectPath });
      const stateText = extractText(stateResult);

      // Parse task IDs from status output
      const taskMatches = stateText.match(/TASK-\d+/g) || [];
      const uniqueTasks = [...new Set(taskMatches)].slice(0, 20);

      if (uniqueTasks.length === 0) {
        uniqueTasks.push('TASK-001', 'TASK-002', 'TASK-003');
      }

      setBuildProgress(uniqueTasks.map((id) => ({ id, name: id, done: false })));

      for (const taskId of uniqueTasks) {
        setBuildingTask(taskId);
        setProgress(`Building ${taskId}...`);

        try {
          await callTool('rc_forge_task', {
            project_path: projectPath,
            task_id: taskId,
          });
          setBuildProgress((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: true } : t)));
        } catch {
          // Continue on task failure
          setBuildProgress((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: true } : t)));
        }
      }

      // Approve forge gate to advance past Phase 6
      setProgress('Approving build output...');
      try {
        await callTool('rc_gate', { project_path: projectPath, decision: 'approve' });
      } catch {
        // Non-fatal -- gate may already be at the right phase
      }

      // Phase 7: Integration verification
      setProgress('Verifying component integration...');
      try {
        await callTool('rc_connect', { project_path: projectPath });
        await callTool('rc_gate', { project_path: projectPath, decision: 'approve' });
      } catch {
        // Non-fatal -- continue even if integration check has issues
      }

      // Phase 8: Production hardening assessment
      setProgress('Running production readiness checks...');
      try {
        await callTool('rc_compound', { project_path: projectPath });
        await callTool('rc_gate', { project_path: projectPath, decision: 'approve' });
      } catch {
        // Non-fatal -- continue to security scan
      }

      const elapsedMin = (Date.now() - startTime) / 60000;
      setTotalAiMinutes((prev) => prev + elapsedMin);

      setBuildingTask('');
      setStep(7);
    } catch (err) {
      setError(`Build error: ${(err as Error).message}`);
      setRetryAction(() => handleStartBuild);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Step 7 -> 8: Security scan ────────────────────────────────────────

  async function handleSecurityScan() {
    setStep(7);
    setIsRunning(true);
    setError('');

    try {
      setProgress('Scanning for security issues...');
      const result = await callTool('postrc_scan', { project_path: projectPath });
      const text = extractText(result);
      setScanResult(text);

      if (text.toLowerCase().includes('block')) {
        setScanGate('block');
      } else if (text.toLowerCase().includes('warn')) {
        setScanGate('warn');
      } else {
        setScanGate('pass');
      }

      // Traceability
      setProgress('Mapping requirements to implementation...');
      try {
        await callTool('trace_enhance_prd', { project_path: projectPath });
        await callTool('trace_map_findings', { project_path: projectPath });
      } catch {
        // Non-critical
      }

      setStep(8);
    } catch (err) {
      setError(`Scan error: ${(err as Error).message}`);
      setRetryAction(() => handleSecurityScan);
    } finally {
      setIsRunning(false);
      setProgress('');
    }
  }

  // ── Computed values ────────────────────────────────────────────────────

  const teamCost = getTeamCost();
  const teamHours = getTeamHours();
  const teamSize = getEnabledCount();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-gold-light">
              <ArrowLeft size={14} />
              Projects
            </button>
            {canGoBack && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-gold-light"
              >
                <RotateCcw size={12} />
                Previous step
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full ${
                i < step ? 'h-1 bg-emerald-500' : i === step ? 'h-1 bg-gold' : 'h-1 bg-navy-lighter'
              }`}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {(() => {
            const StepIcon = STEPS[step].icon;
            return (
              <StepIcon size={18} className={step === 2 && isRunning ? 'animate-spin text-teal-light' : 'text-gold'} />
            );
          })()}
          <h2 className="text-xl font-bold text-slate-100">{STEPS[step].label}</h2>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
          <div className="mt-2 flex gap-3">
            {retryAction && (
              <button
                onClick={() => {
                  setError('');
                  setRetryAction(null);
                  retryAction();
                }}
                className="flex items-center gap-1 rounded bg-red-800/50 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-800"
              >
                <RotateCcw size={12} />
                Retry
              </button>
            )}
            <button
              onClick={() => {
                setError('');
                setRetryAction(null);
              }}
              className="text-xs text-red-400 underline hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Progress display */}
      {isRunning && progress && (
        <div className="mb-4 flex items-center gap-2 rounded border border-teal-dim bg-teal-dim/10 p-3 text-sm text-teal-light">
          <Loader2 size={14} className="animate-spin" />
          {progress}
        </div>
      )}

      {/* ── STEP 0: Your Idea ───────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
            <h3 className="mb-2 text-lg font-semibold text-slate-100">What do you want to build?</h3>
            <p className="mb-4 text-sm text-slate-400">
              Describe your product idea in plain language. It can be as simple as "a task management app" or as
              detailed as you like.
            </p>

            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="Example: A SaaS dashboard for small businesses to track their marketing spend across all channels..."
              rows={4}
              className="w-full rounded border border-navy-lighter bg-navy px-4 py-3 text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
              autoFocus
            />

            <button
              onClick={() => setShowOptional(!showOptional)}
              className="mt-2 flex items-center gap-1 text-sm text-slate-400 hover:text-slate-300"
            >
              {showOptional ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showOptional ? 'Hide' : 'Add'} more details (optional)
            </button>

            {showOptional && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-400">Who is this for?</label>
                  <input
                    type="text"
                    value={targetUsers}
                    onChange={(e) => setTargetUsers(e.target.value)}
                    placeholder="Small business owners, marketing teams..."
                    className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">What problem does it solve?</label>
                  <input
                    type="text"
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="They waste hours checking multiple ad platforms..."
                    className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mode selector */}
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
            <h4 className="mb-3 text-sm font-medium text-slate-300">Pipeline mode</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'full', label: 'Full Pipeline', desc: 'Research, design, build, validate' },
                { key: 'research', label: 'Research Only', desc: 'Market analysis and requirements' },
                { key: 'build', label: 'Build Only', desc: 'Skip research, go straight to building' },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key as typeof mode)}
                  className={`rounded border p-3 text-left transition-all ${
                    mode === m.key
                      ? 'border-gold bg-gold/10 text-gold-light'
                      : 'border-navy-lighter text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-slate-500">{m.desc}</div>
                  {m.key === 'full' && <div className="mt-1 text-[10px] text-gold-dim">Recommended</div>}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartProject}
            disabled={!ideaText.trim() || isRunning}
            className="flex w-full items-center justify-center gap-2 rounded bg-gold px-6 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                Start Building
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      )}

      {/* ── STEP 1: Your Team ───────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
            <p className="text-sm text-slate-300">
              I've assembled a team of <span className="font-semibold text-gold">{teamSize} specialists</span> to
              analyze your idea. Here's who will work on your project:
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <div className="rounded bg-navy p-2">
                <div className="font-mono text-lg font-bold text-teal-light">{teamSize}</div>
                <div className="text-xs text-slate-500">team members</div>
              </div>
              <div className="rounded bg-navy p-2">
                <div className="font-mono text-lg font-bold text-gold">{teamHours}h</div>
                <div className="text-xs text-slate-500">human hours</div>
              </div>
              <div className="rounded bg-navy p-2">
                <div className="font-mono text-lg font-bold text-emerald-400">${teamCost.toLocaleString()}</div>
                <div className="text-xs text-slate-500">human cost</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {personas.map((p) => (
              <TeamMemberCard
                key={p.id}
                roleTitle={p.roleTitle}
                description={p.description}
                category={p.category}
                hourlyRate={p.hourlyRate}
                estimatedHours={p.estimatedHours}
                status={p.status}
                toggleable
                enabled={p.enabled}
                onToggle={(enabled) => {
                  setPersonas((prev) => prev.map((pp) => (pp.id === p.id ? { ...pp, enabled } : pp)));
                }}
              />
            ))}
          </div>

          <button
            onClick={handleStartResearch}
            disabled={isRunning}
            className="flex w-full items-center justify-center gap-2 rounded bg-gold px-6 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
          >
            Start Research
            <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* ── STEP 2: Research in Progress ─────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Research Progress</h3>
              <span className="font-mono text-xs text-gold">
                {currentStage} / {STAGES.length} stages
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-4 h-2 rounded-full bg-navy">
              <div
                className="h-2 rounded-full bg-teal transition-all"
                style={{ width: `${(currentStage / STAGES.length) * 100}%` }}
              />
            </div>

            {/* Log */}
            <div className="max-h-60 overflow-auto rounded bg-navy p-3 font-mono text-xs text-slate-400">
              {researchLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2 text-teal-light">
                  <Loader2 size={10} className="animate-spin" />
                  {progress}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Research Results ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-emerald-800 bg-emerald-900/10 p-4">
            <h3 className="mb-2 text-lg font-semibold text-emerald-300">Research Complete</h3>
            <p className="text-sm text-slate-300">
              Your team of {teamSize} specialists completed {STAGES.length} research stages. This research replaces
              approximately <span className="font-semibold text-gold">${teamCost.toLocaleString()}</span> of
              professional consulting work.
            </p>
          </div>

          <ValueDisplay
            aiCostUsd={totalAiCost}
            humanCostUsd={teamCost}
            humanHours={teamHours}
            teamSize={teamSize}
            speedMultiplier={totalAiMinutes > 0 ? Math.min(999, Math.round((teamHours * 60) / totalAiMinutes)) : 0}
            savingsPercent={teamCost > 0 ? ((teamCost - totalAiCost) / teamCost) * 100 : 0}
          />

          {synthesisResult && artifacts.length > 0 && (
            <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
              <h4 className="mb-2 text-sm font-medium text-slate-300">Deliverables</h4>
              <div className="space-y-2">
                {artifacts
                  .filter((a) => a.domain === 'Pre-RC')
                  .map((a) => (
                    <a
                      key={a.path}
                      href={getDownloadUrl(projectPath, a.path)}
                      className="flex items-center gap-2 rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-300 transition-colors hover:border-gold-dim"
                      download
                    >
                      <Download size={14} className="text-slate-500" />
                      {a.name}
                    </a>
                  ))}
                <a
                  href={getExportUrl(projectPath, {
                    title: projectName,
                    subtitle: 'Research Deliverables',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded border border-gold-dim bg-gold/10 px-3 py-2 text-sm text-gold-light transition-colors hover:bg-gold/20"
                >
                  <FileText size={14} />
                  Open as printable PDF
                </a>
              </div>
            </div>
          )}

          {mode !== 'research' && (
            <div className="space-y-3">
              <button
                onClick={() => setStep(4)}
                disabled={isRunning}
                className="flex w-full items-center justify-center gap-2 rounded bg-gold px-6 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
              >
                Continue to Design
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {mode === 'research' && (
            <button
              onClick={() => onComplete(projectPath)}
              className="flex w-full items-center justify-center gap-2 rounded bg-emerald-600 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <Trophy size={18} />
              Finish -- Download Deliverables
            </button>
          )}
        </div>
      )}

      {/* ── STEP 4: Design ──────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
            <h3 className="mb-2 text-lg font-semibold text-slate-100">Design Your Product</h3>
            <p className="mb-4 text-sm text-slate-400">
              I'll generate visual design options based on your research -- target users, competitor gaps, and current
              design trends. You can provide inspiration or let the AI design from scratch.
            </p>

            {/* Option count selector */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-300">How many design options?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDesignOptionCount(1)}
                  className={`rounded border p-3 text-left transition-all ${
                    designOptionCount === 1
                      ? 'border-gold bg-gold/10 text-gold-light'
                      : 'border-navy-lighter text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-medium">1 option</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <DollarSign size={10} />
                    ~$0.18 estimated
                  </div>
                </button>
                <button
                  onClick={() => setDesignOptionCount(3)}
                  className={`rounded border p-3 text-left transition-all ${
                    designOptionCount === 3
                      ? 'border-gold bg-gold/10 text-gold-light'
                      : 'border-navy-lighter text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-medium">3 options</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <DollarSign size={10} />
                    ~$0.54 estimated (recommended)
                  </div>
                </button>
              </div>
            </div>

            {/* Inspiration input */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-300">Design inspiration (optional)</label>
              <textarea
                value={designInspiration}
                onChange={(e) => setDesignInspiration(e.target.value)}
                placeholder="Describe the style you want, share website URLs for inspiration, or leave blank to let AI design based on your target users..."
                rows={3}
                className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
              />
            </div>

            {/* Tech preferences */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-300">Technology preferences (optional)</label>
              <input
                type="text"
                value={techPrefs}
                onChange={(e) => setTechPrefs(e.target.value)}
                placeholder="e.g., React, Next.js, Python, PostgreSQL..."
                className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
              />
            </div>

            {!designResult && (
              <button
                onClick={handleGenerateDesign}
                disabled={isRunning}
                className="flex w-full items-center justify-center gap-2 rounded bg-gold px-6 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating designs...
                  </>
                ) : (
                  <>
                    <Palette size={18} />
                    Generate Design Options
                  </>
                )}
              </button>
            )}
          </div>

          {/* Design results */}
          {designResult && (
            <div className="space-y-4">
              {/* Design option cards */}
              {designOptions.length > 0 ? (
                <>
                  {/* Recommendation banner */}
                  {designRecommendation && designOptions.length > 1 && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-900/10 px-4 py-3">
                      <Star size={16} className="text-emerald-400" />
                      <span className="text-sm text-emerald-300">
                        Option {designRecommendation} is recommended based on your target users and market research.
                      </span>
                    </div>
                  )}

                  <div
                    className={`grid gap-4 ${designOptions.length === 1 ? 'grid-cols-1' : designOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                  >
                    {designOptions.map((opt) => (
                      <DesignOptionCard
                        key={opt.id}
                        optionId={opt.id}
                        name={opt.name}
                        personality={opt.personality}
                        icpAlignment={opt.icpAlignment}
                        colors={opt.colors}
                        typography={opt.typography}
                        strengths={opt.strengths}
                        weaknesses={opt.weaknesses}
                        isRecommended={opt.id === designRecommendation}
                        isSelected={opt.id === selectedDesignOption}
                        onSelect={() => {
                          setSelectedDesignOption(opt.id);
                          if (designSpecPath) {
                            selectDesign(projectPath, opt.id, designSpecPath).catch(() => {});
                          }
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-emerald-800 bg-emerald-900/10 p-4">
                  <h3 className="mb-2 text-lg font-semibold text-emerald-300">Design Options Ready</h3>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-400">
                    {designResult.slice(0, 3000)}
                  </pre>
                </div>
              )}

              {/* Wireframe preview -- scoped to selected option */}
              {designWireframeUrls.length > 0 && (
                <DesignPreview
                  wireframes={
                    selectedDesignOption
                      ? designWireframeUrls.filter((wf) =>
                          wf.path.includes(`option-${selectedDesignOption.toLowerCase()}`),
                        )
                      : designWireframeUrls
                  }
                  getUrl={(p) => getDownloadUrl(projectPath, p)}
                />
              )}

              <button
                onClick={handleStartArchitecture}
                disabled={isRunning || (designOptions.length > 1 && !selectedDesignOption)}
                className="flex w-full items-center justify-center gap-2 rounded bg-gold px-6 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
              >
                {designOptions.length > 1 && !selectedDesignOption
                  ? 'Select a design to continue'
                  : 'Continue to Architecture'}
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 5: Architecture in Progress ──────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-300">Architecture and Planning</h3>
            {isRunning ? (
              <div className="flex items-center gap-2 text-sm text-teal-light">
                <Loader2 size={14} className="animate-spin" />
                {progress}
              </div>
            ) : (
              <>
                {architectureResult && (
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-400">
                    {architectureResult.slice(0, 2000)}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 6: Building ──────────────────────────────────────────────── */}
      {step === 6 && (
        <div className="space-y-6">
          {buildProgress.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-6 text-center">
                <Hammer size={32} className="mx-auto mb-3 text-gold" />
                <h3 className="mb-2 text-lg font-semibold text-slate-100">Ready to Build</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Architecture and planning are complete. Ready to start building your project.
                </p>
                <button
                  onClick={handleStartBuild}
                  disabled={isRunning}
                  className="rounded bg-gold px-6 py-2.5 font-semibold text-navy hover:bg-gold-light disabled:opacity-50"
                >
                  Build All Tasks
                </button>
              </div>

              {/* Architecture diagrams */}
              {diagramUrls.length > 0 && (
                <DiagramTabs diagrams={diagramUrls} getUrl={(p) => getDownloadUrl(projectPath, p)} />
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300">Build Progress</h3>
                <span className="font-mono text-xs text-gold">
                  {buildProgress.filter((t) => t.done).length} / {buildProgress.length}
                </span>
              </div>

              <div className="space-y-1">
                {buildProgress.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-sm">
                    {task.done ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    ) : task.id === buildingTask ? (
                      <Loader2 size={12} className="animate-spin text-teal-light" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-600" />
                    )}
                    <span className={task.done ? 'text-slate-500' : 'text-slate-300'}>{task.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 7: Security ──────────────────────────────────────────────── */}
      {step === 7 && !scanResult && (
        <div className="space-y-6">
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-6 text-center">
            <Shield size={32} className="mx-auto mb-3 text-emerald-400" />
            <h3 className="mb-2 text-lg font-semibold text-slate-100">Security and Quality Check</h3>
            <p className="mb-4 text-sm text-slate-400">
              Scan your project for security vulnerabilities and verify requirement coverage.
            </p>
            <button
              onClick={handleSecurityScan}
              disabled={isRunning}
              className="rounded bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Run Security Scan
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 8: Security Results + Complete ──────────────────────────── */}
      {step === 8 && (
        <div className="space-y-6">
          <GateApproval
            title="Security Scan Results"
            summary={
              scanGate === 'pass'
                ? 'No critical issues found. Your project is ready to ship.'
                : scanGate === 'warn'
                  ? 'Some non-critical issues were found. Review recommended but not blocking.'
                  : 'Critical issues were found. These should be addressed before shipping.'
            }
            findings={
              scanResult
                ? scanResult
                    .split('\n')
                    .filter((l) => l.trim())
                    .slice(0, 5)
                : undefined
            }
            recommendation={scanGate === 'pass' ? 'approve' : scanGate === 'warn' ? 'review' : 'reject'}
            onApprove={() => {
              callTool('postrc_gate', {
                project_path: projectPath,
                decision: 'approve',
              }).catch(() => {});
            }}
            onReject={() => {
              // Go back to security step to re-run or fix
              setStep(7);
              setScanResult('');
              setScanGate(null);
            }}
          />

          {/* Final Value Report */}
          <div className="rounded-lg border border-gold-dim/30 bg-navy-light p-6">
            <h3 className="mb-4 text-center text-xl font-bold text-gold">Your Project is Complete</h3>

            {/* Compute real values from what actually ran */}
            {(() => {
              // Research phase: persona team cost/hours
              const researchCost = teamCost;
              const researchHours = teamHours;
              // Build phase: estimate based on tasks built
              const tasksBuilt = buildProgress.filter((t) => t.done).length;
              const buildHoursPerTask = 16; // avg developer hours per task
              const buildRatePerHour = 150; // avg developer hourly rate
              const buildHours = tasksBuilt * buildHoursPerTask;
              const buildCost = buildHours * buildRatePerHour;
              // Security/validation phase
              const securityHours = scanResult ? 24 : 0;
              const securityCost = securityHours * 200;
              // Total human equivalent
              const totalHumanCost = researchCost + buildCost + securityCost;
              const totalHumanHours = researchHours + buildHours + securityHours;
              const totalRoles = teamSize + (tasksBuilt > 0 ? 3 : 0) + (scanResult ? 2 : 0); // +devs +security
              const speedMult =
                totalAiMinutes > 0 ? Math.min(999, Math.round((totalHumanHours * 60) / totalAiMinutes)) : 0;
              const savingsPct = totalHumanCost > 0 ? ((totalHumanCost - totalAiCost) / totalHumanCost) * 100 : 0;

              return (
                <ValueDisplay
                  aiCostUsd={totalAiCost}
                  humanCostUsd={totalHumanCost}
                  humanHours={totalHumanHours}
                  teamSize={totalRoles}
                  speedMultiplier={speedMult}
                  savingsPercent={Math.min(99.9, savingsPct)}
                />
              );
            })()}

            <div className="mt-4 space-y-3">
              {/* Execution summary */}
              <div className="rounded bg-navy p-3">
                <h4 className="mb-2 text-xs font-medium text-slate-400">What was produced</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>
                    Research: {STAGES.length} stages, {teamSize} specialists
                  </div>
                  <div>Design: {designOptions.length > 0 ? `${designOptions.length} option(s)` : 'skipped'}</div>
                  <div>Build: {buildProgress.filter((t) => t.done).length} tasks completed</div>
                  <div>
                    Security:{' '}
                    {scanGate === 'pass' ? 'passed' : scanGate === 'warn' ? 'warnings' : (scanGate ?? 'pending')}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href={`${BASE}/project/playbook?path=${encodeURIComponent(projectPath)}&format=html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded border border-gold-dim bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold-light transition-colors hover:bg-gold/20"
                >
                  <FileText size={16} />
                  Download Playbook (PDF)
                </a>
                <a
                  href={getExportUrl(projectPath, { title: projectName, subtitle: 'All Deliverables' })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded border border-navy-lighter px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-gold-dim"
                >
                  <Download size={16} />
                  Export All as PDF
                </a>
              </div>
              <button
                onClick={() => {
                  sessionStorage.removeItem(SESSION_KEY);
                  onComplete(projectPath);
                }}
                className="w-full rounded bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Open in Pipeline View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
