# RC Engine -- Conversation UX Templates

Message templates for every pipeline event. The agent MUST use these patterns
when communicating with users. Language is non-technical by default.

## Vocabulary Mapping

Use plain language -- never internal jargon:

| Internal Term | Say Instead |
|---------------|-------------|
| Gate | Checkpoint |
| Persona | Research specialist |
| Phase | Step |
| PRD | Requirements document |
| Artifact | Deliverable |
| Forge | Build |
| Illuminate | Discovery |
| Token | (omit -- say "AI usage" or "cost") |
| Passthrough mode | Manual mode |
| Autonomous mode | Automatic mode |
| Orchestrator | (omit -- invisible to user) |
| MCP | (omit -- invisible to user) |
| State file | (omit -- invisible to user) |
| CWE | (say the plain-language vulnerability name) |
| Legal module | Legal risk review (Pro only) |
| Claims auditor | Self-audit / claims review (Pro only) |
| LGL finding | Legal finding (Pro only) |

---

## Project Kickoff

### When user describes a product idea
```
I'd love to help you build [product name].

Here's my plan:
1. **Research** -- I'll run [N] research specialists to analyze your idea from every angle (market, users, security, UX, and more)
2. **Design** -- We'll create a detailed requirements document and technical architecture
3. **Build** -- I'll generate implementation guidance for each component
4. **Validate** -- Security scan and quality checks before shipping

There are [N] checkpoints along the way where I'll pause and ask for your approval before moving forward. You're always in control.

Ready to start? I'll begin with the research phase.
```

### When user wants to skip research
```
No problem -- we can go straight to building.

I'll start with some discovery questions to understand your project, then we'll create:
1. A requirements document (what to build)
2. A technical architecture (how to build it)
3. A task list (in what order)
4. Quality checks and security scan

Let's begin. I have some questions about your project...
```

---

## Pre-RC Research Events

### After prc_start
```
Project initialized. I've set up the research workspace.

Next, I'll analyze the complexity of your idea to determine which research specialists to activate.
```

### After prc_classify
```
**Complexity Assessment: [Domain]**

Your project is [clear/complicated/complex/chaotic], which means [one-sentence explanation].

I've activated **[N] of 20 research specialists** including:
[bullet list of top 5-6 persona names in plain language]

Estimated research time: ~[N] minutes
Estimated AI cost: ~$[N]

**Checkpoint 1:** Does this research scope look right? Should I add or remove any areas of focus?
- **Approve** -- Start the research
- **Adjust** -- Tell me what to change
```

### After each prc_run_stage
```
**[Stage name] research complete** ([N] of [total] stages done)

[N] specialists contributed:
[bullet list: specialist name -- one-line key finding]

[If any failed: "Warning: [N] specialists couldn't complete their analysis. Their areas were: [list]. This may leave gaps in the research."]

[If gate is due:]
**Checkpoint [N]:** [checkpoint question]
- **Approve** -- Continue to the next stage
- **Adjust** -- Tell me what needs to change
[If no gate:] Moving to the next stage...
```

### After prc_synthesize
```
**Research complete!** Here are your deliverables:

1. **Requirements Document** (PRD) -- [N] sections covering [summary]
2. **Consulting Deck** -- Visual presentation of findings
3. **Task Breakdown** -- [N] tasks estimated at [total effort]
4. **Research Index** -- Token usage breakdown by specialist

Files saved to: pre-rc-research/

**What's next?** You can:
- **Continue to build** -- I'll convert this research into a build plan
- **Review first** -- Take time to read through the deliverables
- **Stop here** -- The PRD is a complete standalone document
```

---

## RC Method Events

### After rc_import_prerc
```
Research imported into the build pipeline. Your 19-section PRD has been converted to the build format.

Steps 1-2 (Discovery and Requirements) are already done from research.
We're starting at **Step 3: Architecture** -- defining how your product will be built.

Do you have any technical preferences? (e.g., "use React and Firebase", "must work offline", "needs to handle 10,000 users")
```

### After rc_architect
```
**Architecture designed.**

Here's the technical plan:
- **Stack:** [tech stack summary]
- **Database:** [data model summary]
- **Integrations:** [list]
- **Infrastructure:** [hosting/deployment summary]

**Checkpoint:** Does this architecture match your expectations?
- **Approve** -- Generate the task list
- **Adjust** -- Tell me what to change
```

### After rc_sequence
```
**Build plan generated.**

**[N] tasks** organized by priority and dependency:
[Top 5 tasks with IDs and one-line descriptions]
[... and N more]

Estimated total effort: [total hours] ([critical path hours] on the critical path)

**How it will be built:**
- [N] parallel execution groups across 4 layers (Foundation, Core, Integration, Polish)
- You'll review each layer before the next one starts

**What happens after building:**
- **Integration check (Step 7):** [N] cross-component interfaces to verify, [N] end-to-end user flows to test
- **Production hardening (Step 8):** [N] security surfaces to scan, [N] monitoring points to instrument, [N] deployment dependencies to configure

**Checkpoint: Review your build plan**
- **Approve and build** -- The plan is solid. Run quality checks, then start building.
- **Review plan again** -- Something needs refinement. Tell me what to change and I'll regenerate.
- **Change direction** -- Go back to architecture, revisit requirements, or adjust scope.
```

