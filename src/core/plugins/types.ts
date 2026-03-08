/**
 * Plugin System Types - Interface contracts for RC Engine extensions.
 *
 * Plugins can extend:
 * - Personas (custom research specialists)
 * - Security rules (industry-specific patterns)
 * - Report templates (custom output formats)
 * - Gate criteria (custom approval requirements)
 * - Lifecycle hooks (before/after phase events)
 */

import type { Finding } from '../../domains/post-rc/types.js';

// ── Plugin Manifest ─────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Unique plugin identifier (npm package name or custom ID). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semantic version. */
  version: string;
  /** Short description. */
  description: string;
  /** Plugin author. */
  author?: string;
  /** Which capabilities this plugin provides. */
  capabilities: PluginCapability[];
}

export type PluginCapability = 'personas' | 'security-rules' | 'report-templates' | 'gate-criteria' | 'lifecycle-hooks';

// ── Plugin Interface ────────────────────────────────────────────────────────

export interface RcPlugin {
  /** Plugin metadata. */
  manifest: PluginManifest;

  /** Called once when the plugin is loaded. Return false to abort loading. */
  initialize?(): Promise<boolean> | boolean;

  /** Called when the plugin is unloaded. */
  destroy?(): Promise<void> | void;

  // ── Extension Points ────────────────────────────────────────────────

  /** Custom persona definitions for Pre-RC research. */
  personas?: CustomPersona[];

  /** Custom static security patterns for Post-RC scanning. */
  securityRules?: CustomSecurityRule[];

  /** Custom gate criteria applied at checkpoints. */
  gateCriteria?: CustomGateCriterion[];

  /** Lifecycle hooks fired at pipeline events. */
  hooks?: LifecycleHooks;
}

// ── Custom Personas ─────────────────────────────────────────────────────────

export interface CustomPersona {
  /** Unique persona ID (must not collide with built-in IDs). */
  id: string;
  /** Display name. */
  name: string;
  /** Which research stage this persona runs in. */
  stage: string;
  /** LLM provider preference. */
  llmProvider?: string;
  /** Token budget for this persona. */
  tokenBudget?: number;
  /** System prompt / instructions for this persona. */
  systemPrompt: string;
  /** Inline knowledge (replaces knowledge file). */
  knowledge?: string;
  /** When to activate (if omitted, always activates). */
  activationKeywords?: string[];
}

// ── Custom Security Rules ───────────────────────────────────────────────────

export interface CustomSecurityRule {
  /** Unique rule ID (e.g., "HIPAA-001"). */
  id: string;
  /** Pattern to match in code. */
  pattern: RegExp;
  /** Finding title. */
  title: string;
  /** Severity: critical, high, medium, low. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** CWE ID if applicable. */
  cweId?: string;
  /** Category for grouping. */
  category: string;
  /** Remediation guidance. */
  remediation: string;
}

// ── Custom Gate Criteria ────────────────────────────────────────────────────

export interface CustomGateCriterion {
  /** Unique criterion ID. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Which domain this applies to. */
  domain: 'pre-rc' | 'rc' | 'post-rc';
  /** Which gate number(s) this applies to. Empty = all gates. */
  gates?: number[];
  /**
   * Evaluate whether this criterion passes.
   * Receives the phase output and returns pass/fail with a reason.
   */
  evaluate(context: GateCriterionContext): Promise<GateCriterionResult> | GateCriterionResult;
}

export interface GateCriterionContext {
  domain: string;
  phase: string;
  gateNumber: number;
  phaseOutput: string;
  projectPath: string;
}

export interface GateCriterionResult {
  passed: boolean;
  reason: string;
  /** If not passed, can this be overridden? */
  overridable?: boolean;
}

// ── Lifecycle Hooks ─────────────────────────────────────────────────────────

export interface LifecycleHooks {
  /** Fired before a phase begins. Return false to block execution. */
  onBeforePhase?(event: PhaseEvent): Promise<boolean | void> | boolean | void;
  /** Fired after a phase completes. */
  onAfterPhase?(event: PhaseEvent): Promise<void> | void;
  /** Fired after a gate decision. */
  onAfterGate?(event: GateEvent): Promise<void> | void;
  /** Fired when a security finding is detected. */
  onFinding?(finding: Finding): Promise<void> | void;
  /** Fired when a scan completes. */
  onScanComplete?(event: ScanEvent): Promise<void> | void;
  /** Fired when a project is created. */
  onProjectCreate?(event: ProjectEvent): Promise<void> | void;
  /** Fired when a project outcome changes (shipped/abandoned). */
  onProjectOutcome?(event: ProjectEvent): Promise<void> | void;
}

export interface PhaseEvent {
  domain: string;
  phase: string;
  projectPath: string;
  projectName: string;
  timestamp: string;
}

export interface GateEvent {
  domain: string;
  phase: string;
  gateNumber: number;
  decision: 'approved' | 'rejected' | 'question';
  feedback?: string;
  projectPath: string;
  projectName: string;
  timestamp: string;
}

export interface ScanEvent {
  projectPath: string;
  scanId: string;
  findingsCount: number;
  criticalCount: number;
  gateDecision: string;
  timestamp: string;
}

export interface ProjectEvent {
  projectPath: string;
  projectName: string;
  outcome?: string;
  timestamp: string;
}
