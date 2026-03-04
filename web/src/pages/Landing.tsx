import { useState } from 'react';
import { ArrowRight, Check, Sparkles, Shield, Zap, Users, FileText, Palette, Code2, TrendingDown } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface LandingProps {
  onGetStarted: (tierId?: string) => void;
  onLogin: () => void;
}

interface TierCard {
  id: string;
  name: string;
  price: string;
  annualPrice?: string;
  description: string;
  features: string[];
  highlight?: string;
  cta: string;
  popular?: boolean;
}

// ── Data ────────────────────────────────────────────────────────────────────

const TIERS: TierCard[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    description: 'Try it out with one project per month.',
    features: ['1 project/month', 'Research phase only', 'Up to 14 AI research specialists', 'Community support'],
    cta: 'Start Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    annualPrice: '$24',
    description: 'Full pipeline for solopreneurs.',
    features: [
      '5 projects/month',
      'Full pipeline (research to ship)',
      '1 design option per project',
      'Architecture diagrams',
      'Security scanning',
      'PDF export',
      'Email support',
    ],
    cta: 'Start Building',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$79',
    annualPrice: '$66',
    description: 'Everything for serious product development.',
    popular: true,
    highlight: 'Most Popular',
    features: [
      'Unlimited projects',
      'Full pipeline + traceability',
      '3 design options with AI recommendation',
      'Legal compliance review',
      'Playbook / ARD export',
      'Priority AI routing',
      'Custom knowledge files',
      'API access',
      'Priority support',
    ],
    cta: 'Go Pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'For teams and organizations.',
    features: [
      'Everything in Pro',
      'Unlimited team seats',
      'SSO / SAML',
      'Webhook integrations',
      'Dedicated support',
      'Custom SLA',
      'On-premise option',
    ],
    cta: 'Contact Us',
  },
];

const PIPELINE_STEPS = [
  {
    icon: Sparkles,
    title: 'Research',
    desc: 'Up to 20 AI specialists analyze your idea across market, users, security, and UX.',
  },
  {
    icon: Palette,
    title: 'Design',
    desc: 'Generate visual design options with wireframes based on your target users.',
  },
  {
    icon: Code2,
    title: 'Build',
    desc: 'Architecture, task planning, and implementation guidance -- all generated.',
  },
  {
    icon: Shield,
    title: 'Validate',
    desc: 'Security scan, quality checks, and traceability.',
  },
];

