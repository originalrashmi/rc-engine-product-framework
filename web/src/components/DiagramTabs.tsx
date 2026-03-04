import { useState } from 'react';
import { Maximize2, EyeOff, GitBranch } from 'lucide-react';

interface DiagramInfo {
  type: string;
  htmlPath: string;
  mermaidSyntax: string;
}

interface DiagramTabsProps {
  diagrams: DiagramInfo[];
  getUrl: (path: string) => string;
}

const LABELS: Record<string, string> = {
  dependency: 'Task Dependencies',
  gantt: 'Build Timeline',
  layers: 'Architecture Layers',
};

export function DiagramTabs({ diagrams, getUrl }: DiagramTabsProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  if (diagrams.length === 0) return null;

  const current = diagrams[activeIdx] ?? diagrams[0];

  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-navy-lighter px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-slate-500" />
          <span className="text-xs font-medium text-slate-300">Architecture Diagrams</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded p-1 text-slate-500 hover:bg-navy hover:text-slate-300"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <EyeOff size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-navy-lighter px-3 py-1.5">
        {diagrams.map((d, i) => (
          <button
            key={d.type}
            onClick={() => setActiveIdx(i)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              i === activeIdx
                ? 'bg-gold/20 text-gold-light'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {LABELS[d.type] ?? d.type}
          </button>
        ))}
      </div>

      {/* Diagram iframe */}
      <div className={`bg-white ${expanded ? 'h-[600px]' : 'h-80'} transition-all`}>
        <iframe
          src={getUrl(current.htmlPath)}
          className="h-full w-full"
          title={`${LABELS[current.type] ?? current.type} diagram`}
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
