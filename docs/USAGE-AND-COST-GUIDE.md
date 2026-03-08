# RC Engine - Usage & Cost Guide

How much does it cost to run a product through the RC Engine pipeline? This guide breaks down the two layers of cost, recommends a Claude Code plan for your use case, and gives concrete token/dollar estimates for each pipeline phase.

---

## How Costs Work: Two Layers

RC Engine has two separate cost layers. Understanding both prevents surprises.

### Layer 1: Claude Code Subscription (Monthly)

Your Claude Code plan (Pro, Max 5x, Max 20x) covers the **interactive conversation** - the alpha agent that orchestrates your pipeline, presents checkpoints, asks questions, and formats results. This is your Anthropic subscription.

### Layer 2: API Keys (Pay-Per-Use)

When the RC Engine runs research specialists, generates architecture docs, or scans for security issues, those calls go through **your API keys** configured in `.env`. These are separate charges billed directly by each provider (Anthropic, OpenAI, Google, Perplexity).

> **Key takeaway:** Your monthly subscription pays for the conversation. Your API keys pay for the automated work. A full pipeline run typically costs $3-20 in API usage on top of your subscription.

---

## Plan Recommendations

| Plan | Monthly Cost | Best For | Full Pipelines/Month | Rate Limits |
|------|-------------|----------|---------------------|-------------|
| **Pro** | $20 | Light use, reviewing results | 1-2 simple projects | 10-40 prompts per 5-hour window. No Opus access. May hit limits during research phases. |
| **Max 5x** | $100 | Regular product development | 3-5 full runs | 50-200 prompts per 5-hour window. Opus access for complex architecture. **Recommended minimum.** |
| **Max 20x** | $200 | Power users, agencies | 8-15+ full runs | 200-800 prompts per 5-hour window. Heavy daily usage without interruption. |
| **API only** | Per-token | Teams, CI/CD pipelines | Unlimited | No subscription limits. Predictable per-token billing. Best for automated or team use. |

### Which plan should you pick?

- **Building 1-2 simple apps per month?** Pro works, but you may need to pause between research stages to wait for rate limit resets.
- **Regular product development?** Max 5x is the sweet spot. Opus access helps with architecture decisions, and you won't hit limits during normal use.
- **Running multiple projects per week or training a team?** Max 20x gives you headroom for heavy daily usage.
- **Integrating RC Engine into a CI/CD pipeline or team workflow?** Use API billing for predictable, uncapped usage.

---

## Token Consumption by Pipeline Phase

These estimates come from the RC Engine's actual persona token budgets, model routing, and pricing data.

### Pre-RC Research (6 stages, 3-20 specialists)

The number of research specialists depends on your product's complexity classification:

| Complexity | Specialists Activated | Token Range | API Cost |
|------------|----------------------|-------------|----------|
| Clear (simple utility) | 3-6 | 10-15K | $0.50-1.50 |
| Complicated (SaaS, dashboard) | 8-12 | 45-55K | $2-4 |
| Complex (marketplace, platform) | 15-20 | 80-120K | $4-8 |

**Synthesis** (combining research into a PRD) adds 40-80K tokens ($1-3).

**Pre-RC total: 50-200K tokens, $2-12 per project.**

### RC Method Build (8 phases)

| Phase | What Happens | Token Range | API Cost |
|-------|-------------|-------------|----------|
| 1. Illuminate (Discovery) | Asks deep questions about your product | 3-6K | $0.01-0.05 |
| 2. Define (Requirements) | Generates requirements document | 8-15K | $0.05-0.15 |
| 3. Architect (Technical Design) | Designs stack, data model, integrations | 12-23K | $0.10-0.30 |
| 4. Sequence (Task Ordering) | Creates dependency-aware task list | 13-25K | $0.10-0.25 |
| 5. Validate (Quality Checks) | Anti-pattern scan, budget audit, scope drift | 15-30K | $0.40-1.00 |
| 6. Forge (Build) | Generates code/guidance per task | **75-400K** | **$1-8** |
| 7. Connect (Integration) | Validates connections between components | 5-10K | $0.05-0.15 |
| 8. Compound (Production Hardening) | Final architecture review + security assessment | 10-15K | $0.10-0.30 |

Phase 6 (Forge) dominates because it runs once per task:
- 15 tasks: ~120K tokens (~$2)
- 30 tasks: ~240K tokens (~$4)
- 50 tasks: ~400K tokens (~$7)

**RC Method total: 150-550K tokens, $2-12 per project.**

### Post-RC Validation

| Module | What It Does | Token Range | API Cost |
|--------|-------------|-------------|----------|
| Security scan | Analyzes code for vulnerabilities | 20-100K | $0.20-1.50 |
| Monitoring check | Audits error tracking and observability | 5-15K | $0.05-0.20 |
| Report generation | Formats findings into actionable report | 2-5K | $0.02-0.10 |

**Post-RC total: 30-120K tokens, $0.30-1.80 per scan.**

---

## End-to-End Scenarios

### Scenario A: Quick Build (Skip Research)

> "I have a clear idea for a simple CRUD app. I want to go straight to building."

- **Path:** rc_start -> 8 phases with ~15 tasks -> postrc_scan
- **API cost:** ~$3-5
- **Claude Code sessions:** 2-3
- **Recommended plan:** Pro (tight) or Max 5x

