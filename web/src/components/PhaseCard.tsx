import { CheckCircle2, Circle, Loader2, XCircle, Lock } from 'lucide-react';

export type PhaseStatus = 'locked' | 'pending' | 'active' | 'complete' | 'failed';

interface PhaseCardProps {
  number: number;
  name: string;
  domain: string;
  description: string;
  status: PhaseStatus;
  tools: string[];
  onRunTool?: (tool: string) => void;
  running?: boolean;
}

const statusConfig: Record<PhaseStatus, { icon: typeof Circle; color: string; bg: string }> = {
  locked: { icon: Lock, color: 'text-slate-600', bg: 'border-slate-700 bg-navy' },
  pending: { icon: Circle, color: 'text-slate-400', bg: 'border-navy-lighter bg-navy-light' },
  active: { icon: Loader2, color: 'text-teal-light', bg: 'border-teal-dim bg-teal-dim/10' },
  complete: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'border-emerald-800 bg-emerald-900/20' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'border-red-800 bg-red-900/20' },
};

const domainColors: Record<string, string> = {
  'Pre-RC': 'text-teal-light',
  RC: 'text-gold-light',
  'Post-RC': 'text-emerald-300',
  Traceability: 'text-purple-300',
};

export function PhaseCard({ number, name, domain, description, status, tools, onRunTool, running }: PhaseCardProps) {
  const { icon: Icon, color, bg } = statusConfig[status];
  const isInteractive = status === 'pending' || status === 'active' || status === 'failed';

  return (
    <div className={`rounded-lg border p-4 transition-all ${bg}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon size={18} className={`${color} ${status === 'active' ? 'animate-spin' : ''}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{number}.</span>
              <h3 className="font-semibold text-slate-200">{name}</h3>
            </div>
            <span className={`text-xs font-medium ${domainColors[domain] || 'text-slate-400'}`}>{domain}</span>
          </div>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            status === 'complete'
              ? 'bg-emerald-900/40 text-emerald-300'
              : status === 'active'
                ? 'bg-teal-dim/30 text-teal-light'
                : status === 'failed'
                  ? 'bg-red-900/40 text-red-300'
                  : 'bg-navy-lighter text-slate-500'
          }`}
        >
          {status}
        </span>
      </div>

      <p className="mb-3 text-sm text-slate-400">{description}</p>

      {isInteractive && tools.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <button
              key={tool}
              onClick={() => onRunTool?.(tool)}
              disabled={running || status === 'locked'}
              className="rounded border border-navy-lighter bg-navy px-2 py-1 font-mono text-xs text-teal-light transition-colors hover:border-teal hover:text-teal disabled:opacity-40"
            >
              {tool}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
