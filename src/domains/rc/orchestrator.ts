import { ContextLoader } from './context-loader.js';
import { StateManager } from './state/state-manager.js';
import { GateAgent } from './agents/gate-agent.js';
import { PrdAgent } from './agents/prd-agent.js';
import { TaskAgent } from './agents/task-agent.js';
import { QualityAgent } from './agents/quality-agent.js';
import { ConnectAgent } from './agents/connect-agent.js';
import { CompoundAgent } from './agents/compound-agent.js';
import { UxAgent } from './agents/ux-agent.js';
import { DesignAgent } from './agents/design-agent.js';
import { PreRcBridgeAgent } from './agents/prerc-bridge-agent.js';
import { llmFactory } from '../../shared/llm/factory.js';
import type { LLMFactory } from '../../shared/llm/factory.js';
import { LLMProvider } from '../../shared/types.js';
import { tokenTracker } from '../../shared/token-tracker.js';
import { hasApiKey } from '../../shared/config.js';
import { audit, formatRecentActivity } from '../../shared/audit.js';
import { routeRequest } from '../../shared/model-router.js';
import { recordCost, getCostSummary } from '../../shared/cost-tracker.js';
import { recordGateOutcome, recordModelPerformance, getLearningSummary } from '../../shared/learning.js';
import { recordProjectUsage } from '../../shared/usage-meter.js';
import { formatCostSummary } from '../../shared/cost-tracker.js';
import { recordPipelineTimings } from '../../shared/benchmark.js';
import type { AgentResult, ProjectState, Phase, TechStack } from './types.js';
import type { DesignInput } from './design-types.js';
import { GateStatus, PHASE_NAMES, GATED_PHASES } from './types.js';
import { getProjectStore } from '../../shared/state/store-factory.js';
import { NODE_IDS } from '../../shared/state/pipeline-id.js';
import fs from 'node:fs';
import path from 'node:path';

export class Orchestrator {
  private stateManager: StateManager;
  private contextLoader: ContextLoader;
  private llmFactory: LLMFactory;
  private gateAgent: GateAgent;
  private prdAgent: PrdAgent;
  private taskAgent: TaskAgent;
  private qualityAgent: QualityAgent;
  private connectAgent: ConnectAgent;
  private compoundAgent: CompoundAgent;
  private uxAgent: UxAgent;
  private designAgent: DesignAgent;
  private preRcBridgeAgent: PreRcBridgeAgent;

  constructor() {
    this.stateManager = new StateManager();
    this.contextLoader = new ContextLoader();
    this.llmFactory = llmFactory;
    this.gateAgent = new GateAgent(this.contextLoader, this.llmFactory);
    this.prdAgent = new PrdAgent(this.contextLoader, this.llmFactory);
    this.taskAgent = new TaskAgent(this.contextLoader, this.llmFactory);
    this.qualityAgent = new QualityAgent(this.contextLoader, this.llmFactory);
    this.connectAgent = new ConnectAgent(this.contextLoader, this.llmFactory);
    this.compoundAgent = new CompoundAgent(this.contextLoader, this.llmFactory);
    this.uxAgent = new UxAgent(this.contextLoader, this.llmFactory);
    this.designAgent = new DesignAgent(this.contextLoader, this.llmFactory);
    this.preRcBridgeAgent = new PreRcBridgeAgent(this.contextLoader, this.llmFactory);
  }

