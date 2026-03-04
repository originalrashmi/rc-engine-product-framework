import { CheckCircle2, Loader2, Circle, User } from 'lucide-react';

export type MemberStatus = 'pending' | 'working' | 'complete';

interface TeamMemberCardProps {
  roleTitle: string;
  description: string;
  category: string;
  hourlyRate: number;
  estimatedHours: number;
  status: MemberStatus;
  /** Whether this member can be toggled on/off. */
  toggleable?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

const categoryColors: Record<string, string> = {
  research: 'text-teal-light bg-teal-dim/20',
  design: 'text-purple-300 bg-purple-500/20',
  engineering: 'text-gold-light bg-gold/20',
  security: 'text-red-300 bg-red-500/20',
  management: 'text-emerald-300 bg-emerald-500/20',
};

const statusIcons: Record<MemberStatus, typeof Circle> = {
  pending: Circle,
  working: Loader2,
  complete: CheckCircle2,
};

export function TeamMemberCard({
  roleTitle,
  description,
  category,
  hourlyRate,
  estimatedHours,
  status,
  toggleable,
  enabled = true,
  onToggle,
}: TeamMemberCardProps) {
  const Icon = statusIcons[status];
  const totalCost = hourlyRate * estimatedHours;
  const catClass = categoryColors[category] || 'text-slate-400 bg-slate-700/30';

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        enabled
          ? 'border-navy-lighter bg-navy-light'
          : 'border-slate-700/50 bg-navy opacity-50'
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-navy p-1.5">
            <User size={14} className="text-slate-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">{roleTitle}</h4>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${catClass}`}>
              {category}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Icon
            size={16}
            className={
              status === 'complete'
                ? 'text-emerald-400'
                : status === 'working'
                  ? 'animate-spin text-teal-light'
                  : 'text-slate-500'
            }
          />
          {toggleable && (
            <button
              onClick={() => onToggle?.(!enabled)}
              className={`h-5 w-9 rounded-full transition-colors ${
                enabled ? 'bg-teal' : 'bg-slate-600'
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-400">{description}</p>

      <div className="flex gap-3 text-xs text-slate-500">
        <span>{estimatedHours}h work</span>
        <span>${hourlyRate}/hr</span>
        <span className="font-medium text-gold-dim">${totalCost.toLocaleString()}</span>
      </div>
    </div>
  );
}
