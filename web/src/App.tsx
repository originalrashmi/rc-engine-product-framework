import { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Pipeline } from './pages/Pipeline';
import { Settings } from './pages/Settings';
import { Wizard } from './pages/Wizard';
import { ValueReport } from './pages/ValueReport';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { connectWebSocket, ROOT, type WsEvent } from './api';

export type View = 'landing' | 'login' | 'dashboard' | 'pipeline' | 'settings' | 'wizard' | 'value';

export interface ActivityEntry {
  id: number;
  type: 'start' | 'complete' | 'error';
  tool: string;
  message: string;
  timestamp: number;
}

interface UserInfo {
  email: string;
  tier: string;
  name?: string;
}

// ── Hash Router ───────────────────────────────────────────────────────────────

const VIEW_ROUTES: Record<string, View> = {
  '': 'landing',
  '#/': 'landing',
  '#/login': 'login',
  '#/dashboard': 'dashboard',
  '#/pipeline': 'pipeline',
  '#/settings': 'settings',
  '#/wizard': 'wizard',
  '#/value': 'value',
};

const VIEW_TO_HASH: Record<View, string> = {
  landing: '#/',
  login: '#/login',
  dashboard: '#/dashboard',
  pipeline: '#/pipeline',
  settings: '#/settings',
  wizard: '#/wizard',
  value: '#/value',
};

function getViewFromHash(): View | null {
  const hash = window.location.hash || '';
  return VIEW_ROUTES[hash] ?? null;
}

// ── App ───────────────────────────────────────────────────────────────────────

let nextId = 1;

export function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Initialize view from hash or fallback to landing
  const [view, setViewRaw] = useState<View>(() => getViewFromHash() ?? 'landing');
  const [projectPath, setProjectPath] = useState<string>('');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Sync view changes to URL hash
  const setView = useCallback((v: View) => {
    setViewRaw(v);
    const hash = VIEW_TO_HASH[v];
    if (hash && window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const v = getViewFromHash();
      if (v) setViewRaw(v);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Check existing session on mount
  useEffect(() => {
    fetch(`${ROOT}/auth/me`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          // If on landing and already authenticated, go to dashboard
          const current = getViewFromHash() ?? 'landing';
          if (current === 'landing' || current === 'login') {
            setView('dashboard');
          }
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, [setView]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === 'connected') return;

    const entry: ActivityEntry = {
      id: nextId++,
      type: event.type === 'tool:start' ? 'start' : event.type === 'tool:complete' ? 'complete' : 'error',
      tool: event.tool,
      message:
        event.type === 'tool:start'
          ? `Running ${event.tool}...`
          : event.type === 'tool:complete'
            ? `${event.tool} completed`
            : `${event.tool} failed: ${'error' in event ? event.error : 'unknown'}`,
      timestamp: event.timestamp,
    };

    setActivity((prev) => [entry, ...prev].slice(0, 100));

    if (event.type === 'tool:start') {
      setActiveTool(event.tool);
    } else {
      setActiveTool(null);
    }
  }, []);

  useEffect(() => {
    const ws = connectWebSocket(handleWsEvent);
    return () => ws.close();
  }, [handleWsEvent]);

  // "Get Started" from landing goes to login (force-login onboarding)
  const enterApp = () => {
    setView('login');
  };

  const goToLogin = () => {
    setView('login');
  };

  const handleLogout = async () => {
    try {
      await fetch(`${ROOT}/auth/logout`, { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
    setUser(null);
    sessionStorage.removeItem('rc-wizard-session');
    setView('landing');
  };

  const handleVerified = (verifiedUser: { email: string; tier: string }) => {
    setUser(verifiedUser);
    setView('dashboard');
  };

  const openProject = (path: string) => {
    setProjectPath(path);
    setView('pipeline');
  };

  const openWizard = () => {
    setView('wizard');
  };

  const openValue = (path: string) => {
    setProjectPath(path);
    setView('value');
  };

  // Auth guard: protected views require authentication
  const protectedViews: View[] = ['dashboard', 'pipeline', 'settings', 'wizard', 'value'];
  if (authChecked && !user && protectedViews.includes(view)) {
    return (
      <ErrorBoundary>
        <Login onBack={() => setView('landing')} onVerified={handleVerified} />
      </ErrorBoundary>
    );
  }

  // Landing page is full-screen (no layout chrome)
  if (view === 'landing') {
    return (
      <ErrorBoundary>
        <Landing onGetStarted={enterApp} onLogin={goToLogin} />
      </ErrorBoundary>
    );
  }

  // Login page is full-screen
  if (view === 'login') {
    return (
      <ErrorBoundary>
        <Login onBack={() => setView('landing')} onVerified={handleVerified} />
      </ErrorBoundary>
    );
  }

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Layout view={view} onNavigate={setView} activeTool={activeTool} user={user} onLogout={handleLogout}>
        {view === 'dashboard' && (
          <Dashboard onOpenProject={openProject} onNewProject={openWizard} onOpenValue={openValue} />
        )}
        {view === 'pipeline' && (
          <Pipeline projectPath={projectPath} activity={activity} onBack={() => setView('dashboard')} />
        )}
        {view === 'settings' && <Settings user={user} />}
        {view === 'wizard' && (
          <Wizard
            onComplete={(path) => {
              setProjectPath(path);
              setView('pipeline');
            }}
            onBack={() => setView('dashboard')}
          />
        )}
        {view === 'value' && <ValueReport projectPath={projectPath} onBack={() => setView('dashboard')} />}
      </Layout>
    </ErrorBoundary>
  );
}
