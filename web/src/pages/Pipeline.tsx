import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  GitBranch,
  RefreshCw,
  Download,
  FileText,
  Shield,
  Target,
  ChevronRight,
  BookOpen,
  Printer,
} from 'lucide-react';
import {
  callTool,
  extractText,
  getPipelineState,
  listArtifacts,
  getDownloadUrl,
  getExportUrl,
  type PipelineState,
  type ArtifactInfo,
  BASE,
} from '../api';
import { PhaseCard, type PhaseStatus } from '../components/PhaseCard';
import { ToolOutput } from '../components/ToolOutput';
import { TokenDisplay } from '../components/TokenDisplay';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ActivityEntry } from '../App';

interface PipelineProps {
  projectPath: string;
  activity: ActivityEntry[];
  onBack: () => void;
}

// ── Phase definitions with dynamic status mapping ───────────────────────────

interface PhaseDef {
  number: number;
  name: string;
  domain: string;
  description: string;
  tools: string[];
}

const PHASE_DEFS: PhaseDef[] = [
  {
    number: 1,
    name: 'Start & Classify',
    domain: 'Pre-RC',
    description: 'Initialize research and classify product complexity using the Cynefin framework.',
    tools: ['prc_start', 'prc_classify'],
  },
  {
    number: 2,
    name: 'Research Stages',
    domain: 'Pre-RC',
    description: 'Run 20 AI research specialists across 6 stages -- user intelligence, market, technical, UX, and validation.',
    tools: ['prc_run_stage', 'prc_status'],
  },
  {
    number: 3,
    name: 'Research Gates',
    domain: 'Pre-RC',
    description: 'Review and approve research quality at 3 checkpoints.',
    tools: ['prc_gate'],
  },
  {
    number: 4,
    name: 'Synthesize',
    domain: 'Pre-RC',
    description: 'Combine research into a structured PRD, consulting deck, and task list.',
    tools: ['prc_synthesize'],
  },
  {
    number: 5,
    name: 'Import & Illuminate',
    domain: 'RC',
    description: 'Import Pre-RC research into the RC Method and begin structured development.',
    tools: ['rc_import_prerc', 'rc_start', 'rc_illuminate'],
  },
  {
    number: 6,
    name: 'Define & Architect',
    domain: 'RC',
    description: 'Define requirements and design system architecture.',
    tools: ['rc_define', 'rc_architect'],
  },
  {
    number: 7,
    name: 'Sequence & Validate',
    domain: 'RC',
    description: 'Create task ordering with dependencies, then run quality checks.',
    tools: ['rc_sequence', 'rc_validate'],
  },
  {
    number: 8,
    name: 'Forge & Build',
    domain: 'RC',
    description: 'Execute tasks with AI-generated implementation guidance.',
    tools: ['rc_forge_task', 'rc_gate'],
  },
  {
    number: 9,
    name: 'UX Review',
    domain: 'RC',
    description: 'Score UX quality, run accessibility audit, generate improvements.',
    tools: ['ux_score', 'ux_audit', 'ux_generate'],
  },
  {
    number: 10,
    name: 'Security Scan',
    domain: 'Post-RC',
    description: 'Analyze code for security vulnerabilities. Override findings with justification.',
    tools: ['postrc_scan', 'postrc_override', 'postrc_report'],
  },
  {
    number: 11,
    name: 'Ship Gate',
    domain: 'Post-RC',
    description: 'Final go/no-go decision based on scan results.',
    tools: ['postrc_gate', 'postrc_status'],
  },
  {
    number: 12,
    name: 'Traceability',
    domain: 'Traceability',
    description: 'Assign requirement IDs, map findings, generate coverage matrix.',
    tools: ['trace_enhance_prd', 'trace_map_findings', 'trace_status'],
  },
];

