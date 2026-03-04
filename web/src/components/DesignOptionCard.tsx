import { Star, Palette } from 'lucide-react';

interface DesignOptionCardProps {
  optionId: string;
  name: string;
  personality: string;
  icpAlignment: number;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
  };
  typography: { headingFont: string; bodyFont: string };
  strengths: string[];
  weaknesses: string[];
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

export function DesignOptionCard({
  optionId,
  name,
  personality,
  icpAlignment,
  colors,
  typography,
  strengths,
  weaknesses,
  isRecommended,
  isSelected,
  onSelect,
}: DesignOptionCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-all ${
        isSelected
          ? 'border-gold bg-gold/10 ring-1 ring-gold/30'
          : 'border-navy-lighter bg-navy-light hover:border-slate-500'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-navy px-2 py-0.5 font-mono text-sm font-bold text-gold">
            {optionId}
          </span>
          <span className="text-sm font-semibold text-slate-200">{name}</span>
        </div>
        {isRecommended && (
          <span className="flex items-center gap-1 rounded bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Star size={10} />
            Recommended
          </span>
        )}
      </div>

      {/* Personality */}
      <p className="mb-3 text-xs text-slate-400">{personality}</p>

      {/* Color swatches */}
      <div className="mb-3 flex items-center gap-1.5">
        <Palette size={12} className="text-slate-500" />
        {[colors.primary, colors.secondary, colors.background, colors.surface].map((color, i) => (
          <div
            key={i}
            className="h-5 w-5 rounded border border-navy-lighter"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <span className="ml-1 text-[10px] text-slate-500">
          {typography.headingFont} + {typography.bodyFont}
        </span>
      </div>

      {/* ICP alignment bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">ICP alignment</span>
          <span className={`font-mono font-bold ${icpAlignment >= 80 ? 'text-emerald-400' : icpAlignment >= 60 ? 'text-gold' : 'text-slate-400'}`}>
            {icpAlignment}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-navy">
          <div
            className={`h-1.5 rounded-full transition-all ${icpAlignment >= 80 ? 'bg-emerald-500' : icpAlignment >= 60 ? 'bg-gold' : 'bg-slate-500'}`}
            style={{ width: `${icpAlignment}%` }}
          />
        </div>
      </div>

      {/* Strengths / Weaknesses */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <div className="mb-0.5 font-medium text-emerald-400">Strengths</div>
          {strengths.slice(0, 2).map((s, i) => (
            <div key={i} className="text-slate-400">+ {s}</div>
          ))}
        </div>
        <div>
          <div className="mb-0.5 font-medium text-amber-400">Tradeoffs</div>
          {weaknesses.slice(0, 2).map((w, i) => (
            <div key={i} className="text-slate-400">- {w}</div>
          ))}
        </div>
      </div>
    </button>
  );
}