  /**
   * Dual-mode execution for orchestrator-level calls.
   * If API key exists: calls LLM via shared factory with token tracking.
   * If no key: returns assembled context for the host IDE.
   *
   * CRITICAL FIX: The old chatWithClaude() returned string and discarded token usage.
   * Now we use LLMFactory which returns {content, tokensUsed, provider} and record usage.
   */
  private async execute(knowledgeContent: string, agentInstructions: string, userMessage: string): Promise<string> {
    this.phaseStartMs = Date.now();
    const systemPrompt = `${knowledgeContent}\n\n---\n\n${agentInstructions}`;

    if (hasApiKey) {
      const { client } = routeRequest({
        taskType: 'rc-orchestrator',
        domain: 'rc',
        preferredProvider: LLMProvider.Claude,
      });
      const startMs = Date.now();
      const response = await client.chatWithRetry({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 4096,
      });
      tokenTracker.record('rc', 'Orchestrator', response.tokensUsed, response.provider);
      recordCost({
        pipelineId: 'rc-session',
        domain: 'rc',
        tool: 'Orchestrator',
        provider: response.provider,
        model: client.getModel(),
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? response.tokensUsed,
      });
      recordModelPerformance({
        provider: response.provider,
        model: client.getModel(),
        taskType: 'rc-orchestrator',
        latencyMs: Date.now() - startMs,
        tokensUsed: response.tokensUsed,
        success: true,
      });
      return response.content;
    }

    // Passthrough mode
    return [
      `## RC Method Agent Instructions\n\n${agentInstructions}`,
      `## Knowledge Reference\n\n${knowledgeContent}`,
      `## Request\n\n${userMessage}`,
      `## Output Instructions\n\nFollow the instructions and knowledge above to generate the requested output. If an artifact needs saving, call the \`rc_save\` tool with the content and artifact type.`,
    ].join('\n\n---\n\n');
  }

  /**
   * Finalize a phase: in autonomous mode, run gate agent for summary.
   * In passthrough mode, skip gate agent to avoid content duplication
   * (the host IDE handles gate presentation directly).
   */
  /** Track phase start time for benchmark recording */
  private phaseStartMs: number = 0;

  private async finalizePhase(
    projectPath: string,
    state: ProjectState,
    phaseOutput: string,
    artifacts?: string[],
  ): Promise<AgentResult> {
    // Record phase timing for benchmarks (with token count and cost data)
    const durationMs = this.phaseStartMs > 0 ? Date.now() - this.phaseStartMs : 0;
    if (durationMs > 0) {
      const costSnapshot = getCostSummary('rc-session');
      recordPipelineTimings(`rc-${state.projectName}`, [
        {
          domain: 'rc',
          phase: PHASE_NAMES[state.currentPhase],
          durationMs,
          tokenCount: costSnapshot ? costSnapshot.totalInputTokens + costSnapshot.totalOutputTokens : undefined,
          estimatedCostUsd: costSnapshot?.totalCostUsd,
        },
      ]);
    }

    if (hasApiKey) {
      const gateResult = await this.gateAgent.presentGate(state, phaseOutput);
      this.stateManager.save(projectPath, state);
      audit('phase.complete', 'rc', projectPath, { artifacts: artifacts?.length ?? 0 }, String(state.currentPhase));
      return {
        text: `${phaseOutput}\n\n${gateResult.text}`,
        artifacts,
        gateReady: true,
      };
    }

    // Passthrough mode: return phase output directly without gate agent
    // Gate presentation is handled by the host IDE
    this.stateManager.save(projectPath, state);
    audit('phase.complete', 'rc', projectPath, { artifacts: artifacts?.length ?? 0 }, String(state.currentPhase));
    return {
      text: phaseOutput,
      artifacts,
      gateReady: true,
    };
  }