// Tool argument definitions
const TOOL_ARGS: Record<string, Array<{ key: string; label: string; placeholder: string; multiline?: boolean }>> = {
  prc_start: [
    { key: 'project_name', label: 'Project Name', placeholder: 'My App' },
    { key: 'brief', label: 'Product Brief', placeholder: 'Describe your product...', multiline: true },
  ],
  prc_run_stage: [{ key: 'stage', label: 'Stage', placeholder: 'stage-1-meta | stage-2-user | ...' }],
  prc_gate: [
    { key: 'gate_number', label: 'Gate Number', placeholder: '1, 2, or 3' },
    { key: 'decision', label: 'Decision', placeholder: 'approve | reject | question' },
    { key: 'feedback', label: 'Feedback', placeholder: 'Optional feedback...', multiline: true },
  ],
  rc_gate: [
    { key: 'decision', label: 'Decision', placeholder: 'approve | reject | question' },
    { key: 'feedback', label: 'Feedback', placeholder: 'Optional feedback...', multiline: true },
  ],
  rc_forge_task: [{ key: 'task_id', label: 'Task ID', placeholder: 'TASK-001' }],
  postrc_gate: [
    { key: 'decision', label: 'Decision', placeholder: 'approve | reject | question' },
    { key: 'feedback', label: 'Feedback', placeholder: 'Optional feedback...', multiline: true },
  ],
  postrc_override: [
    { key: 'finding_id', label: 'Finding ID', placeholder: 'SEC-001' },
    { key: 'reason', label: 'Reason', placeholder: 'Why this override is acceptable...' },
  ],
  postrc_configure: [
    { key: 'block_on_critical', label: 'Block on Critical', placeholder: 'true | false' },
  ],
};