### Scenario B: Standard Full Pipeline

> "I'm building a SaaS dashboard. I want full research before I build."

- **Path:** prc_start -> 6 research stages -> 8 build phases with ~30 tasks -> postrc_scan
- **API cost:** ~$10-15
- **Claude Code sessions:** 4-6
- **Recommended plan:** Max 5x

### Scenario C: Deep Research + Complex Build

> "I'm building a marketplace platform. I need thorough analysis from every angle."

- **Path:** prc_start -> 6 research stages (20 specialists) -> 8 build phases with ~50 tasks -> postrc_scan
- **API cost:** ~$15-25
- **Claude Code sessions:** 6-10
- **Recommended plan:** Max 20x

---

## What Affects Your Costs

**Biggest cost drivers (in order):**

1. **Number of forge tasks** - Phase 6 scales linearly. Each additional task adds ~5-8K tokens (~$0.10-0.15). The difference between 15 tasks and 50 tasks is $3-5.

2. **Number of research specialists** - Complexity classification determines how many of the 20 specialists activate. A "clear" product activates 3-6; a "complex" product activates 15-20.

3. **Which API keys you configure** - Gemini handles classification tasks at 10-20x less cost than Claude. Without Gemini, Claude does the same work at higher cost.

4. **Extended thinking** - If using Claude Code with Opus 4.6, extended thinking can use 2-5x more tokens per request. Use `/effort low` for simple tasks like approving checkpoints.

5. **Passthrough mode** - If you configure zero API keys, RC Engine generates structured prompts for you to run in any AI tool. API cost: $0. Trade-off: more manual work.

---

## Cost Optimization Tips

1. **Configure a Gemini API key** - Free tier covers most classification tasks, saving ~60% on those calls. Get one at https://aistudio.google.com/apikey

2. **Use `/effort low` in Claude Code** - For routine interactions (approving checkpoints, checking status), reduce thinking effort to save subscription quota.

3. **Skip Pre-RC for simple products** - If you already know what you're building, go straight to RC Method. Saves $5-12 in API costs.

4. **Monitor costs with `rc_pipeline_status`** - Shows cumulative token usage and cost breakdown by provider and domain.

5. **Start with fewer tasks** - You can always add forge tasks later. Starting with 15 high-priority tasks instead of 50 saves $3-5 and lets you validate the approach.

6. **Use Sonnet for routine work** - Reserve Opus for complex reasoning (architecture, security analysis). Sonnet is 40% cheaper per token.

---

## Rate Limits and Session Planning

Claude Code enforces two concurrent rate limits that affect how you use RC Engine:

### 5-Hour Rolling Window (Burst Limit)

Limits how many prompts you can send in a 5-hour period:

| Plan | Approximate Prompts per Window |
|------|-------------------------------|
| Pro ($20) | 10-40 |
| Max 5x ($100) | 50-200 |
| Max 20x ($200) | 200-800 |

Each RC Engine checkpoint interaction (gate approval, status check, stage review) counts as 1 prompt. A full research phase might use 15-25 prompts for the orchestration conversation.

### Weekly Active Hours

Limits total compute time per week:

| Plan | Sonnet Hours/Week | Opus Hours/Week |
|------|------------------|-----------------|
| Pro ($20) | 40-80 | None |
| Max 5x ($100) | 140-280 | 15-35 |
| Max 20x ($200) | 240-480 | 24-40 |

### Planning Your Sessions

- **Pro users:** Break your pipeline into 2-3 sessions across different days. Run 1-2 research stages per session to avoid hitting burst limits.
- **Max 5x users:** A full Pre-RC research phase fits comfortably in one session. The RC Method build phase may span 2 sessions for complex projects.
- **Max 20x users:** Full pipeline in a single day is feasible for most projects.

---

## API Pricing Reference

These are the per-token rates charged by each provider (as of early 2026). RC Engine's cost tracker uses these rates.

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|-------|----------------------|----------------------|
| Anthropic | Claude Sonnet 4.x | $3.00 | $15.00 |
| Anthropic | Claude Haiku 3.5 | $0.80 | $4.00 |
| OpenAI | GPT-4o | $2.50 | $10.00 |
| OpenAI | GPT-4o Mini | $0.15 | $0.60 |
| Google | Gemini 2.0 Flash | $0.10 | $0.40 |
| Google | Gemini 2.5 Pro | $1.25 | $10.00 |
| Perplexity | Sonar Pro | $3.00 | $15.00 |
| Perplexity | Sonar | $1.00 | $1.00 |

> Gemini Flash is 30-150x cheaper than Claude for the same task. That's why configuring a Gemini API key is the single biggest cost optimization.

---

## Summary

| Pipeline Phase | Typical Token Range | API Cost Range | Models Used |
|----------------|-------------------|----------------|-------------|
| Pre-RC Research (6 stages) | 50-200K | $2-12 | Claude, Gemini, Perplexity, OpenAI |
| RC Method Build (8 phases) | 150-550K | $2-12 | Claude (primary) |
| Post-RC Validation | 30-120K | $0.30-1.80 | Claude |
| **Full Pipeline** | **200-800K** | **$3-20** | **Mixed** |

**Bottom line:** Max 5x ($100/month) with a $3-5 Gemini API key gets you optimal results for most projects.
