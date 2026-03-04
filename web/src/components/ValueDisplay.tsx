import { TrendingDown, Clock, Users, DollarSign } from 'lucide-react';

interface ValueDisplayProps {
  aiCostUsd: number;
  humanCostUsd: number;
  humanHours: number;
  teamSize: number;
  speedMultiplier: number;
  savingsPercent: number;
}

export function ValueDisplay({
  aiCostUsd,
  humanCostUsd,
  humanHours,
  teamSize,
  speedMultiplier,
  savingsPercent,
}: ValueDisplayProps) {
  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <TrendingDown size={14} className="text-emerald-400" />
        Value Saved
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <MetricBox
          icon={<DollarSign size={14} className="text-emerald-400" />}
          value={`$${formatUsd(humanCostUsd - aiCostUsd)}`}
          label="cost saved"
          highlight="emerald"
        />
        <MetricBox
          icon={<Clock size={14} className="text-teal-light" />}
          value={`${humanHours}h`}
          label="hours saved"
          highlight="teal"
        />
        <MetricBox
          icon={<Users size={14} className="text-gold" />}
          value={`${teamSize}`}
          label="roles replaced"
          highlight="gold"
        />
        <MetricBox
          icon={<TrendingDown size={14} className="text-purple-300" />}
          value={speedMultiplier === Infinity ? 'instant' : speedMultiplier === 0 ? 'N/A' : `${speedMultiplier}x`}
          label="faster"
          highlight="purple"
        />
      </div>

      {/* Cost comparison bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">AI cost</span>
          <span className="font-mono text-teal-light">${formatUsd(aiCostUsd)}</span>
        </div>
        <div className="h-2 rounded-full bg-navy">
          <div
            className="h-2 rounded-full bg-teal"
            style={{ width: `${Math.max(1, (aiCostUsd / humanCostUsd) * 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Human cost</span>
          <span className="font-mono text-gold-dim">${formatUsd(humanCostUsd)}</span>
        </div>
        <div className="h-2 rounded-full bg-navy">
          <div className="h-2 rounded-full bg-gold-dim" style={{ width: '100%' }} />
        </div>

        <div className="mt-1 text-center text-xs font-medium text-emerald-400">
          {savingsPercent.toFixed(1)}% savings
        </div>
      </div>
    </div>
  );
}

function MetricBox({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  highlight: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    teal: 'text-teal-light',
    gold: 'text-gold',
    purple: 'text-purple-300',
  };

  return (
    <div className="rounded bg-navy p-2.5 text-center">
      <div className="mb-1 flex items-center justify-center gap-1">
        {icon}
        <span className={`font-mono text-lg font-bold ${colorMap[highlight] || 'text-slate-200'}`}>{value}</span>
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function formatUsd(amount: number): string {
  if (amount >= 1000) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return amount.toFixed(2);
}
