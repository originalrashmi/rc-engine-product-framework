/**
 * Agent Evaluation: Tool Selection
 *
 * Tests that given a user intent, the correct tool would be selected
 * based on tool descriptions alone. This verifies that our rewritten
 * tool descriptions are unambiguous and front-load the right signals.
 *
 * These tests do NOT call LLMs. They pattern-match against tool
 * descriptions to verify the right keywords and sequencing hints exist.
 */
import { describe, it, expect } from 'vitest';

// Tool descriptions extracted from source (keep in sync with actual tool registrations)
const TOOL_DESCRIPTIONS: Record<string, string> = {
  prc_start:
    'FIRST STEP of Pre-RC research. Call when the user describes a product idea and you want deep research before building. Creates the pre-rc-research/ directory and initializes project state. Prerequisites: none -- this is the entry point. After success: MUST call prc_classify next. Never skip to prc_run_stage without classifying first.',
  prc_classify:
    'Call AFTER prc_start. Classifies the product idea using Cynefin framework (Clear/Complicated/Complex/Chaotic) and activates the appropriate subset of 20 research personas. Returns: complexity domain, activated persona list, estimated token budget, and which stages to run. After success: present the classification to the user as Gate 1 -- call prc_gate with their decision. Read-only analysis, no side effects beyond state update.',
  prc_gate:
    'Submit a gate decision for the current Pre-RC checkpoint. NEVER call without presenting the gate context to the user first and getting their explicit decision. Three gates exist: Gate 1 (after classify -- is research scope right?), Gate 2 (after stages 1-4 -- is research accurate?), Gate 3 (after all stages -- ready to build?). Valid decisions: "approve" to proceed, "reject" with feedback to revise, "question" to pause for clarification. After approve: proceed to next stage or prc_synthesize (after Gate 3). After reject: re-run the relevant stage with user feedback.',
  prc_run_stage:
    'Run all activated research personas for a specific stage. LONG-RUNNING: each persona makes an LLM call (10-30s each, sequential). Warn the user this will take several minutes. Valid stages: "stage-1-meta", "stage-2-user-intelligence", "stage-3-business-market" (uses web search), "stage-4-technical", "stage-5-ux-cognitive", "stage-6-validation". Prerequisites: prc_classify must be complete. Stage order matters -- run 1->2->3->4->5->6 with gates at 1, 4, and 6. After each stage: check if a gate is due (after stages 1, 4, 6) -- if so, present results and call prc_gate. Returns persona results with success/failure markers.',
  prc_status:
    'Check Pre-RC research progress. Read-only, safe to call anytime. Returns: current stage, completed stages, gate statuses, persona results, token usage. Use this to orient yourself when resuming a session or when the user asks "where are we?" Call this BEFORE deciding which prc_ tool to call next if you are unsure of the current state.',
  prc_synthesize:
    'FINAL STEP of Pre-RC. Call ONLY after Gate 3 is approved (all 6 stages complete). Synthesizes all persona research into deliverables: 19-section PRD (markdown), HTML consulting deck, task list, DOCX document, and research index. LONG-RUNNING: involves multiple LLM calls for synthesis. Set include_task_deck=true to also generate a visual task breakdown deck. After success: present deliverables to user. To continue into RC Method, call rc_import_prerc. This is a natural stopping point -- user may choose to stop here with just the PRD.',
  prc_stress_test:
    'Run AFTER prc_synthesize, BEFORE building. Challenges the product idea with VC-level scrutiny across market viability, technical feasibility, business model, and competitive landscape. Returns GO/NO-GO recommendation with detailed reasoning. Pro tier only. After success: proceed to rc_import_prerc to begin the build phase.',

  rc_import_prerc:
    'BRIDGE from Pre-RC to RC Method. Call after prc_synthesize completes and user wants to continue building. Converts the 19-section Pre-RC PRD to 11-section RC format, auto-approves Phases 1-2, and advances to Phase 3 (Architect). Prerequisites: pre-rc-research/ directory must exist with Gate 3 approved. After success: call rc_architect to begin technical design. Skips rc_start/rc_illuminate/rc_define since Pre-RC already covered discovery and requirements.',
  rc_start:
    'Start RC Method WITHOUT Pre-RC research. Use when user wants to go straight to building without the 20-persona research phase. Creates rc-method/ directory and project state, begins Phase 1 (Illuminate) with discovery questions. Returns discovery questions -- present these to the user and collect their answers. After success: call rc_illuminate with user answers. Do NOT use this if Pre-RC was run -- use rc_import_prerc instead.',
  rc_illuminate:
    "Phase 1 (Illuminate). Call after rc_start, passing the user's answers to discovery questions. Generates an Illuminate Report summarizing the problem space, users, and constraints. Returns report + gate prompt. Present the report to the user and ask for approval via rc_gate. Prerequisites: must be in Phase 1. After gate approval: moves to Phase 2 (Define).",
  rc_define:
    'Phase 2 (Define). Generates a Product Requirements Document from user-provided feature descriptions, user stories, and requirements. Produces an 11-section PRD saved to rc-method/prds/. Returns PRD content + gate prompt. Present the PRD to the user for review. Prerequisites: Phase 1 gate approved. After gate approval: moves to Phase 3 (Architect). Consider running ux_score on the feature list and ux_generate for UX-heavy products.',
  rc_architect:
    'Phase 3 (Architect). Defines technical architecture: tech stack, data models, API design, integrations, and infrastructure. Pass the user\'s technical preferences or constraints in architecture_notes (e.g., "use Next.js and Supabase", "must integrate with Stripe"). Returns architecture document + gate prompt. Prerequisites: Phase 2 gate approved (or Phase 1-2 auto-approved via rc_import_prerc). After gate approval: moves to Phase 4 (Sequence).',
  rc_sequence:
    'Phase 4 (Sequence). Auto-generates a sequenced, dependency-ordered task list from the approved PRD and architecture. Each task gets an ID (TASK-001, TASK-002...) with estimated effort and dependencies. Saved to rc-method/tasks/. No user input needed -- reads PRD artifacts automatically. Present the task list to user for approval. Prerequisites: Phase 3 gate approved. After gate approval: moves to Phase 5 (Validate).',
  rc_validate:
    'Phase 5 (Validate). QUALITY GATE before building. Runs 4 automated checks: anti-pattern scan, token budget audit, scope drift detection, and UX quality assessment. This catches problems BEFORE code is written -- saving significant rework. No user input needed. Present findings to user with severity ratings. Prerequisites: Phase 4 gate approved. After gate approval: moves to Phase 6 (Forge) -- begin building with rc_forge_task.',
  rc_forge_task:
    'Phase 6 (Forge). Call once per task from the approved task list. Loads the PRD, architecture, and task context, then generates implementation guidance for the specified task_id (e.g., "TASK-001"). Call this for EACH task in sequence, respecting dependency order. Prerequisites: Phase 5 gate approved, valid task_id from the task list. After ALL tasks complete: proceed to Phase 7 (Connect) via rc_gate, then run postrc_scan for security validation. Present each task result to user before moving to the next.',
  rc_connect:
    'Phase 7 (Connect). Call after all Forge tasks complete. Verifies integration points across all built components: API contracts, data flow, authentication, error propagation, and end-to-end user flows. Prerequisites: Phase 6 gate approved. After gate approval: moves to Phase 8 (Compound).',
  rc_compound:
    'Phase 8 (Compound). Production hardening assessment. Evaluates: non-functional requirements, error handling and recovery, observability readiness, security hardening, and deployment readiness. Produces a ship checklist. Prerequisites: Phase 7 gate approved. After gate approval: move to Post-RC validation via postrc_scan.',
  rc_gate:
    'Submit user\'s gate decision for the current RC Method phase. NEVER call without first presenting the phase output to the user and getting their explicit approval. Valid decisions: "approve" advances to next phase, "reject" stays at current phase (include reason in feedback), "question" pauses for clarification. Gates exist after Phases 1-5, 7, and 8. Phase 6 (Forge) has no gate -- it runs per-task. After approve: the next phase tool becomes available. After reject: re-run the current phase tool with adjusted inputs.',
  rc_save:
    'PASSTHROUGH MODE ONLY. Save an artifact generated by the host IDE (not by RC Engine tools) into the RC Method file structure. Use when the IDE\'s own AI generated a PRD, UX PRD, or task list that should be tracked by RC Method. Types: "prd" saves to rc-method/prds/, "prd-ux" saves UX child PRD, "tasks" saves task list. Do NOT use this for artifacts already saved by rc_define, rc_sequence, or ux_generate -- those tools save automatically.',
  rc_status:
    'Check RC Method progress. Read-only, safe to call anytime. Returns: current phase (1-8), gate statuses (approved/pending/rejected), saved artifacts list, and UX score if scored. Use this to orient yourself when resuming a session, when the user asks "where are we?", or before deciding which rc_ tool to call next. Also useful to verify a gate was recorded after calling rc_gate.',

  ux_score:
    'OPTIONAL -- call during Phase 2 (Define) to assess UX complexity. Pass the feature list from the PRD. Returns: numeric score, mode (standard/selective/deep_dive), and which UX specialist modules to load. Use the result to decide whether to call ux_generate (for deep_dive/selective) or skip UX child PRD (for standard). Does NOT require project_path -- works on any feature list. Read-only analysis.',
  ux_audit:
    'Audit UI code or a screen description against 42 core UX rules plus specialist modules. Call during or after Forge (Phase 6) to check implementation quality. task_type controls which specialist modules load: form, dashboard, onboarding, admin, payment, component_library, content, navigation, or "audit" to load all. Returns findings with severity, rule citations, and fix suggestions. Use this to catch UX issues before postrc_scan.',
  ux_generate:
    'Generate a UX child PRD (PRD-[project]-ux.md). Call during Phase 2 (Define) if ux_score returned selective or deep_dive mode. Produces: screen inventory, state contracts, component inventory, copy inventory, and accessibility checklist. Saved alongside the main PRD in rc-method/prds/. Pass descriptions of the screens and user flows. After success: the UX PRD is used by rc_validate (Phase 5) for UX quality checks and by rc_forge_task for implementation guidance.',
  ux_design:
    'Generate visual design options with HTML wireframes. Call after Define phase to produce 1-3 design options based on ICP and design intake. Each option includes color palette, typography, layout, and personality. Returns design spec with recommendation. Prerequisites: PRD must exist.',

  postrc_scan:
    'Run AFTER building (Phase 6 Forge complete). Scans code for security vulnerabilities and checks monitoring instrumentation. Pass code_context with the actual project code -- without it, the scan has nothing to analyze. Returns findings by severity (critical/high/medium/low) with CWE references. LONG-RUNNING: involves LLM analysis. After success: present findings to user in plain language. Then call postrc_gate for ship/no-ship decision. If critical findings exist, also generates REMEDIATION-TASKS file.',
  postrc_override:
    'Override a specific scan finding when the user accepts the risk. Requires: finding_id (from postrc_scan results) and justification (why this is acceptable). Creates an immutable audit record. Use when postrc_gate is blocked by a finding the user wants to accept. ALWAYS warn the user if overriding critical/high severity. Optionally set an expiration date. After override: re-run postrc_gate to re-evaluate ship decision.',
  postrc_report:
    'Generate a formal validation report from scan results. Call after postrc_scan to produce a shareable markdown document with: findings summary, severity breakdown, override records, and remediation recommendations. Useful for stakeholders, compliance, or audit trails. Saved to post-rc/. Read-only -- does not modify scan state.',
  postrc_configure:
    'OPTIONAL -- configure validation policy BEFORE running postrc_scan. Sets: which modules are active (security, monitoring), whether to block on critical/high findings, CWE suppressions (known false positives), and monitoring requirements (error tracking, analytics, dashboards, alerts). Defaults are reasonable -- only call this if the user has specific compliance or risk tolerance requirements. Saved to post-rc/ state.',
  postrc_gate:
    'FINAL GATE -- ship/no-ship decision. Call after postrc_scan completes and user has reviewed findings. NEVER auto-approve -- always present findings summary first. Returns PASS (safe to ship), WARN (issues exist but not blocking), or BLOCK (critical issues must be fixed or overridden). If BLOCK: user must either fix issues and re-scan, or use postrc_override to accept risks. After PASS/approved: pipeline is complete for the build phase. Consider running trace_map_findings next for coverage metrics.',
  postrc_status:
    'Check Post-RC validation progress. Read-only, safe to call anytime. Returns: active modules, latest scan ID and findings count, override count, and gate status. Use this to orient yourself when resuming a session or when the user asks about validation status. Call before postrc_gate if you need to verify scan results are available.',
  postrc_generate_observability_spec:
    'PRE-FLIGHT tool -- run BEFORE RC Method build phase, ideally after rc_define (Phase 2). Generates an observability requirements document from the PRD: error tracking setup, analytics events, SLO definitions, dashboard specs, and alerting rules. This ensures monitoring is designed in, not bolted on after shipping. Output feeds into rc_architect as a companion to the PRD. Optional but strongly recommended for production applications.',

  trace_enhance_prd:
    'Assign tracking IDs to every requirement in the PRD. Call after PRD is created (rc_define or prc_synthesize) and BEFORE building. Auto-discovers PRDs in both pre-rc-research/ and rc-method/prds/. Assigns deterministic IDs by category: PRD-FUNC-001, PRD-SEC-001, PRD-PERF-001, etc. (8 categories). In autonomous mode, also generates testable acceptance criteria. Creates the traceability matrix in rc-traceability/. After success: tell user how many requirements were tagged by category. Does NOT modify the original PRD -- creates an enhanced copy.',
  trace_map_findings:
    'Run AFTER both building (Forge) and scanning (postrc_scan). Maps Post-RC findings and RC task completions back to the requirement IDs from trace_enhance_prd. Calculates: implementation coverage %, verification coverage %, orphan requirements (specified but never built), and orphan tasks (built but not in PRD). Generates a consulting-grade HTML traceability report. Prerequisites: trace_enhance_prd must have been run, and ideally postrc_scan completed. Present coverage gaps to user -- orphan requirements are the most critical signal.',
  trace_status:
    'Check traceability coverage. Read-only, safe to call anytime after trace_enhance_prd. Returns: total requirements, implemented count, verified count, coverage percentages, orphan lists. Use when user asks "what percentage is done?" or "what did we miss?" Also useful mid-build to track progress against requirements.',

  rc_init:
    'Call FIRST when starting a new session. Detects existing state across all 4 domains and routes to the correct next tool. Defaults to Pre-RC research (prc_start) when no state exists. After success: follow the recommended next tool from the response.',
  rc_forge_all:
    'Run all pending forge tasks in sequence. Call after Phase 5 gate approval to build all tasks automatically instead of calling rc_forge_task one by one. After success: proceed to Phase 7 (Connect) via rc_gate.',
  rc_autopilot:
    'Run remaining phases automatically with gate checks. Advances through phases, pausing at gates for approval. Use when the user wants to run the pipeline with minimal interaction. After success: pipeline is complete or paused at the next gate requiring approval.',
  rc_reset:
    'Call to reset pipeline state. Clears state for one or all domains. Requires explicit confirmation. Use when the user wants to start over. After success: pipeline is clean and ready for a fresh run via rc_init or prc_start.',
  design_challenge:
    'Stress-test design options against edge cases, accessibility, and real-world scenarios. Call after design options are generated. After success: present weaknesses to user, then proceed to design_select.',
  copy_research_brief:
    'Research brand voice and copy direction from PRD and market context. Call after PRD exists, before generating copy. After success: proceed to copy_generate with the research brief.',
  copy_generate:
    'Generate copy for product surfaces (headlines, CTAs, onboarding, error messages). Call after copy_research_brief. After success: present copy to user for review, then use copy_iterate or copy_critique.',
  copy_iterate:
    'Refine generated copy based on user feedback. Call after copy_generate when the user wants adjustments. After success: present updated copy to user.',
  copy_critique:
    'Review copy quality for clarity, consistency, and effectiveness. Call to get an objective assessment. After success: present critique to user and decide whether to iterate.',
  design_research_brief:
    'Research design patterns and visual direction for the product. Call after PRD to analyze competitors and design trends. After success: proceed to design_intake.',
  design_intake:
    'Capture design preferences, constraints, and brand assets. Call before generating design options. After success: proceed to ux_design to generate options.',
  brand_import:
    'Import existing brand assets (colors, fonts, logos, guidelines). Call when the user has existing brand identity. After success: assets are available for design generation.',
  design_iterate:
    'Refine designs based on user feedback. Call after design options are generated. After success: present updated designs to user.',
  design_select:
    "Record the user's design selection from generated options. Call when the user chooses a direction. After success: selection is saved and available for architect/forge phases.",
  design_pipeline:
    'Run the full design flow end-to-end: research, intake, generate, challenge, select. After success: design is complete and ready for the build phase.',
  playbook_generate:
    'Generate a step-by-step implementation playbook from build artifacts. Call after RC Method is complete. After success: playbook is saved to rc-method/ for developer handoff.',
  pdf_export:
    'Export deliverables as formatted HTML suitable for PDF conversion. Call to create shareable documents. After success: files are saved to the project directory.',
  rc_pipeline_status:
    'High-level overview of the entire pipeline. Read-only, safe to call anytime. Shows token usage totals and registered domain summary. Call this FIRST when starting a new session to orient yourself, or when the user asks for a big-picture status. For detailed per-domain progress, follow up with the domain-specific status tools: prc_status, rc_status, postrc_status, trace_status.',
};

