import { Coins } from 'lucide-react';

interface TokenDisplayProps {
  totalTokens: number;
  summary?: string;
}

export function TokenDisplay({ totalTokens, summary }: TokenDisplayProps) {
  const formatted = totalTokens.toLocaleString();

  // Rough cost estimate: assume ~$5/MTok average across providers
  const estimatedCost = (totalTokens / 1_000_000) * 5;
  const costStr = estimatedCost < 0.01 ? '<$0.01' : `~$${estimatedCost.toFixed(2)}`;

  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <Coins size={14} className="text-gold" />
        Token Usage
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded bg-navy p-3 text-center">
          <div className="font-mono text-lg font-bold text-gold">{formatted}</div>
          <div className="text-xs text-slate-500">total tokens</div>
        </div>
        <div className="rounded bg-navy p-3 text-center">
          <div className="font-mono text-lg font-bold text-teal">{costStr}</div>
          <div className="text-xs text-slate-500">est. cost</div>
        </div>
      </div>

      {summary && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-500">{summary}</pre>
      )}
    </div>
  );
}
