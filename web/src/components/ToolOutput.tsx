import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, X } from 'lucide-react';

interface ToolOutputProps {
  toolName: string;
  output: string;
  isError?: boolean;
  onClose?: () => void;
}

export function ToolOutput({ toolName, output, isError, onClose }: ToolOutputProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = output.split('\n');
  const isLong = lines.length > 30;

  return (
    <div
      className={`rounded-lg border ${
        isError ? 'border-red-800 bg-red-900/10' : 'border-navy-lighter bg-navy-light'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-navy-lighter px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isError ? 'bg-red-400' : 'bg-emerald-400'}`}
          />
          <span className="font-mono text-xs text-slate-300">{toolName}</span>
          <span className="text-xs text-slate-500">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          {isLong && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded p-1 text-slate-500 hover:text-slate-300"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="rounded p-1 text-slate-500 hover:text-slate-300"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:text-slate-300"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <pre
          className={`overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed ${
            isError ? 'text-red-300' : 'text-slate-300'
          } ${isLong ? 'max-h-96' : ''}`}
        >
          {formatOutput(output)}
        </pre>
      )}
    </div>
  );
}

/**
 * Basic formatting: highlight section headers, status indicators, numbers.
 */
function formatOutput(text: string): string {
  // Just return plain text - React will handle the rendering.
  // Syntax highlighting would need dangerouslySetInnerHTML which adds risk.
  return text;
}