// Helper: find which tool best matches a user intent based on description keywords
function findBestMatch(intent: string, descriptions: Record<string, string>): string[] {
  const intentWords = intent.toLowerCase().split(/\s+/);
  const scores: Array<{ tool: string; score: number }> = [];

  for (const [tool, desc] of Object.entries(descriptions)) {
    const descLower = desc.toLowerCase();
    let score = 0;
    for (const word of intentWords) {
      if (word.length > 3 && descLower.includes(word)) {
        score++;
      }
    }
    if (score > 0) {
      scores.push({ tool, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.map((s) => s.tool);
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('Tool Description Completeness', () => {
  it('all 52 tools have descriptions', () => {
    expect(Object.keys(TOOL_DESCRIPTIONS)).toHaveLength(52);
  });

  it('every description starts with WHEN to call (action word or context)', () => {
    const actionStarters = [
      'FIRST',
      'Call',
      'Submit',
      'Run',
      'Check',
      'FINAL',
      'BRIDGE',
      'Start',
      'Phase',
      'OPTIONAL',
      'PASSTHROUGH',
      'Audit',
      'Generate',
      'Override',
      'Assign',
      'PRE-FLIGHT',
      'High-level',
      'Stress-test',
      'Research',
      'Refine',
      'Review',
      'Capture',
      'Import',
      'Record',
      'Export',
    ];

    for (const [tool, desc] of Object.entries(TOOL_DESCRIPTIONS)) {
      const startsWithAction = actionStarters.some((s) => desc.startsWith(s));
      expect(
        startsWithAction,
        `${tool} description should start with an action word, got: "${desc.slice(0, 30)}..."`,
      ).toBe(true);
    }
  });

  it('every description mentions what to do after success', () => {
    const afterKeywords = [
      'After',
      'after',
      'next',
      'Then',
      'then',
      'proceed',
      'continue',
      'follow up',
      'decide',
      'Use the result',
      'Present',
    ];
    // Status/read-only tools and passthrough tools are exempt -- they don't trigger next steps
    const readOnlyTools = [
      'prc_status',
      'rc_status',
      'postrc_status',
      'trace_status',
      'rc_pipeline_status',
      'rc_save',
      'postrc_configure',
    ];

    for (const [tool, desc] of Object.entries(TOOL_DESCRIPTIONS)) {
      if (readOnlyTools.includes(tool)) continue;
      const hasAfter = afterKeywords.some((k) => desc.includes(k));
      expect(hasAfter, `${tool} description should mention what to do after success`).toBe(true);
    }
  });

  it('gate tools mention NEVER auto-approve', () => {
    const gateTools = ['prc_gate', 'rc_gate', 'postrc_gate'];
    for (const tool of gateTools) {
      expect(TOOL_DESCRIPTIONS[tool]).toMatch(/NEVER/i);
    }
  });

  it('long-running tools warn about duration', () => {
    const longRunning = ['prc_run_stage', 'prc_synthesize', 'postrc_scan'];
    for (const tool of longRunning) {
      expect(TOOL_DESCRIPTIONS[tool]).toMatch(/LONG-RUNNING/i);
    }
  });
});

describe('Tool Selection: User Intent -> Correct Tool', () => {
  it('user says "build me a SaaS app" -> prc_start is first match', () => {
    const matches = findBestMatch('user describes product idea starting fresh', TOOL_DESCRIPTIONS);
    expect(matches[0]).toBe('prc_start');
  });

  it('user asks "where are we?" -> status tools rank highest', () => {
    const matches = findBestMatch('where are we in the project progress', TOOL_DESCRIPTIONS);
    const statusTools = ['prc_status', 'rc_status', 'postrc_status', 'trace_status', 'rc_pipeline_status'];
    expect(statusTools).toContain(matches[0]);
  });

  it('user wants to skip research -> rc_start matches', () => {
    const matches = findBestMatch('skip research go straight to building without research', TOOL_DESCRIPTIONS);
    expect(matches).toContain('rc_start');
  });

  it('user says "scan for security" -> postrc_scan matches', () => {
    const matches = findBestMatch('scan code security vulnerabilities', TOOL_DESCRIPTIONS);
    expect(matches[0]).toBe('postrc_scan');
  });

  it('user approves a checkpoint -> gate tools match', () => {
    const matches = findBestMatch('approve gate decision checkpoint', TOOL_DESCRIPTIONS);
    const gateTools = ['prc_gate', 'rc_gate', 'postrc_gate'];
    expect(gateTools).toContain(matches[0]);
  });

  it('user asks about requirement coverage -> trace_status matches', () => {
    const matches = findBestMatch('what percentage requirements coverage done', TOOL_DESCRIPTIONS);
    expect(matches).toContain('trace_status');
  });

  it('user wants to override a finding -> postrc_override matches', () => {
    const matches = findBestMatch('override accept risk finding justification', TOOL_DESCRIPTIONS);
    expect(matches[0]).toBe('postrc_override');
  });

  it('user wants to generate UX spec -> ux_generate matches', () => {
    const matches = findBestMatch('generate UX child PRD screen inventory accessibility', TOOL_DESCRIPTIONS);
    expect(matches[0]).toBe('ux_generate');
  });
});

describe('Tool Sequencing: Prerequisites Are Documented', () => {
  it('prc_start has no prerequisites', () => {
    expect(TOOL_DESCRIPTIONS.prc_start).toMatch(/Prerequisites: none/i);
  });

  it('prc_classify requires prc_start', () => {
    expect(TOOL_DESCRIPTIONS.prc_classify).toMatch(/AFTER prc_start/i);
  });

  it('prc_synthesize requires Gate 3', () => {
    expect(TOOL_DESCRIPTIONS.prc_synthesize).toMatch(/Gate 3/);
  });

  it('rc_import_prerc requires Pre-RC synthesis', () => {
    expect(TOOL_DESCRIPTIONS.rc_import_prerc).toMatch(/prc_synthesize/);
  });

  it('rc_architect requires Phase 2 or import', () => {
    expect(TOOL_DESCRIPTIONS.rc_architect).toMatch(/Phase 2|rc_import_prerc/);
  });

  it('rc_forge_task requires Phase 5 gate', () => {
    expect(TOOL_DESCRIPTIONS.rc_forge_task).toMatch(/Phase 5/);
  });

  it('postrc_scan requires building complete', () => {
    expect(TOOL_DESCRIPTIONS.postrc_scan).toMatch(/AFTER building|Forge complete/i);
  });

  it('trace_map_findings requires both building and scanning', () => {
    expect(TOOL_DESCRIPTIONS.trace_map_findings).toMatch(/AFTER.*building.*scanning|AFTER.*Forge.*postrc_scan/i);
  });
});

describe('Tool Safety: Guardrails in Descriptions', () => {
  it('prc_gate warns about presenting context first', () => {
    expect(TOOL_DESCRIPTIONS.prc_gate).toMatch(/NEVER call without presenting/i);
  });

  it('rc_gate warns about presenting context first', () => {
    expect(TOOL_DESCRIPTIONS.rc_gate).toMatch(/NEVER call without/i);
  });

  it('postrc_gate warns about auto-approval', () => {
    expect(TOOL_DESCRIPTIONS.postrc_gate).toMatch(/NEVER auto-approve/i);
  });

  it('postrc_override warns about critical severity', () => {
    expect(TOOL_DESCRIPTIONS.postrc_override).toMatch(/warn.*critical|critical.*warn/i);
  });

  it('rc_save is marked as passthrough only', () => {
    expect(TOOL_DESCRIPTIONS.rc_save).toMatch(/PASSTHROUGH/i);
  });

  it('rc_start warns against using after Pre-RC', () => {
    expect(TOOL_DESCRIPTIONS.rc_start).toMatch(/Do NOT use this if Pre-RC/i);
  });
});

describe('Read-Only Tools Are Marked Safe', () => {
  const safeTools = ['prc_status', 'rc_status', 'postrc_status', 'trace_status', 'rc_pipeline_status', 'ux_score'];

  for (const tool of safeTools) {
    it(`${tool} is marked read-only or safe`, () => {
      expect(TOOL_DESCRIPTIONS[tool]).toMatch(/Read-only|safe to call anytime/i);
    });
  }
});