  /** Start a new RC Method project (Phase 1: Illuminate) */
  async start(
    projectPath: string,
    projectName: string,
    description: string,
    techStack?: TechStack,
  ): Promise<AgentResult> {
    if (this.stateManager.exists(projectPath)) {
      const state = this.stateManager.load(projectPath);
      return {
        text: `Project "${state.projectName}" already exists at this path. Current phase: ${state.currentPhase} - ${PHASE_NAMES[state.currentPhase]}.\n\nOptions:\n- Use **rc_status** to see full progress\n- Use the appropriate phase tool to continue (e.g. rc_illuminate, rc_define, rc_architect)\n- Use **rc_reset** to clear state and start fresh with rc_start`,
      };
    }

    const state = this.stateManager.create(projectPath, projectName);

    // Store tech stack selection (defaults applied if not specified)
    state.techStack = techStack ?? {
      language: 'typescript',
      framework: 'nextjs',
      uiFramework: 'react',
      database: 'postgresql',
      orm: 'prisma',
    };

    const masterKnowledge = this.contextLoader.loadFile('skills/rc-master.md');

    const instructions = `You are the RC Method orchestrator starting Step 1: Discovery. Your job is to ask the product owner discovery questions to understand the problem, existing systems, and gaps.\n\nRules:\n- Write in plain business language\n- Ask focused discovery questions\n- The project is "${projectName}"`;

    const text = await this.execute(
      masterKnowledge,
      instructions,
      `New project: "${projectName}"\n\nDescription: ${description}\n\nBegin the Illuminate phase by asking discovery questions about this project.`,
    );

    this.stateManager.save(projectPath, state);
    audit('project.create', 'rc', projectPath, { projectName });
    recordProjectUsage('operator', projectPath, projectName);

    return { text };
  }

  /** Process Illuminate phase answers (Phase 1) */
  async illuminate(projectPath: string, discoveryAnswers: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 1, 'rc_illuminate');

    const masterKnowledge = this.contextLoader.loadFile('skills/rc-master.md');

    const instructions = `You are the RC Method orchestrator in Step 1: Discovery. Synthesize the operator's discovery answers into a Discovery Report.\n\nRules:\n- Write in plain business language\n- Identify existing systems, gaps, and pain points\n- Produce a clear summary for the checkpoint review\n- The project is "${state.projectName}"`;

    const text = await this.execute(
      masterKnowledge,
      instructions,
      `Discovery answers from the product owner:\n\n${discoveryAnswers}\n\nGenerate the Illuminate Report.`,
    );

