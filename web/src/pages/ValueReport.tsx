import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingDown, Users, Clock, DollarSign, RefreshCw } from 'lucide-react';
import { ValueChart } from '../components/ValueChart';
import { BASE } from '../api';

interface ValueReportProps {
  projectPath: string;
  onBack: () => void;
}

interface ValueData {
  projectName: string;
  aiCostUsd: number;
  aiDurationMinutes: number;
  totalHumanHours: number;
  totalHumanCostUsd: number;
  totalHumanWeeks: number;
  costSavingsUsd: number;
  costSavingsPercent: number;
  speedMultiplier: number;
  equivalentTeamSize: number;
  equivalentTeamMonths: number;
  annualSavingsUsd: number;
  rolesReplaced: Array<{
    roleTitle: string;
    estimatedHours: number;
    totalCostUsd: number;
    category: string;
  }>;
  byCategory: Record<string, { roles: number; hours: number; costUsd: number }>;
}

export function ValueReport({ projectPath, onBack }: ValueReportProps) {
  const [data, setData] = useState<ValueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadValue() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/project/value?path=${encodeURIComponent(projectPath)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load value report');
      setData(json.report);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadValue();
  }, [projectPath]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <RefreshCw size={32} className="mx-auto mb-4 animate-spin text-gold" />
        <p className="text-slate-400">Calculating value...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-gold-light">
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="rounded border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">
          {error || 'No value data available. Run the pipeline first.'}
        </div>
      </div>
    );
  }

  const chartData = Object.entries(data.byCategory).map(([cat, info]) => ({
    label: cat,
    aiCost: (data.aiCostUsd / Object.keys(data.byCategory).length),
    humanCost: info.costUsd,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded p-1 text-slate-400 hover:text-gold-light">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Value Report</h2>
            <p className="text-sm text-slate-400">{data.projectName}</p>
          </div>
        </div>
        <button
          onClick={loadValue}
          className="flex items-center gap-2 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 hover:border-gold-dim"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Hero metrics */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <HeroMetric
          icon={<Users size={20} className="text-gold" />}
          value={`${data.equivalentTeamSize}`}
          label="Professionals Replaced"
        />
        <HeroMetric
          icon={<Clock size={20} className="text-teal-light" />}
          value={`${data.totalHumanHours}h`}
          label="Hours of Work Saved"
        />
        <HeroMetric
          icon={<DollarSign size={20} className="text-emerald-400" />}
          value={`$${formatBig(data.costSavingsUsd)}`}
          label="Cost Saved"
        />
        <HeroMetric
          icon={<TrendingDown size={20} className="text-purple-300" />}
          value={data.speedMultiplier === Infinity ? 'N/A' : `${data.speedMultiplier}x`}
          label="Faster Than Humans"
        />
      </div>

      {/* Cost comparison */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-navy-lighter bg-navy-light p-6 text-center">
          <p className="mb-1 text-sm text-slate-400">AI Cost</p>
          <p className="font-mono text-3xl font-bold text-teal-light">${formatBig(data.aiCostUsd)}</p>
        </div>
        <div className="rounded-lg border border-navy-lighter bg-navy-light p-6 text-center">
          <p className="mb-1 text-sm text-slate-400">Human Equivalent Cost</p>
          <p className="font-mono text-3xl font-bold text-gold">${formatBig(data.totalHumanCostUsd)}</p>
          <p className="mt-1 text-sm text-emerald-400">{data.costSavingsPercent.toFixed(1)}% savings</p>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6">
        <ValueChart data={chartData} />
      </div>

      {/* Role table */}
      <div className="mb-6 rounded-lg border border-navy-lighter bg-navy-light p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Your AI Team</h3>
        <div className="overflow-hidden rounded border border-navy-lighter">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-xs text-slate-500">
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Hours</th>
                <th className="px-4 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-lighter/50">
              {data.rolesReplaced.map((role, i) => (
                <tr key={i} className="text-slate-300">
                  <td className="px-4 py-2">{role.roleTitle}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-navy px-1.5 py-0.5 text-xs capitalize text-slate-400">
                      {role.category}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{role.estimatedHours}h</td>
                  <td className="px-4 py-2 text-right font-mono text-gold-dim">
                    ${role.totalCostUsd.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-navy font-medium text-slate-200">
                <td className="px-4 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2 text-right font-mono">{data.totalHumanHours}h</td>
                <td className="px-4 py-2 text-right font-mono text-gold">
                  ${data.totalHumanCostUsd.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Annual projection */}
      <div className="rounded-lg border border-gold-dim/30 bg-navy-light p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-gold">Annual Projection</h3>
        <p className="text-sm text-slate-400">At 12 projects per year:</p>
        <p className="mt-2 font-mono text-3xl font-bold text-emerald-400">
          ${formatBig(data.annualSavingsUsd)}
        </p>
        <p className="text-sm text-slate-400">saved annually</p>
        <p className="mt-2 text-sm text-slate-500">
          Equivalent to {data.equivalentTeamMonths.toFixed(1)} person-months per project
          ({data.totalHumanWeeks.toFixed(1)} weeks of human work)
        </p>
      </div>
    </div>
  );
}

function HeroMetric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg border border-navy-lighter bg-navy-light p-4 text-center">
      <div className="mb-2 flex justify-center">{icon}</div>
      <div className="font-mono text-2xl font-bold text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1) return n.toFixed(2);
  return n.toFixed(0);
}