export function Pipeline({ projectPath, activity, onBack }: PipelineProps) {
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolOutput, setToolOutput] = useState<{ name: string; text: string; isError: boolean } | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);

  // Tool argument dialog
  const [argDialog, setArgDialog] = useState<string | null>(null);
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({});

  // Confirmation dialog for gate approvals
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  } | null>(null);

  // Active tab in sidebar
  const [sideTab, setSideTab] = useState<'status' | 'artifacts' | 'activity'>('status');

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const [state, arts] = await Promise.all([
        getPipelineState(projectPath),
        listArtifacts(projectPath),
      ]);
      setPipelineState(state);
      setArtifacts(arts);
    } catch (err) {
      console.error('Failed to load state:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Map pipeline state to phase statuses
  function getPhaseStatus(phaseDef: PhaseDef): PhaseStatus {
    if (!pipelineState) return 'pending';
    const { preRc, rc, postRc, traceability } = pipelineState;

    switch (phaseDef.domain) {
      case 'Pre-RC': {
        if (!preRc) return 'pending';
        const stageStatuses = preRc.stages.map((s) => s.status);
        const gateStatuses = preRc.gates.map((g) => g.status);

        if (phaseDef.number === 1) {
          // Start & Classify -- complete if classification exists
          if (preRc.classification) return 'complete';
          if (stageStatuses.length > 0) return 'active';
          return 'pending';
        }
        if (phaseDef.number === 2) {
          // Research Stages
          const done = stageStatuses.filter((s) => s === 'done').length;
          const running = stageStatuses.some((s) => s === 'running');
          if (done === stageStatuses.length && done > 0) return 'complete';
          if (running || done > 0) return 'active';
          if (preRc.classification) return 'pending';
          return 'locked';
        }
        if (phaseDef.number === 3) {
          // Research Gates
          const allApproved = gateStatuses.every((s) => s === 'approved');
          const anyRejected = gateStatuses.some((s) => s === 'rejected');
          if (allApproved && gateStatuses.length >= 3) return 'complete';
          if (anyRejected) return 'failed';
          if (gateStatuses.length > 0) return 'active';
          return 'locked';
        }
        if (phaseDef.number === 4) {
          // Synthesize
          if (preRc.pipelineMessage.includes('complete')) return 'complete';
          if (preRc.artifactCount > 0) return 'active';
          return 'locked';
        }
        return 'pending';
      }

      case 'RC': {
        if (!rc) return preRc ? 'pending' : 'locked';
        const phase = rc.currentPhase;

        if (phaseDef.number === 5) {
          // Import + Illuminate (phases 1-2)
          if (phase > 2) return 'complete';
          if (phase >= 1) return 'active';
          return 'pending';
        }
        if (phaseDef.number === 6) {
          // Define + Architect (phases 2-3)
          if (phase > 3) return 'complete';
          if (phase >= 2) return 'active';
          return 'locked';
        }
        if (phaseDef.number === 7) {
          // Sequence + Validate (phases 4-5)
          if (phase > 5) return 'complete';
          if (phase >= 4) return 'active';
          return 'locked';
        }
        if (phaseDef.number === 8) {
          // Forge (phase 6)
          if (phase > 6) return 'complete';
          if (phase === 6) return 'active';
          return 'locked';
        }
        if (phaseDef.number === 9) {
          // UX Review (phase 7-8)
          if (phase >= 8) return 'complete';
          if (phase >= 7) return 'active';
          return 'locked';
        }
        return 'locked';
      }

      case 'Post-RC': {
        if (!postRc) return rc ? 'pending' : 'locked';
        if (phaseDef.number === 10) {
          if (postRc.scanCount > 0) return 'complete';
          return 'pending';
        }
        if (phaseDef.number === 11) {
          const hasApproval = postRc.gateHistory.some((g) => g.decision === 'approved');
          if (hasApproval) return 'complete';
          if (postRc.scanCount > 0) return 'pending';
          return 'locked';
        }
        return 'locked';
      }

      case 'Traceability': {
        if (!traceability) return 'pending';
        if (traceability.totalRequirements > 0) return 'complete';
        return 'pending';
      }
    }

    return 'pending';
  }

  async function executeTool(toolName: string) {
    // Check if this is a gate tool -- require confirmation
    const isGateTool = toolName.includes('gate') && toolArgs.decision === 'approve';
    if (isGateTool && !confirmAction) {
      setConfirmAction({
        title: 'Confirm Gate Approval',
        message: `You are about to approve the ${toolName} gate. This will advance the pipeline to the next phase. This action cannot be undone.`,
        onConfirm: () => {
          setConfirmAction(null);
          doExecute(toolName);
        },
      });
      return;
    }

    // Check if tool needs args
    if (TOOL_ARGS[toolName] && !argDialog) {
      setArgDialog(toolName);
      setToolArgs({});
      return;
    }

    doExecute(toolName);
  }

  async function doExecute(toolName: string) {
    setArgDialog(null);
    setRunningTool(toolName);
    setToolOutput(null);

    const args: Record<string, unknown> = { project_path: projectPath, ...toolArgs };
    setToolArgs({});

    try {
      const result = await callTool(toolName, args);
      const text = extractText(result);
      setToolOutput({ name: toolName, text, isError: !!result.isError });
    } catch (err) {
      setToolOutput({ name: toolName, text: `Error: ${(err as Error).message}`, isError: true });
    } finally {
      setRunningTool(null);
      refresh();
    }
  }

  const projectName = projectPath.split('/').pop() || 'Project';

  // Sidebar domain summary cards
  const preRc = pipelineState?.preRc;
  const rc = pipelineState?.rc;
  const postRc = pipelineState?.postRc;
  const trace = pipelineState?.traceability;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded p-1 text-slate-400 transition-colors hover:text-gold-light">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">{projectName}</h2>
            <p className="font-mono text-xs text-slate-500">{projectPath}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${BASE}/project/playbook?path=${encodeURIComponent(projectPath)}&format=html`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 hover:border-gold-dim hover:text-gold-light"
            title="Generate and view playbook"
          >
            <BookOpen size={14} />
            Playbook
          </a>
          <a
            href={getExportUrl(projectPath, { title: projectName })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 hover:border-gold-dim hover:text-gold-light"
            title="Export all deliverables as printable HTML"
          >
            <Printer size={14} />
            Export
          </a>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 hover:border-gold-dim hover:text-gold-light disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Domain summary bar */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <DomainCard
          label="Pre-RC"
          icon={<Play size={14} />}
          color="text-teal-light"
          stats={
            preRc
              ? `${preRc.stages.filter((s) => s.status === 'done').length}/${preRc.stages.length} stages`
              : 'Not started'
          }
          detail={preRc?.classification || ''}
        />
        <DomainCard
          label="RC Method"
          icon={<FileText size={14} />}
          color="text-gold-light"
          stats={rc ? `Phase ${rc.currentPhase} -- ${rc.phaseName}` : 'Not started'}
          detail={rc ? `${rc.gatesPassed}/${rc.totalGates} gates passed` : ''}
        />
        <DomainCard
          label="Post-RC"
          icon={<Shield size={14} />}
          color="text-emerald-300"
          stats={postRc ? `${postRc.scanCount} scan(s)` : 'Not started'}
          detail={
            postRc?.latestScan
              ? `Gate: ${postRc.latestScan.gate} | ${postRc.latestScan.critical}C ${postRc.latestScan.high}H`
              : ''
          }
        />
        <DomainCard
          label="Traceability"
          icon={<Target size={14} />}
          color="text-purple-300"
          stats={trace ? `${trace.totalRequirements} reqs` : 'Not started'}
          detail={trace ? `${trace.coveragePercent}% coverage` : ''}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Pipeline phases */}
        <div className="space-y-3 xl:col-span-2">
          {PHASE_DEFS.map((phaseDef) => (
            <PhaseCard
              key={phaseDef.number}
              {...phaseDef}
              status={getPhaseStatus(phaseDef)}
              onRunTool={(tool) => executeTool(tool)}
              running={runningTool !== null}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Tab buttons */}
          <div className="flex gap-1 rounded-lg border border-navy-lighter bg-navy-light p-1">
            {(['status', 'artifacts', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSideTab(tab)}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  sideTab === tab ? 'bg-navy-lighter text-gold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'status' ? 'Status' : tab === 'artifacts' ? `Files (${artifacts.length})` : 'Activity'}
              </button>
            ))}
          </div>

          {/* Status tab */}
          {sideTab === 'status' && (
            <>
              <TokenDisplay
                totalTokens={pipelineState?.tokens.totalTokens || 0}
                summary={pipelineState?.tokens.summary}
              />

              {/* RC phases detail */}
              {rc && (
                <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
                  <h4 className="mb-2 text-sm font-medium text-gold-light">RC Method Phases</h4>
                  <div className="space-y-1">
                    {rc.phases.map((p) => (
                      <div key={p.number} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.status === 'complete'
                              ? 'bg-emerald-400'
                              : p.status === 'active'
                                ? 'bg-teal-light'
                                : 'bg-slate-600'
                          }`}
                        />
                        <span className="font-mono text-slate-500">{p.number}.</span>
                        <span className="text-slate-400">{p.name}</span>
                        <span className="ml-auto text-slate-600">{p.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500">
                    <span>PRDs: {rc.prdCount}</span>
                    <span>Tasks: {rc.taskCount}</span>
                    <span>UX: {rc.uxScore}</span>
                  </div>
                </div>
              )}

              {/* Pre-RC stages detail */}
              {preRc && preRc.stages.length > 0 && (
                <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
                  <h4 className="mb-2 text-sm font-medium text-teal-light">Research Stages</h4>
                  <div className="space-y-1">
                    {preRc.stages.map((s) => (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            s.status === 'done'
                              ? 'bg-emerald-400'
                              : s.status === 'running'
                                ? 'bg-teal-light animate-pulse'
                                : s.status === 'skip'
                                  ? 'bg-slate-600'
                                  : 'bg-slate-700'
                          }`}
                        />
                        <span className="text-slate-400">{s.name.replace('stage-', '').replace(/-/g, ' ')}</span>
                        <span className="ml-auto text-slate-600">{s.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {preRc.artifactCount} artifacts | {preRc.totalTokens.toLocaleString()} tokens
                  </div>
                </div>
              )}

              {/* Post-RC scan detail */}
              {postRc?.latestScan && (
                <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
                  <h4 className="mb-2 text-sm font-medium text-emerald-300">Latest Scan</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">ID</span>
                      <span className="font-mono text-slate-300">{postRc.latestScan.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gate</span>
                      <span
                        className={`font-medium ${
                          postRc.latestScan.gate === 'pass'
                            ? 'text-emerald-400'
                            : postRc.latestScan.gate === 'block'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                        }`}
                      >
                        {postRc.latestScan.gate}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-3">
                      <SeverityBadge label="Critical" count={postRc.latestScan.critical} color="text-red-400" />
                      <SeverityBadge label="High" count={postRc.latestScan.high} color="text-orange-400" />
                      <SeverityBadge label="Medium" count={postRc.latestScan.medium} color="text-yellow-400" />
                    </div>
                  </div>
                </div>
              )}

              {/* Traceability coverage */}
              {trace && trace.totalRequirements > 0 && (
                <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
                  <h4 className="mb-2 text-sm font-medium text-purple-300">Coverage</h4>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-navy">
                      <div
                        className="h-2 rounded-full bg-purple-400"
                        style={{ width: `${Math.min(trace.coveragePercent, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm text-purple-300">{trace.coveragePercent}%</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {trace.totalRequirements} requirements |{' '}
                    {trace.orphanRequirements.length} orphan reqs |{' '}
                    {trace.orphanTasks.length} orphan tasks
                  </div>
                </div>
              )}
            </>
          )}

          {/* Artifacts tab */}
          {sideTab === 'artifacts' && (
            <div className="rounded-lg border border-navy-lighter bg-navy-light">
              {artifacts.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No artifacts yet. Run pipeline tools to generate PRDs, reports, and decks.
                </div>
              ) : (
                <div className="divide-y divide-navy-lighter/50">
                  {artifacts.map((art) => (
                    <a
                      key={art.path}
                      href={getDownloadUrl(projectPath, art.path)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-navy/50"
                      download
                    >
                      <Download size={14} className="shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-300">{art.name}</div>
                        <div className="flex gap-2 text-xs text-slate-500">
                          <span>{art.domain}</span>
                          <span>{art.type}</span>
                          <span>{formatBytes(art.size)}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-slate-600" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity tab */}
          {sideTab === 'activity' && (
            <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
                <GitBranch size={14} className="text-teal" />
                Activity Log
              </div>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet</p>
              ) : (
                <div className="max-h-96 space-y-1.5 overflow-auto">
                  {activity.slice(0, 50).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          entry.type === 'complete'
                            ? 'bg-emerald-400'
                            : entry.type === 'error'
                              ? 'bg-red-400'
                              : 'bg-teal-light'
                        }`}
                      />
                      <div>
                        <span className="text-slate-400">{entry.message}</span>
                        <span className="ml-2 text-slate-600">{formatTime(entry.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tool output panel */}
      {toolOutput && (
        <div className="mt-6">
          <ToolOutput
            toolName={toolOutput.name}
            output={toolOutput.text}
            isError={toolOutput.isError}
            onClose={() => setToolOutput(null)}
          />
        </div>
      )}

      {/* Tool argument dialog */}
      {argDialog && TOOL_ARGS[argDialog] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-navy-lighter bg-navy-light p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gold">{argDialog}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeTool(argDialog);
              }}
              className="space-y-3"
            >
              {TOOL_ARGS[argDialog].map((arg) => (
                <div key={arg.key}>
                  <label className="mb-1 block text-sm text-slate-400">{arg.label}</label>
                  {arg.multiline ? (
                    <textarea
                      value={toolArgs[arg.key] || ''}
                      onChange={(e) => setToolArgs((prev) => ({ ...prev, [arg.key]: e.target.value }))}
                      placeholder={arg.placeholder}
                      rows={3}
                      className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={toolArgs[arg.key] || ''}
                      onChange={(e) => setToolArgs((prev) => ({ ...prev, [arg.key]: e.target.value }))}
                      placeholder={arg.placeholder}
                      className="w-full rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                    />
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setArgDialog(null)}
                  className="rounded border border-navy-lighter px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-gold px-4 py-2 text-sm font-medium text-navy hover:bg-gold-light"
                >
                  Execute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmLabel="Approve"
        variant={confirmAction?.variant}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DomainCard({
  label,
  icon,
  color,
  stats,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  stats: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light p-3">
      <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${color}`}>
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-slate-200">{stats}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

function SeverityBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`font-mono text-sm font-bold ${count > 0 ? color : 'text-slate-600'}`}>{count}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
