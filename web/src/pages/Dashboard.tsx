import { useState, useEffect } from 'react';
import { FolderOpen, Plus, RefreshCw, ArrowRight, TrendingDown, Sparkles } from 'lucide-react';
import { listProjects, type ProjectInfo } from '../api';

interface DashboardProps {
  onOpenProject: (path: string) => void;
  onNewProject?: () => void;
  onOpenValue?: (path: string) => void;
}

export function Dashboard({ onOpenProject, onNewProject, onOpenValue }: DashboardProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadProjects() {
    setLoading(true);
    try {
      const result = await listProjects();
      setProjects(result.projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const domainColors: Record<string, string> = {
    'pre-rc': 'bg-teal/20 text-teal-light',
    rc: 'bg-gold/20 text-gold-light',
    'post-rc': 'bg-emerald-500/20 text-emerald-300',
    traceability: 'bg-purple-500/20 text-purple-300',
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Welcome banner for new users */}
      {projects.length === 0 && !loading && (
        <div className="mb-8 rounded-lg border border-gold-dim/30 bg-gradient-to-r from-navy-light to-navy p-8 text-center">
          <Sparkles size={40} className="mx-auto mb-4 text-gold" />
          <h2 className="mb-2 text-2xl font-bold text-slate-100">Welcome to RC Engine</h2>
          <p className="mb-6 text-slate-400">
            Go from product idea to production-ready software. No coding experience required.
          </p>
          <button
            onClick={onNewProject}
            className="rounded bg-gold px-8 py-3 text-lg font-semibold text-navy transition-colors hover:bg-gold-light"
          >
            Start Your First Project
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Projects</h2>
          <p className="text-sm text-slate-400">Manage your RC Engine pipeline projects</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadProjects}
            disabled={loading}
            className="flex items-center gap-2 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 transition-colors hover:border-gold-dim hover:text-gold-light disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 rounded bg-gold px-4 py-2 text-sm font-medium text-navy transition-colors hover:bg-gold-light"
          >
            <Plus size={14} />
            New Project
          </button>
        </div>
      </div>


      {/* Project list */}
      {projects.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-navy-lighter py-16 text-center">
          <FolderOpen size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400">No projects found</p>
          <p className="mt-1 text-sm text-slate-500">Create a new project to get started</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.path}
            className="group flex w-full items-center justify-between rounded-lg border border-navy-lighter bg-navy-light p-4 transition-all hover:border-gold-dim"
          >
            <button
              onClick={() => onOpenProject(project.path)}
              className="flex-1 text-left"
            >
              <h3 className="font-semibold text-slate-100 group-hover:text-gold-light">{project.name}</h3>
              <p className="mt-0.5 font-mono text-xs text-slate-500">{project.path}</p>
              <div className="mt-2 flex gap-2">
                {project.domains.map((d) => (
                  <span key={d} className={`rounded px-2 py-0.5 text-xs font-medium ${domainColors[d] || 'bg-slate-700 text-slate-300'}`}>
                    {d}
                  </span>
                ))}
              </div>
            </button>
            <div className="flex items-center gap-2">
              {onOpenValue && (
                <button
                  onClick={() => onOpenValue(project.path)}
                  className="rounded border border-navy-lighter p-2 text-slate-500 transition-colors hover:border-emerald-800 hover:text-emerald-400"
                  title="View value report"
                >
                  <TrendingDown size={14} />
                </button>
              )}
              <button
                onClick={() => onOpenProject(project.path)}
                className="rounded border border-navy-lighter p-2 text-slate-500 transition-colors hover:border-gold-dim hover:text-gold"
                title="Open pipeline"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