const VALUE_STATS = [
  { value: '3-20', label: 'AI specialists per project' },
  { value: '4', label: 'domains: research, build, security, traceability' },
  { value: '11', label: 'quality gates with human approval' },
  { value: '$3-20', label: 'typical API cost per full pipeline run' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function Landing({ onGetStarted, onLogin }: LandingProps) {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-navy text-slate-200">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-navy-lighter px-8 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-gold">RC</span>
            <span className="text-slate-300"> Engine</span>
          </h1>
          <span className="rounded bg-navy-lighter px-2 py-0.5 font-mono text-xs text-gold-dim">v1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#pricing" className="text-sm text-slate-400 hover:text-gold-light">
            Pricing
          </a>
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-gold-light">
            How It Works
          </a>
          <button onClick={onLogin} className="text-sm text-slate-400 hover:text-gold-light">
            Log In
          </button>
          <button
            onClick={onGetStarted}
            className="rounded bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-light"
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-20 text-center">
        <h2 className="mx-auto max-w-3xl text-5xl font-bold leading-tight text-slate-100">
          From product idea to production-ready
          <br />
          <span className="text-gold">in minutes, not months</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          RC Engine is an AI-powered product development pipeline. 20 specialized AI analysts research your idea, design
          your product, plan your architecture, and validate everything -- replacing a $32,000+ consulting engagement.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={onGetStarted}
            className="flex items-center gap-2 rounded-lg bg-gold px-8 py-4 text-lg font-semibold text-navy transition-colors hover:bg-gold-light"
          >
            Start Building Free
            <ArrowRight size={20} />
          </button>
        </div>

        {/* Value stats */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-4 gap-6">
          {VALUE_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-gold">{stat.value}</div>
              <div className="mt-1 text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-navy-lighter px-8 py-20">
        <h3 className="mb-12 text-center text-3xl font-bold text-slate-100">How It Works</h3>
        <div className="mx-auto grid max-w-4xl grid-cols-4 gap-8">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
                <step.icon size={28} className="text-gold" />
              </div>
              <div className="mb-1 text-xs font-medium text-gold-dim">Step {i + 1}</div>
              <h4 className="mb-2 text-lg font-semibold text-slate-100">{step.title}</h4>
              <p className="text-sm text-slate-400">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What You Get */}
      <section className="border-t border-navy-lighter px-8 py-20">
        <h3 className="mb-12 text-center text-3xl font-bold text-slate-100">What You Get</h3>
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6">
          {[
            {
              icon: FileText,
              title: 'Requirements Document',
              desc: 'Comprehensive PRD covering 19 sections -- users, market, security, UX, and more.',
            },
            {
              icon: Palette,
              title: 'Visual Designs',
              desc: 'Lo-fi and hi-fi wireframes with design tokens, color palettes, and typography.',
            },
            {
              icon: Code2,
              title: 'Architecture Plan',
              desc: 'Tech stack, database schema, API design, and dependency diagrams.',
            },
            {
              icon: Zap,
              title: 'Task Breakdown',
              desc: 'Prioritized tasks with dependencies, effort estimates, and Gantt timelines.',
            },
            {
              icon: Shield,
              title: 'Security Report',
              desc: 'Vulnerability scan with plain-language explanations and fix guidance.',
            },
            {
              icon: TrendingDown,
              title: 'Value Report',
              desc: 'See exactly how much time and money RC Engine saved vs. a human team.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-navy-lighter bg-navy-light p-6">
              <item.icon size={24} className="mb-3 text-gold" />
              <h4 className="mb-2 font-semibold text-slate-100">{item.title}</h4>
              <p className="text-sm text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-t border-navy-lighter px-8 py-16">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-12">
          <div className="text-center">
            <Users size={24} className="mx-auto mb-2 text-gold" />
            <div className="text-2xl font-bold text-slate-100">20</div>
            <div className="text-xs text-slate-500">AI Specialists</div>
          </div>
          <div className="text-center">
            <Code2 size={24} className="mx-auto mb-2 text-gold" />
            <div className="text-2xl font-bold text-slate-100">31</div>
            <div className="text-xs text-slate-500">Pipeline Tools</div>
          </div>
          <div className="text-center">
            <Shield size={24} className="mx-auto mb-2 text-gold" />
            <div className="text-2xl font-bold text-slate-100">8</div>
            <div className="text-xs text-slate-500">Quality Gates</div>
          </div>
          <div className="text-center">
            <FileText size={24} className="mx-auto mb-2 text-gold" />
            <div className="text-2xl font-bold text-slate-100">4</div>
            <div className="text-xs text-slate-500">LLM Providers</div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-navy-lighter px-8 py-20">
        <h3 className="mb-4 text-center text-3xl font-bold text-slate-100">Simple, Transparent Pricing</h3>
        <p className="mb-8 text-center text-slate-400">
          You bring your own API keys -- no markup on AI costs. Pay only for RC Engine features.
        </p>

        {/* Annual toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? 'text-slate-200' : 'text-slate-500'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-6 w-11 rounded-full transition-colors ${annual ? 'bg-gold' : 'bg-navy-lighter'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${annual ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
          <span className={`text-sm ${annual ? 'text-slate-200' : 'text-slate-500'}`}>
            Annual <span className="text-emerald-400">(save ~17%)</span>
          </span>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-lg border p-6 ${
                tier.popular ? 'border-gold bg-navy-light' : 'border-navy-lighter bg-navy-light'
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-0.5 text-xs font-semibold text-navy">
                  {tier.highlight}
                </div>
              )}

              <h4 className="text-lg font-semibold text-slate-100">{tier.name}</h4>
              <div className="mt-2">
                {tier.price === 'Custom' ? (
                  <span className="text-3xl font-bold text-slate-100">Custom</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-slate-100">
                      {annual && tier.annualPrice ? tier.annualPrice : tier.price}
                    </span>
                    {tier.price !== '$0' && <span className="text-slate-500">/mo</span>}
                  </>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">{tier.description}</p>

              <ul className="mt-6 space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onGetStarted(tier.id)}
                className={`mt-6 w-full rounded py-2.5 text-sm font-semibold transition-colors ${
                  tier.popular
                    ? 'bg-gold text-navy hover:bg-gold-light'
                    : 'border border-navy-lighter text-slate-300 hover:border-gold-dim hover:text-gold-light'
                }`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          All plans: You provide your own AI API keys (Anthropic, OpenAI, etc). No markup on AI usage costs. Overage on
          Starter: $0.50/project beyond plan limit.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t border-navy-lighter px-8 py-20 text-center">
        <h3 className="mb-4 text-3xl font-bold text-slate-100">Ready to build your product?</h3>
        <p className="mb-8 text-slate-400">Start free. No credit card required.</p>
        <button
          onClick={onGetStarted}
          className="flex items-center gap-2 mx-auto rounded-lg bg-gold px-8 py-4 text-lg font-semibold text-navy hover:bg-gold-light"
        >
          Get Started Free
          <ArrowRight size={20} />
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-lighter px-8 py-8">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            <span className="font-semibold text-gold">RC</span> Engine -- AI-Powered Product Development
          </div>
          <div className="flex gap-4">
            <span>Terms</span>
            <span>Privacy</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