    return this.finalizePhase(projectPath, state, text);
  }

  /** Import Pre-RC research - skips Illuminate + Define, advances to Architect */
  async importPreRc(projectPath: string): Promise<AgentResult> {
    // Detect Pre-RC artifacts
    const detection = this.contextLoader.detectPreRcArtifacts(projectPath);

    if (!detection.found) {
      return {
        text: `Error: No Pre-RC research found at ${projectPath}/pre-rc-research/. Run the Pre-RC Method Agent first.`,
      };
    }

    if (!detection.prdPath) {
      return {
        text: 'Error: Pre-RC directory exists but no PRD markdown found (expected prd-*.md in pre-rc-research/).',
      };
    }

    if (!detection.isComplete) {
      return {
        text: 'Error: Pre-RC research is incomplete - Gate 3 has not been approved. Complete all Pre-RC gates before importing into RC Method.',
      };
    }

    // Create or load RC state
    let state: ProjectState;
    if (this.stateManager.exists(projectPath)) {
      state = this.stateManager.load(projectPath);
      // Allow re-import only if still in early phases
      if (state.currentPhase > 3) {
        return {
          text: `Error: Project is already in Phase ${state.currentPhase} (${PHASE_NAMES[state.currentPhase]}). Cannot re-import Pre-RC at this stage.`,
        };
      }
    } else {
      // Extract project name from the Pre-RC PRD filename
      const prdFilename = path.basename(detection.prdPath, '.md');
      const projectName = prdFilename.replace(/^prd-/, '').replace(/-/g, ' ');
      state = this.stateManager.create(projectPath, projectName);
    }

    // Run the bridge agent to convert 19-section -> 11-section
    const result = await this.preRcBridgeAgent.run(state, detection);

    // Record Pre-RC source in state
    state.preRcSource = {
      prdPath: detection.prdPath,
      statePath: detection.statePath ?? '',
      importedAt: new Date().toISOString().split('T')[0],
      artifactCount: detection.artifactPaths.length,
      personaCount: detection.artifactPaths.length,
    };

    // Mark phases 1 and 2 as imported (approved via Pre-RC gates)
    const today = new Date().toISOString().split('T')[0];
    state.gates[1] = { status: GateStatus.Approved, date: today, feedback: 'Imported from Pre-RC (Gate 3 approved)' };
    state.gates[2] = {
      status: GateStatus.Approved,
      date: today,
      feedback: 'Imported from Pre-RC (PRD converted via bridge)',
    };

    // Advance to Phase 3 (Architect)
    state.currentPhase = 3;

    this.stateManager.save(projectPath, state);
    audit(
      'artifact.create',
      'rc',
      projectPath,
      {
        source: 'pre-rc',
        artifactCount: detection.artifactPaths.length,
        prdPath: detection.prdPath,
      },
      'import',
    );

    const summary = `## Pre-RC Import Complete

### What happened:
- Detected Pre-RC research: ${detection.artifactPaths.length} artifacts, PRD at \`${detection.prdPath}\`
- Converted 19-section Pre-RC PRD -> 11-section RC Method PRD
- Saved to: \`${result.artifacts?.[0] ?? 'rc-method/prds/'}\`
- Marked Phase 1 (Illuminate) and Phase 2 (Define) as approved (imported)
- Advanced to **Phase 3 (Architect)**

### Next step:
\`\`\`
rc_architect("${projectPath}", "Your architecture notes here")
\`\`\`

### Converted PRD Preview:
${result.text.substring(0, 500)}...`;

    return {
      text: summary,
      artifacts: result.artifacts,
      gateReady: false, // No gate needed - phases 1-2 are auto-approved
    };
  }

  /** Run Define phase - PRD generation (Phase 2) */
  async define(projectPath: string, operatorInputs: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 2, 'rc_define');

    const result = await this.prdAgent.run(state, operatorInputs);

    return this.finalizePhase(projectPath, state, result.text, result.artifacts);
  }

  /** Run Architect phase (Phase 3) */
  async architect(projectPath: string, architectureNotes: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 3, 'rc_architect');

    const masterKnowledge = this.contextLoader.loadFile('skills/rc-master.md');

    // Load existing PRDs for context
    let prdContext = '';
    for (const artifact of state.artifacts.filter((a) => a.includes('/prds/'))) {
      try {
        const content = this.contextLoader.loadProjectFile(projectPath, artifact);
        prdContext += `\n\n--- ${artifact} ---\n\n${content}`;
      } catch {
        // skip missing files
      }
    }

    const hasUi = state.uxScore !== null && state.uxScore > 0;

    // Load selected design spec if available
    let designContext = '';
    if (state.selectedDesign?.specPath) {
      try {
        const content = this.contextLoader.loadProjectFile(projectPath, state.selectedDesign.specPath);
        designContext = `\n\nSelected Design Spec (Option ${state.selectedDesign.optionId}):\n${content}`;
      } catch {
        // skip if missing
      }
    }

    // Build tech stack context for the architect
    const stack = state.techStack;
    const stackContext = stack
      ? `\n\nSelected Tech Stack:\n- Language: ${stack.language}\n- Framework: ${stack.framework}${stack.uiFramework ? `\n- UI Framework: ${stack.uiFramework}` : ''}\n- Database: ${stack.database}${stack.orm ? `\n- ORM: ${stack.orm}` : ''}`
      : '';

    const instructions = `You are the RC Method orchestrator in Phase 3: Architect. Define how the project gets built - tech stack, data model, architecture.\n\nRules:\n${stack ? `- Use the selected tech stack (${stack.language}/${stack.framework}) — do NOT override with a different stack` : '- Recommend tech stack with business justification'}\n- Define data model and key integrations\n${hasUi ? '- Include UX architecture: design token strategy, component library approach, theme system' : ''}${designContext ? '\n- Use the selected design spec for colors, typography, spacing, and layout decisions' : ''}\n- Write in plain business language\n- The project is "${state.projectName}"`;

    const text = await this.execute(
      masterKnowledge,
      instructions,
      `Architecture inputs from the operator:\n\n${architectureNotes}${stackContext}\n\nExisting PRDs:\n${prdContext}${designContext}\n\nDefine the architecture.`,
    );

    return this.finalizePhase(projectPath, state, text);
  }

  /** Run Sequence phase - task generation (Phase 4) */
  async sequence(projectPath: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 4, 'rc_sequence');

    const result = await this.taskAgent.run(state);

    return this.finalizePhase(projectPath, state, result.text, result.artifacts);
  }

  /** Run Validate phase - quality gate (Phase 5) */
  async validate(projectPath: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 5, 'rc_validate');

    const result = await this.qualityAgent.run(state);

    return this.finalizePhase(projectPath, state, result.text);
  }

  /** Run Connect phase - integration wiring (Phase 7) */
  async connect(projectPath: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 7, 'rc_connect');

    const result = await this.connectAgent.run(state);

    return this.finalizePhase(projectPath, state, result.text);
  }

  /** Run Compound phase - production hardening (Phase 8) */
  async compound(projectPath: string, codeContext?: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 8, 'rc_compound');

    const result = await this.compoundAgent.run(state, codeContext);

    return this.finalizePhase(projectPath, state, result.text);
  }

  /** Execute a specific task during Forge phase (Phase 6) -- generates actual code files */
  async forgeTask(projectPath: string, taskId: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    this.enforcePhase(state, 6, 'rc_forge_task');

    // Initialize forgeTasks tracking if missing
    if (!state.forgeTasks) state.forgeTasks = {};

    // Prevent duplicate execution without explicit intent
    const existing = state.forgeTasks[taskId];
    if (existing?.status === 'complete') {
      return {
        text: `Task ${taskId} is already complete.\n\nGenerated files:\n${(existing.generatedFiles ?? []).map((f) => `  - ${f}`).join('\n')}\n\nTo re-run, change the task status to "pending" via rc_save or state edit.`,
      };
    }

    // Mark task as in-progress
    state.forgeTasks[taskId] = {
      taskId,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    };
    this.stateManager.save(projectPath, state);

    // Load only relevant context: PRDs + task lists + type/interface files from forge
    // This avoids O(N²) growth where task N loads all N-1 previous forge outputs
    let context = '';
    for (const artifact of state.artifacts) {
      const isForgeArtifact = artifact.includes('/forge/');
      if (isForgeArtifact) {
        // Only load type definitions, interfaces, and schema files from other forge tasks
        const isContractFile =
          artifact.endsWith('.d.ts') ||
          artifact.includes('/types') ||
          artifact.includes('/schema') ||
          artifact.includes('/interfaces') ||
          artifact.includes('/contracts');
        if (!isContractFile) continue;
      }
      try {
        const content = this.contextLoader.loadProjectFile(projectPath, artifact);
        context += `\n\n--- ${artifact} ---\n\n${content}`;
      } catch {
        // skip missing files
      }
    }

    // Load selected design spec for UI tasks
    let designTokens = '';
    if (state.selectedDesign?.specPath) {
      try {
        const specContent = this.contextLoader.loadProjectFile(projectPath, state.selectedDesign.specPath);
        designTokens = `\n\nDesign System (selected option ${state.selectedDesign.optionId}):\n${specContent}`;
      } catch {
        // skip if missing
      }
    }

    const masterKnowledge = this.contextLoader.loadFile('skills/rc-master.md');
    const testScriptKnowledge = this.contextLoader.loadFile('skills/rc-test-scripts.md');

    // Load stack-specific knowledge if available
    const stack = state.techStack;
    let stackKnowledge = '';
    if (stack) {
      try {
        stackKnowledge = this.contextLoader.loadFile(`skills/stacks/stack-${stack.language}-${stack.framework}.md`);
      } catch {
        // Stack knowledge file not yet created — forge will rely on architecture doc
      }
    }

    const stackInstructions = stack
      ? `\n- Generate code in ${stack.language} using the ${stack.framework} framework${stack.uiFramework ? ` with ${stack.uiFramework} for UI` : ''}${stack.orm ? `\n- Use ${stack.orm} for database access (${stack.database})` : `\n- Use ${stack.database} for the database`}`
      : '';

    const instructions = `You are the RC Method orchestrator in Step 6: Build. You generate ACTUAL implementation code for the requested task.

OUTPUT FORMAT: For each file you generate, use this exact format:

===FILE: path/to/file.ext===
<file contents>
===END_FILE===

Generate ALL files needed for this task. Include:
- Implementation files (components, APIs, utils, etc.)
- Test files alongside each implementation file
- Any configuration or type definition files needed

Rules:
- Follow the approved task list exactly
- Reference the active PRD for context and requirements
- Generate complete, runnable code -- not pseudocode or guidance
- Use the tech stack and patterns from the architecture document${stackInstructions}
- If the task is a [UI] task, apply rc-ux-core.md core rules${designTokens ? '\n- For UI tasks, use the design tokens (colors, typography, spacing) from the selected design spec below' : ''}
- If the task is a [UI], [API], or [INTEGRATION] task, generate a test file with the implementation
- If scope questions arise, STOP and flag them -- do NOT guess
- Every generated file must be self-contained and importable
- The project is "${state.projectName}"
${stackKnowledge ? `\nStack-Specific Patterns:\n${stackKnowledge}` : ''}
Test Script Knowledge:
${testScriptKnowledge}`;

    const text = await this.execute(
      masterKnowledge,
      instructions,
      `Execute task ${taskId}. Generate the actual code files.\n\nProject artifacts:\n${context}${designTokens}`,
    );

    // Parse generated files from the response and write them to disk
    const generatedFiles = this.extractAndWriteFiles(projectPath, taskId, text);

    // Mark task as complete and register forge artifacts in state
    state.forgeTasks[taskId] = {
      taskId,
      status: 'complete',
      startedAt: state.forgeTasks[taskId]?.startedAt,
      completedAt: new Date().toISOString(),
      generatedFiles,
    };
    const forgeArtifactPaths = generatedFiles.map((f) => `rc-method/forge/${taskId}/${f}`);
    for (const artifactPath of forgeArtifactPaths) {
      if (!state.artifacts.includes(artifactPath)) {
        state.artifacts.push(artifactPath);
      }
    }
    this.stateManager.save(projectPath, state);
    audit('task.complete', 'rc', projectPath, { taskId, filesGenerated: generatedFiles.length }, 'forge');

    // Build output summary
    const filesSummary =
      generatedFiles.length > 0
        ? `\n\n### Generated Files (${generatedFiles.length})\n\n${generatedFiles.map((f) => `- \`${f}\``).join('\n')}\n\nFiles written to \`rc-method/forge/${taskId}/\`. Review and integrate into your project.`
        : '\n\n*No file blocks detected in output. The response contains implementation guidance -- use it to write the code manually or re-run the task.*';

    // Task completion stats
    const totalTasks = Object.keys(state.forgeTasks).length;
    const completedTasks = Object.values(state.forgeTasks).filter((t) => t.status === 'complete').length;

    return {
      text: `## Forge: ${taskId} -- Complete\n\nProgress: ${completedTasks}/${totalTasks} tasks executed${filesSummary}\n\n---\n\n${text}`,
      artifacts: generatedFiles.map((f) => `rc-method/forge/${taskId}/${f}`),
    };
  }

  /**
   * Extract ===FILE: path=== ... ===END_FILE=== blocks from LLM output
   * and write them to rc-method/forge/<taskId>/<path>.
   */
  private extractAndWriteFiles(projectPath: string, taskId: string, text: string): string[] {
    const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
    const writtenFiles: string[] = [];
    let match;

    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];

      // Sanitize: prevent path traversal
      const sanitized = filePath.replace(/\.\.\//g, '').replace(/^\//g, '');
      if (!sanitized) continue;

      const fullDir = path.join(projectPath, 'rc-method', 'forge', taskId, path.dirname(sanitized));
      fs.mkdirSync(fullDir, { recursive: true });

      const fullPath = path.join(projectPath, 'rc-method', 'forge', taskId, sanitized);
      fs.writeFileSync(fullPath, content, 'utf-8');
      writtenFiles.push(sanitized);
    }

    return writtenFiles;
  }

  /** Process a gate decision - pure state manipulation, no LLM needed */
  async gate(projectPath: string, decision: string, feedback?: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    const result = await this.gateAgent.processDecision(state, decision, feedback);
    this.stateManager.save(projectPath, state);
    const normalized = decision.toLowerCase().trim();
    const gateAction = normalized.startsWith('approve')
      ? ('gate.approve' as const)
      : normalized.startsWith('reject')
        ? ('gate.reject' as const)
        : ('gate.question' as const);
    audit(gateAction, 'rc', projectPath, { phase: state.currentPhase, feedback }, `gate-${state.currentPhase}`);
    recordGateOutcome({
      projectId: projectPath,
      projectName: state.projectName,
      domain: 'rc',
      phase: PHASE_NAMES[state.currentPhase],
      gateNumber: state.currentPhase,
      decision: normalized.startsWith('approve')
        ? 'approved'
        : normalized.startsWith('reject')
          ? 'rejected'
          : 'question',
      feedback: feedback,
    });
    return result;
  }

  /** Get current project status - pure state read, no LLM needed */
  status(projectPath: string): AgentResult {
    const state = this.stateManager.load(projectPath);

    const phaseLines = [];
    for (let i = 1; i <= 8; i++) {
      const phase = i as Phase;
      const gate = state.gates[phase];
      let icon = '[ ]';
      if (gate?.status === GateStatus.Approved) icon = '[x]';
      else if (phase === state.currentPhase) icon = '[>]';
      phaseLines.push(`  ${i}. ${PHASE_NAMES[phase].padEnd(12)} ${icon}`);
    }

    const approvedCount = Object.values(state.gates).filter((g) => g?.status === GateStatus.Approved).length;

    // Forge task progress
    let forgeSection = '';
    if (state.forgeTasks && Object.keys(state.forgeTasks).length > 0) {
      const tasks = Object.values(state.forgeTasks);
      const completed = tasks.filter((t) => t.status === 'complete').length;
      const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
      const failed = tasks.filter((t) => t.status === 'failed').length;
      const totalFiles = tasks.reduce((sum, t) => sum + (t.generatedFiles?.length ?? 0), 0);
      forgeSection = `\nForge Tasks: ${completed} complete, ${inProgress} in progress, ${failed} failed (of ${tasks.length})`;
      forgeSection += `\nForge Files: ${totalFiles} generated`;
    }

    const text = `===================================================
RC METHOD STATUS
===================================================
Project: ${state.projectName}
Current Phase: ${state.currentPhase} - ${PHASE_NAMES[state.currentPhase]}
Gate Status: ${state.gates[state.currentPhase]?.status ?? 'pending'}

Phase Progress:
${phaseLines.join('\n')}

PRDs: ${state.artifacts.filter((a) => a.includes('/prds/')).length}
Tasks: ${state.artifacts.filter((a) => a.includes('/tasks/')).length} list(s)
Gates Passed: ${approvedCount} of ${GATED_PHASES.length}
UX Score: ${state.uxScore ?? 'not scored'}
UX Mode: ${state.uxMode ?? 'not set'}
Tech Stack: ${state.techStack ? `${state.techStack.language}/${state.techStack.framework}` : 'not set'}${forgeSection}
${tokenTracker.getDomainSummary('rc')}${formatCostSummary()}${getLearningSummary()}${formatRecentActivity(projectPath)}
===================================================`;

    return { text };
  }

  /** UX scoring */
  async uxScore(featureList: string): Promise<AgentResult> {
    return this.uxAgent.score(featureList);
  }

  /** UX audit */
  async uxAudit(codeOrDescription: string, taskType: string): Promise<AgentResult> {
    return this.uxAgent.audit(codeOrDescription, taskType);
  }

  /** UX child PRD generation */
  async uxGenerate(projectPath: string, screensDescription: string): Promise<AgentResult> {
    const state = this.stateManager.load(projectPath);
    const result = await this.uxAgent.generate(state, screensDescription);
    this.stateManager.save(projectPath, state);
    return result;
  }

  /** Generate design options with wireframes */
  async designGenerate(input: DesignInput): Promise<AgentResult> {
    const state = this.stateManager.load(input.projectPath);
    const result = await this.designAgent.generate(state, input);
    this.stateManager.save(input.projectPath, state);
    return result;
  }

  /** Save the user's selected design option */
  designSelect(projectPath: string, optionId: string, specPath: string): AgentResult {
    const state = this.stateManager.load(projectPath);
    state.selectedDesign = {
      optionId,
      specPath,
      selectedAt: new Date().toISOString(),
    };
    this.stateManager.save(projectPath, state);
    return { text: `Design option ${optionId} selected and saved.` };
  }

  /** Save an artifact generated by the host IDE (used in passthrough mode) */
  saveArtifact(projectPath: string, artifactType: 'prd' | 'prd-ux' | 'tasks', content: string): AgentResult {
    const state = this.stateManager.load(projectPath);
    const sanitizedName = state.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    let filename: string;
    let dir: string;

    switch (artifactType) {
      case 'prd':
        filename = `PRD-${sanitizedName}-master.md`;
        dir = 'prds';
        break;
      case 'prd-ux':
        filename = `PRD-${sanitizedName}-ux.md`;
        dir = 'prds';
        break;
      case 'tasks':
        filename = `TASKS-${sanitizedName}-master.md`;
        dir = 'tasks';
        break;
    }

    const filePath = path.join(projectPath, 'rc-method', dir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    const artifactRef = `rc-method/${dir}/${filename}`;
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    this.stateManager.save(projectPath, state);
    audit('artifact.create', 'rc', projectPath, { type: artifactType, path: artifactRef });

    return {
      text: `Artifact saved: ${artifactRef}`,
      artifacts: [artifactRef],
    };
  }

  /** Reset project state — deletes checkpoint and markdown, allowing a fresh rc_start */
  reset(projectPath: string): AgentResult {
    // Delete RC checkpoint from SQLite
    try {
      const { store, pipelineId } = getProjectStore(projectPath);
      store.deleteNode(pipelineId, NODE_IDS.RC_STATE);
      store.deleteNode(pipelineId, NODE_IDS.RC_INTERRUPT);
    } catch {
      // Checkpoint may not exist yet — that's fine
    }

    // Delete markdown state file
    const stateFile = path.join(projectPath, 'rc-method', 'state', 'RC-STATE.md');
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }

    audit('project.reset', 'rc', projectPath, {});

    return {
      text: `RC Method state reset for ${projectPath}. You can now run rc_start to begin a fresh project.`,
    };
  }

  /** Enforce that the project is in the expected phase */
  private enforcePhase(state: ProjectState, expectedPhase: Phase, toolName: string): void {
    if (state.currentPhase !== expectedPhase) {
      throw new Error(
        `${toolName} requires Phase ${expectedPhase} (${PHASE_NAMES[expectedPhase]}), but project is in Phase ${state.currentPhase} (${PHASE_NAMES[state.currentPhase]}). Use rc_status to check progress.`,
      );
    }
  }
}
