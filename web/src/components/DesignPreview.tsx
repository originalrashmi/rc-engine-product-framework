import { useState } from 'react';
import { Eye, EyeOff, Maximize2 } from 'lucide-react';

interface WireframeItem {
  name: string;
  path: string;
}

interface DesignPreviewProps {
  wireframes: WireframeItem[];
  getUrl: (path: string) => string;
}

export function DesignPreview({ wireframes, getUrl }: DesignPreviewProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [fidelity, setFidelity] = useState<'lofi' | 'hifi'>('hifi');
  const [expanded, setExpanded] = useState(false);

  // Group wireframes by screen (lo-fi and hi-fi pairs)
  const lofiItems = wireframes.filter((w) => w.name.includes('lofi'));
  const hifiItems = wireframes.filter((w) => w.name.includes('hifi'));
  const items = fidelity === 'lofi' ? lofiItems : hifiItems;

  if (wireframes.length === 0) return null;

  const currentItem = items[activeIdx] ?? items[0];

  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-navy-lighter px-3 py-2">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-slate-500" />
          <span className="text-xs font-medium text-slate-300">Wireframe Preview</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fidelity toggle */}
          <div className="flex rounded bg-navy">
            <button
              onClick={() => setFidelity('lofi')}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                fidelity === 'lofi'
                  ? 'rounded bg-slate-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Lo-fi
            </button>
            <button
              onClick={() => setFidelity('hifi')}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                fidelity === 'hifi'
                  ? 'rounded bg-slate-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Hi-fi
            </button>
          </div>

          {/* Expand/collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-slate-500 hover:bg-navy hover:text-slate-300"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <EyeOff size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Screen tabs */}
      {items.length > 1 && (
        <div className="flex gap-1 border-b border-navy-lighter px-3 py-1.5">
          {items.map((item, i) => {
            const screenName = item.name
              .replace(/-lofi\.html$/, '')
              .replace(/-hifi\.html$/, '')
              .replace(/-/g, ' ');
            return (
              <button
                key={item.path}
                onClick={() => setActiveIdx(i)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  i === activeIdx
                    ? 'bg-gold/20 text-gold-light'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {screenName}
              </button>
            );
          })}
        </div>
      )}

      {/* Preview iframe */}
      {currentItem && (
        <div className={`bg-white ${expanded ? 'h-[600px]' : 'h-80'} transition-all`}>
          <iframe
            src={getUrl(currentItem.path)}
            className="h-full w-full"
            title={`${currentItem.name} preview`}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
