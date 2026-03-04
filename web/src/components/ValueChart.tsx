interface ValueChartProps {
  data: Array<{
    label: string;
    aiCost: number;
    humanCost: number;
  }>;
}

export function ValueChart({ data }: ValueChartProps) {
  if (data.length === 0) return null;

  const maxCost = Math.max(...data.map((d) => d.humanCost), 1);

  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
      <h4 className="mb-3 text-sm font-medium text-slate-300">Cost Comparison by Category</h4>

      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium capitalize text-slate-300">{item.label}</span>
              <span className="text-slate-500">
                ${formatUsd(item.aiCost)} vs ${formatUsd(item.humanCost)}
              </span>
            </div>

            {/* Human cost bar (full width reference) */}
            <div className="mb-0.5 flex items-center gap-2">
              <span className="w-12 text-right text-[10px] text-slate-500">Human</span>
              <div className="h-3 flex-1 rounded bg-navy">
                <div
                  className="h-3 rounded bg-gold-dim/60"
                  style={{ width: `${(item.humanCost / maxCost) * 100}%` }}
                />
              </div>
            </div>

            {/* AI cost bar */}
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-[10px] text-slate-500">AI</span>
              <div className="h-3 flex-1 rounded bg-navy">
                <div
                  className="h-3 rounded bg-teal/60"
                  style={{ width: `${Math.max(0.5, (item.aiCost / maxCost) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex justify-center gap-4 text-[10px] text-slate-500">
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded bg-gold-dim/60" />
          Human cost
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded bg-teal/60" />
          AI cost
        </div>
      </div>
    </div>
  );
}

function formatUsd(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(0)}`;
}