### After rc_validate
```
**Quality checks complete.**

| Check | Result |
|-------|--------|
| Anti-pattern scan | [pass/N issues] |
| Budget audit | [pass/over budget by N%] |
| Scope drift | [pass/N items drifted] |
| UX quality | [pass/N issues] |

[If issues found:]
Here's what I found and recommend:
[numbered list of issues with plain-language explanations]

**Checkpoint:** Ready to start building?
- **Approve** -- Begin building task by task
- **Fix first** -- Address the issues above
```

### After each rc_forge_task
```
**Task [ID] complete: [task name]**

[Brief summary of what was built/designed]

Progress: [completed]/[total] tasks ([percentage]%)
[If dependencies:] Next available tasks: [list]

[If all tasks done:]
All tasks complete!

**Checkpoint:** Ready to verify integration?
- **Approve** -- Move to integration check
- **Build more** -- Add or re-run tasks first
```

### After rc_connect
```
**Integration check complete.**

[Summary of integration points verified]

Key findings:
- [N] integration points verified
- [N] gaps or missing connections identified
- Authentication flow: [verified/needs work]
- Data flow: [matches architecture/mismatches found]

**Checkpoint:** Is the integration solid?
- **Approve** -- Move to production hardening
- **Fix first** -- Address integration gaps
```

### After rc_compound
```
**Production hardening assessment complete.**

| Area | Status |
|------|--------|
| Non-functional requirements | [met/gaps] |
| Error handling & recovery | [solid/needs work] |
| Observability readiness | [ready/missing pieces] |
| Security hardening | [hardened/vulnerabilities] |
| Deployment readiness | [ready/blockers] |

**Ship Checklist:** [N] items ready, [N] need attention

**Checkpoint:** Ready for security validation?
- **Approve** -- Run Post-RC security scan
- **Harden first** -- Address the items above
```

### After Phase 8 gate approval (RC Method complete)
```
**RC Method complete -- all 8 steps approved!**

Your project has been through the full build pipeline:
- Discovery and requirements (Steps 1-2)
- Architecture and task planning (Steps 3-4)
- Quality checks (Step 5)
- Implementation (Step 6)
- Integration verification (Step 7)
- Production hardening (Step 8)

**What happens next:**
I'll run a security and monitoring scan to verify your project is ready to ship.
This checks for common vulnerabilities, missing error handling, and monitoring gaps.

Ready to run the security scan?
- **Yes** -- Start the scan
- **Not yet** -- I want to review the deliverables first
```

---

## Post-RC Events

### After postrc_scan
```
**Security scan complete.**

[If PASS:]
PASS: No critical issues found. [N] minor items noted.

[If WARN:]
WARNING: Found [N] issues that should be addressed:
[numbered list with plain-language explanations]
These aren't blocking but I recommend fixing them.

[If BLOCK:]
BLOCKED: Found [N] critical issues that must be resolved:
[numbered list with plain-language explanations]
These must be fixed (or explicitly accepted) before shipping.

**Ship Decision:**
- **Ship** -- Approve for deployment
- **Fix** -- Address the issues first
- **Accept risk** -- I'll record your justification for each accepted issue
```

### Explaining security findings (use these translations)
```
XSS vulnerability → "Your app could be tricked into running harmful code in users' browsers"
SQL injection → "An attacker could manipulate your database through form inputs"
Missing authentication → "Some pages can be accessed without logging in"
Hardcoded credential → "There's a password written directly in the code -- it should be in a secure configuration"
No rate limiting → "Someone could overwhelm your app by sending thousands of requests"
Missing error tracking → "If your app crashes, you won't know about it"
No HTTPS → "Data between your users and your app isn't encrypted"
CSRF vulnerability → "An attacker could trick users into performing actions they didn't intend"
```

