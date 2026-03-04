import { useState, useEffect } from 'react';
import {
  Server,
  Key,
  BookOpen,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wrench,
  CreditCard,
  Users,
  Mail,
  Crown,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { getHealth, listTools, BASE, type HealthInfo, type ToolInfo } from '../api';

// ── Types ───────────────────────────────────────────────────────────────────

interface SettingsProps {
  user?: { email: string; tier: string; name?: string } | null;
}

interface BillingStatus {
  stripeConfigured: boolean;
  userTier: string;
  userId: string | null;
}

interface OrgInfo {
  org: { id: string; name: string; tier: string; maxSeats: number } | null;
  members: Array<{ email: string; name?: string; role: string }>;
}

type Tab = 'server' | 'account' | 'team';

// ── Component ───────────────────────────────────────────────────────────────

export function Settings({ user }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('account');
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Billing state
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Team state
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [orgName, setOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [h, t] = await Promise.all([getHealth(), listTools()]);
      setHealth(h);
      setTools(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBilling() {
    try {
      const res = await fetch(`${BASE}/billing/status`);
      const data = await res.json();
      setBilling(data);
    } catch {
      // Billing endpoint not available
    }
  }

  async function loadTeam() {
    try {
      const res = await fetch(`${BASE}/org/members`);
      const data = await res.json();
      setOrgInfo(data);
    } catch {
      // Org endpoint not available
    }
  }

  useEffect(() => {
    refresh();
    loadBilling();
    loadTeam();
  }, []);

  async function handleCheckout(tierId: string, period: 'monthly' | 'annual') {
    setCheckingOut(true);
    try {
      const res = await fetch(`${BASE}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId,
          billing: period,
          successUrl: `${window.location.origin}/#/settings?billing=success`,
          cancelUrl: `${window.location.origin}/#/settings?billing=canceled`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleCreateOrg() {
    if (!orgName.trim()) return;
    setTeamLoading(true);
    setTeamMessage('');
    try {
      const res = await fetch(`${BASE}/org/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await res.json();
      if (data.ok) {
        setTeamMessage('Organization created.');
        setOrgName('');
        loadTeam();
      } else {
        setTeamMessage(data.error || 'Failed to create organization');
      }
    } catch (err) {
      setTeamMessage((err as Error).message);
    } finally {
      setTeamLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.includes('@')) return;
    setTeamLoading(true);
    setTeamMessage('');
    try {
      const res = await fetch(`${BASE}/org/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (data.ok) {
        setTeamMessage(`Invite sent to ${inviteEmail}`);
        setInviteEmail('');
        loadTeam();
      } else {
        setTeamMessage(data.error || 'Failed to send invite');
      }
    } catch (err) {
      setTeamMessage((err as Error).message);
    } finally {
      setTeamLoading(false);
    }
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const providerNames: Record<string, string> = {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI (GPT-4o)',
    gemini: 'Google (Gemini)',
    perplexity: 'Perplexity (Sonar)',
  };

  // Group tools by domain prefix
  const toolsByDomain: Record<string, ToolInfo[]> = {};
  for (const tool of tools) {
    let domain = 'Pipeline';
    if (tool.name.startsWith('prc_')) domain = 'Pre-RC';
    else if (tool.name.startsWith('rc_') || tool.name.startsWith('ux_')) domain = 'RC Method';
    else if (tool.name.startsWith('postrc_')) domain = 'Post-RC';
    else if (tool.name.startsWith('trace_')) domain = 'Traceability';
    if (!toolsByDomain[domain]) toolsByDomain[domain] = [];
    toolsByDomain[domain].push(tool);
  }

  const currentTier = billing?.userTier || user?.tier || 'free';

  const TIER_LABELS: Record<string, { label: string; color: string }> = {
    free: { label: 'Free', color: 'bg-slate-700 text-slate-400' },
    starter: { label: 'Starter', color: 'bg-teal/20 text-teal-light' },
    pro: { label: 'Pro', color: 'bg-gold/20 text-gold-light' },
    enterprise: { label: 'Enterprise', color: 'bg-purple-500/20 text-purple-300' },
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
          <p className="text-sm text-slate-400">Account, billing, team, and server configuration</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 rounded border border-navy-lighter bg-navy-light px-3 py-2 text-sm text-slate-300 hover:border-gold-dim hover:text-gold-light disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 rounded-lg bg-navy-light p-1">
        {([
          { id: 'account' as Tab, label: 'Account & Billing', icon: CreditCard },
          { id: 'team' as Tab, label: 'Team', icon: Users },
          { id: 'server' as Tab, label: 'Server & Tools', icon: Server },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors ${
              tab === id ? 'bg-navy-lighter text-gold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Account & Billing Tab ───────────────────────────────────────────── */}
      {tab === 'account' && (
        <div className="space-y-6">
          {/* Current Account */}
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Mail size={16} className="text-gold" />
              Account
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Email</span>
                <span className="text-sm text-slate-200">{user?.email || 'Not signed in'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Current Plan</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_LABELS[currentTier]?.color || TIER_LABELS.free.color}`}>
                  {TIER_LABELS[currentTier]?.label || currentTier}
                </span>
              </div>
            </div>
          </div>

          {/* Upgrade Plans */}
          <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Crown size={16} className="text-gold" />
              {currentTier === 'free' ? 'Upgrade Your Plan' : 'Manage Plan'}
            </h3>

            {!billing?.stripeConfigured && (
              <p className="mb-4 text-sm text-slate-400">
                Stripe is not configured on this server. Set STRIPE_SECRET_KEY in your .env file to enable billing.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Starter Plan */}
              <div className={`rounded-lg border p-5 ${currentTier === 'starter' ? 'border-teal bg-teal/5' : 'border-navy-lighter'}`}>
                <div className="mb-1 text-lg font-semibold text-slate-100">Starter</div>
                <div className="mb-3">
                  <span className="text-2xl font-bold text-slate-100">$29</span>
                  <span className="text-slate-500">/mo</span>
                </div>
                <ul className="mb-4 space-y-1 text-xs text-slate-400">
                  <li>5 projects/month</li>
                  <li>Full pipeline</li>
                  <li>Security scanning</li>
                  <li>PDF export</li>
                </ul>
                {currentTier === 'starter' ? (
                  <div className="rounded bg-teal/20 py-2 text-center text-xs font-medium text-teal-light">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout('starter', 'monthly')}
                    disabled={checkingOut || !billing?.stripeConfigured}
                    className="w-full rounded border border-navy-lighter py-2 text-sm font-medium text-slate-300 transition-colors hover:border-teal hover:text-teal-light disabled:opacity-50"
                  >
                    {checkingOut ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Upgrade to Starter'}
                  </button>
                )}
              </div>

              {/* Pro Plan */}
              <div className={`rounded-lg border p-5 ${currentTier === 'pro' ? 'border-gold bg-gold/5' : 'border-navy-lighter'}`}>
                <div className="mb-1 text-lg font-semibold text-slate-100">Pro</div>
                <div className="mb-3">
                  <span className="text-2xl font-bold text-slate-100">$79</span>
                  <span className="text-slate-500">/mo</span>
                </div>
                <ul className="mb-4 space-y-1 text-xs text-slate-400">
                  <li>Unlimited projects</li>
                  <li>Full pipeline + traceability</li>
                  <li>3 design options</li>
                  <li>Playbook / ARD export</li>
                  <li>API access</li>
                </ul>
                {currentTier === 'pro' ? (
                  <div className="rounded bg-gold/20 py-2 text-center text-xs font-medium text-gold-light">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout('pro', 'monthly')}
                    disabled={checkingOut || !billing?.stripeConfigured}
                    className="w-full rounded bg-gold py-2 text-sm font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
                  >
                    {checkingOut ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Upgrade to Pro'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Team Tab ───────────────────────────────────────────────────────── */}
      {tab === 'team' && (
        <div className="space-y-6">
          {orgInfo?.org ? (
            <>
              {/* Org Info */}
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
                  <Users size={16} className="text-gold" />
                  {orgInfo.org.name}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Plan</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_LABELS[orgInfo.org.tier]?.color || TIER_LABELS.free.color}`}>
                      {TIER_LABELS[orgInfo.org.tier]?.label || orgInfo.org.tier}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Seats</span>
                    <span className="text-slate-200">{orgInfo.members.length} / {orgInfo.org.maxSeats}</span>
                  </div>
                </div>
              </div>

              {/* Members */}
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
                <h3 className="mb-4 text-sm font-medium text-slate-300">Members</h3>
                <div className="space-y-2">
                  {orgInfo.members.map((member) => (
                    <div key={member.email} className="flex items-center justify-between rounded bg-navy/50 px-4 py-2">
                      <div>
                        <div className="text-sm text-slate-200">{member.name || member.email}</div>
                        {member.name && <div className="text-xs text-slate-500">{member.email}</div>}
                      </div>
                      <span className="rounded bg-navy-lighter px-2 py-0.5 text-xs text-slate-400">{member.role}</span>
                    </div>
                  ))}
                </div>

                {/* Invite */}
                <div className="mt-4 flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="flex-1 rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                  />
                  <button
                    onClick={handleInvite}
                    disabled={teamLoading || !inviteEmail.includes('@')}
                    className="flex items-center gap-1.5 rounded bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
                  >
                    <UserPlus size={14} />
                    Invite
                  </button>
                </div>
                {teamMessage && <p className="mt-2 text-xs text-slate-400">{teamMessage}</p>}
              </div>
            </>
          ) : (
            /* No org yet */
            <div className="rounded-lg border border-navy-lighter bg-navy-light p-6">
              <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-100">
                <Users size={16} className="text-gold" />
                Create a Team
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Create an organization to collaborate with your team. Members share your plan tier and can access shared projects.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="flex-1 rounded border border-navy-lighter bg-navy px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                />
                <button
                  onClick={handleCreateOrg}
                  disabled={teamLoading || !orgName.trim()}
                  className="rounded bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
                >
                  {teamLoading ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
                </button>
              </div>
              {teamMessage && <p className="mt-2 text-xs text-slate-400">{teamMessage}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Server & Tools Tab ───────────────────────────────────────────── */}
      {tab === 'server' && (
        <>
          {health && (
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Server Status */}
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Server size={14} className="text-teal" />
                  Server
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Status</span>
                    <span className="text-emerald-400">Connected</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tools</span>
                    <span className="font-mono text-gold">{health.tools}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Uptime</span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock size={12} />
                      {formatUptime(health.uptime)}
                    </span>
                  </div>
                </div>
              </div>

              {/* API Keys */}
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Key size={14} className="text-gold" />
                  API Keys
                </div>
                <div className="space-y-2">
                  {Object.entries(health.apiKeys).map(([key, configured]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{providerNames[key] || key}</span>
                      {configured ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : (
                        <XCircle size={14} className="text-slate-600" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Set API keys in your .env file and restart the server.
                </p>
              </div>

              {/* Knowledge Base */}
              <div className="rounded-lg border border-navy-lighter bg-navy-light p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <BookOpen size={14} className="text-teal" />
                  Knowledge Base
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Files</span>
                    <span className="font-mono text-gold">{health.knowledge.files}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Mode</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        health.knowledge.mode === 'pro'
                          ? 'bg-gold/20 text-gold-light'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {health.knowledge.mode}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tool Registry */}
          <div className="rounded-lg border border-navy-lighter bg-navy-light">
            <div className="border-b border-navy-lighter px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Wrench size={14} className="text-gold" />
                Tool Registry ({tools.length} tools)
              </div>
            </div>

            {Object.entries(toolsByDomain).map(([domain, domainTools]) => (
              <div key={domain} className="border-b border-navy-lighter last:border-b-0">
                <div className="bg-navy/50 px-5 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                  {domain} ({domainTools.length})
                </div>
                <div className="divide-y divide-navy-lighter/50">
                  {domainTools.map((tool) => (
                    <div key={tool.name} className="px-5 py-3">
                      <div className="font-mono text-sm text-teal-light">{tool.name}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{tool.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
