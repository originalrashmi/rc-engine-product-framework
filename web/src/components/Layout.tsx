import { type ReactNode } from 'react';
import { Activity, LayoutDashboard, Loader2, LogOut, Settings, Sparkles, TrendingDown, User } from 'lucide-react';
import type { View } from '../App';

interface LayoutProps {
  children: ReactNode;
  view: View;
  onNavigate: (view: View) => void;
  activeTool: string | null;
  user?: { email: string; tier: string; name?: string } | null;
  onLogout?: () => void;
}

export function Layout({ children, view, onNavigate, activeTool, user, onLogout }: LayoutProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-navy-lighter bg-navy-light px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-gold">RC</span>
              <span className="text-slate-300"> Engine</span>
            </h1>
          </button>
          <span className="rounded bg-navy-lighter px-2 py-0.5 font-mono text-xs text-gold-dim">v1.0</span>
        </div>

        <nav className="flex items-center gap-1">
          <NavButton
            active={view === 'dashboard'}
            onClick={() => onNavigate('dashboard')}
            icon={<LayoutDashboard size={16} />}
            label="Dashboard"
          />
          <NavButton
            active={view === 'wizard'}
            onClick={() => onNavigate('wizard')}
            icon={<Sparkles size={16} />}
            label="New Project"
          />
          <NavButton
            active={view === 'pipeline'}
            onClick={() => onNavigate('pipeline')}
            icon={<Activity size={16} />}
            label="Pipeline"
          />
          <NavButton
            active={view === 'value'}
            onClick={() => onNavigate('value')}
            icon={<TrendingDown size={16} />}
            label="Value"
          />
          <NavButton
            active={view === 'settings'}
            onClick={() => onNavigate('settings')}
            icon={<Settings size={16} />}
            label="Settings"
          />
        </nav>

        <div className="flex items-center gap-3">
          {activeTool && (
            <div className="flex items-center gap-2 rounded bg-teal-dim/30 px-3 py-1 text-sm text-teal-light">
              <Loader2 size={14} className="animate-spin" />
              <span className="font-mono text-xs">{activeTool}</span>
            </div>
          )}

          {user && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded bg-navy-lighter px-2.5 py-1">
                <User size={12} className="text-slate-400" />
                <span className="max-w-[120px] truncate text-xs text-slate-300">{user.name || user.email}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  user.tier === 'pro' ? 'bg-gold/20 text-gold-light' :
                  user.tier === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {user.tier}
                </span>
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="rounded p-1.5 text-slate-500 transition-colors hover:bg-navy-lighter hover:text-slate-300"
                  title="Log out"
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-navy p-6">{children}</main>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-navy-lighter text-gold' : 'text-slate-400 hover:bg-navy-lighter/50 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