### Explaining legal findings (Pro only -- requires rc-engine-pro knowledge files)
```
Missing privacy policy → "Your product collects user data but doesn't tell users how it's handled. Without a privacy policy, you may face regulatory fines (GDPR: up to 4% of annual revenue; CCPA: $2,500-$7,500 per violation)."
Missing terms of service → "Users have no agreement governing how they use your product. Without ToS, you have limited legal recourse if users misuse the service."
GPL dependency risk → "One of your code libraries requires you to open-source your entire product. Using GPL code in a closed-source product is a license violation that can result in injunctions and damages."
AGPL SaaS risk → "A library you use requires you to publish your entire service's source code -- even for SaaS products served over a network."
HIPAA non-compliance → "Your health-related product needs specific data protection that isn't set up yet. HIPAA penalties range from $100 to $50,000 per violation, up to $1.5 million per year per category."
PCI-DSS non-compliance → "Your payment handling doesn't meet credit card industry security standards. Non-compliance can result in fines of $5,000-$100,000 per month from payment processors."
COPPA non-compliance → "Your product targets children but lacks required parental consent mechanisms. FTC enforces COPPA with penalties up to $50,120 per violation."
Missing AI disclaimer → "Your product uses AI but doesn't warn users that outputs may contain errors. Without proper disclaimers, users may hold you liable for AI-generated advice they rely on."
PII without protection → "Your product handles sensitive personal data without specifying how it's protected. Data breach liability and regulatory fines apply."
Missing accessibility → "Your product has a user interface but no plan for users with disabilities. ADA lawsuits have increased significantly -- average settlement is $10,000-$50,000."
GDPR non-compliance → "Your product collects data from EU users but lacks required privacy protections. GDPR fines can reach 20 million euros or 4% of global annual revenue, whichever is higher."
Unqualified marketing claim → "A claim in your documentation could create liability because it overpromises. FTC can pursue deceptive advertising claims with penalties and injunctions."
Missing cookie consent → "Your product uses cookies or tracking for EU users without a consent mechanism. ePrivacy Directive requires opt-in consent for non-essential cookies."
Missing content moderation → "Your product accepts user-generated content but has no DMCA takedown process or content moderation policy. You may lose safe harbor protections under Section 230/DMCA."
Missing auto-renewal disclosure → "Your product has subscription billing but doesn't clearly disclose auto-renewal terms. FTC and state laws (California ARL) require clear disclosure and easy cancellation."
No breach response plan → "Your product stores user data but has no documented breach notification plan. Most jurisdictions require notification within 72 hours (GDPR) or 30-60 days (US state laws)."
Missing vendor DPA → "Your product sends user data to third-party services without data processing agreements. You remain the data controller and are liable for processor violations."
Missing liability limitation → "Your terms of service don't limit your liability. Without a limitation of liability clause, you may be exposed to unlimited damages claims."
```

**Important disclaimer (always include when presenting legal findings):**
```
IMPORTANT: This is automated compliance pattern matching, not legal counsel. Toerana is not
a law firm and does not provide legal services.

These findings are informational. They may include false positives and may miss issues not
covered by the scanner's pattern library. A clean scan does not mean your product is legally
compliant. Consult a qualified attorney for legal advice specific to your product, industry,
and jurisdiction.

Toerana and RC Engine accept no liability for legal, regulatory, or compliance issues in
products built using this framework, whether or not they were flagged by this scan.
```

---

## Traceability Events

### After trace_enhance_prd
```
**Requirements tagged.** I've assigned tracking IDs to all [N] requirements:
- [N] functional requirements
- [N] security requirements
- [N] performance requirements
- [N] UX requirements
[etc.]

This lets us track which requirements get built and tested.
```

### After trace_map_findings
```
**Coverage report:**

| Metric | Value |
|--------|-------|
| Requirements specified | [N] |
| Requirements built | [N] ([%]) |
| Requirements verified | [N] ([%]) |
| Missing (specified but not built) | [N] |

[If orphans exist:]
**Gaps to address:**
[list of orphan requirements with plain-language impact]
```

---

## Error Messages

### API key missing
```
I need an API key to run this step. Currently missing: [provider name].

To set it up:
1. Get an API key from [provider URL]
2. Add it to your .env file as [KEY_NAME]
3. Restart the RC Engine server

Without this key, I can still generate the prompts for you to run manually.
```

### Tool error
```
Something went wrong with [step name].

What happened: [one-sentence plain explanation]
What I recommend: [specific next step]

This doesn't affect your previous work -- everything saved so far is safe.
```

### State corruption
```
I'm having trouble reading the project state file.

This can happen if the process was interrupted during a save.
Your research and deliverables in [directory] are fine -- only the progress tracker is affected.

I can:
- **Try to recover** -- I'll attempt to read what's available
- **Start this step over** -- Redo just the current step (previous work is preserved)
```

---

## Cost Communication

### Pre-run estimate
```
This step will use approximately [N] AI calls, estimated at ~$[cost].
Running total so far: ~$[total].
```

### Budget warning (50%)
```
Heads up: we've used about half the estimated AI budget (~$[spent] of ~$[total]).
Everything is on track -- just keeping you informed.
```

### Budget warning (80%)
```
We're at ~80% of the estimated AI budget (~$[spent] of ~$[total]).
The remaining steps should stay within budget, but let me know if you'd like to adjust anything.
```

### Budget exceeded
```
We've exceeded the initial estimate (~$[spent] vs ~$[estimated]).
This happened because [reason -- e.g., "the research required more specialist analysis than expected"].
Shall I continue? The remaining steps will cost approximately ~$[remaining].
```

---

## Session Resume

### When reopening a session with existing project
```
Welcome back! Here's where we left off:

**Project:** [name]
**Current step:** [phase/stage in plain language]
**Last action:** [what was done]
**Pending:** [what needs to happen next]

Ready to continue?
```

---

## Completion

### Pipeline finished
```
**Your project is complete!**

Here's everything that was produced:
- Requirements document (PRD)
- Technical architecture
- Task list with [N] tasks
- Security scan: [PASS/WARN]
- Coverage: [N]% of requirements verified

All files are in your project directory.

**Next steps you might consider:**
- Review the deliverables in detail
- Start implementing with the task list as your guide
- Share the PRD with stakeholders for feedback
```
