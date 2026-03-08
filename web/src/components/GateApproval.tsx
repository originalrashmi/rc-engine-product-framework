import { ShieldCheck, AlertTriangle, HelpCircle } from 'lucide-react';

interface GateApprovalProps {
  title: string;
  summary: string;
  findings?: string[];
  recommendation?: 'approve' | 'review' | 'reject';
  onApprove: (feedback?: string) => void;
  onReject: (feedback: string) => void;
  loading?: boolean;
}

export function GateApproval({
  title,
  summary,
  findings,
  recommendation,
  onApprove,
  onReject,
  loading,
}: GateApprovalProps) {
  return (
    <div className="rounded-lg border border-gold-dim/30 bg-navy-light p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-full bg-gold/10 p-2">
          <ShieldCheck size={20} className="text-gold" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <p className="text-sm text-slate-400">Checkpoint - your approval is needed to continue</p>
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-300">{summary}</p>

      {findings && findings.length > 0 && (
        <div className="mb-4 rounded border border-navy-lighter bg-navy p-3">
          <h4 className="mb-2 text-xs font-medium text-slate-400">Key Findings</h4>
          <ul className="space-y-1">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-light" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendation && (
        <div
          className={`mb-4 flex items-center gap-2 rounded p-2 text-sm ${
            recommendation === 'approve'
              ? 'bg-emerald-900/20 text-emerald-300'
              : recommendation === 'reject'
                ? 'bg-red-900/20 text-red-300'
                : 'bg-yellow-900/20 text-yellow-300'
          }`}
        >
          {recommendation === 'approve' ? (
            <ShieldCheck size={14} />
          ) : recommendation === 'reject' ? (
            <AlertTriangle size={14} />
          ) : (
            <HelpCircle size={14} />
          )}
          <span>
            {recommendation === 'approve'
              ? 'Recommended: Approve and continue'
              : recommendation === 'reject'
                ? 'Recommended: Address issues before continuing'
                : 'Recommended: Review findings before deciding'}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onApprove()}
          disabled={loading}
          className="flex-1 rounded bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Approve and Continue
        </button>
        <button
          onClick={() => onReject('Needs revision')}
          disabled={loading}
          className="flex-1 rounded border border-navy-lighter px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-red-800 hover:text-red-300 disabled:opacity-50"
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
