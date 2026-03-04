import { useState } from 'react';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { ROOT } from '../api';

interface LoginProps {
  onBack: () => void;
  onVerified: (user: { email: string; tier: string }) => void;
}

export function Login({ onBack, onVerified }: LoginProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState(''); // For dev mode direct token
  const [verifying, setVerifying] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return;

    setSending(true);
    setError('');

    try {
      const res = await fetch(`${ROOT}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send login link.');
        return;
      }

      // Dev mode: token returned directly -- auto-verify
      if (data.token) {
        setToken(data.token);
        await verifyToken(data.token);
        return;
      }

      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function verifyToken(t: string) {
    setVerifying(true);
    setError('');

    try {
      const res = await fetch(`${ROOT}/auth/verify?token=${t}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid or expired link.');
        return;
      }

      onVerified(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  // Check URL for token on mount (user clicked email link)
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      verifyToken(urlToken);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy">
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1 text-sm text-slate-400 hover:text-gold-light"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="rounded-lg border border-navy-lighter bg-navy-light p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-100">
              <span className="text-gold">RC</span> Engine
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Sign in to access your projects
            </p>
          </div>

          {verifying && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-gold" />
              <p className="text-slate-300">Verifying your login...</p>
            </div>
          )}

          {sent && !verifying && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 size={32} className="text-emerald-400" />
              <p className="text-slate-200">Check your email</p>
              <p className="text-center text-sm text-slate-400">
                We sent a login link to <span className="font-medium text-slate-200">{email}</span>.
                Click the link to sign in.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-4 text-sm text-slate-400 underline hover:text-gold-light"
              >
                Use a different email
              </button>
            </div>
          )}

          {!sent && !verifying && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Email address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded border border-navy-lighter bg-navy py-3 pl-10 pr-4 text-slate-200 placeholder:text-slate-500 focus:border-gold focus:outline-none"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending || !email.includes('@')}
                className="flex w-full items-center justify-center gap-2 rounded bg-gold py-3 font-semibold text-navy transition-colors hover:bg-gold-light disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Continue with Email'
                )}
              </button>

              <p className="text-center text-xs text-slate-500">
                No password needed. We'll send you a magic link.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
