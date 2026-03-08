/**
 * Plugin Registry - Load, manage, and invoke RC Engine plugins.
 *
 * Plugins are loaded from:
 * 1. Project-local: .rc-engine/plugins/ directory
 * 2. Global: ~/.rc-engine/plugins/ directory
 * 3. Programmatic: registered via API
 *
 * Plugins are simple objects implementing the RcPlugin interface.
 * JSON plugin files (.json) define declarative plugins (personas, security rules).
 * JS/TS plugin files (.js) can export full RcPlugin objects with hooks.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  RcPlugin,
  PluginManifest,
  CustomPersona,
  CustomSecurityRule,
  CustomGateCriterion,
  GateCriterionContext,
  GateCriterionResult,
  PhaseEvent,
  GateEvent,
  ScanEvent,
  ProjectEvent,
} from './types.js';
import type { Finding } from '../../domains/post-rc/types.js';

// ── Registry ────────────────────────────────────────────────────────────────

export class PluginRegistry {
  private plugins: Map<string, RcPlugin> = new Map();
  private loadErrors: Array<{ path: string; error: string }> = [];

  /**
   * Register a plugin programmatically.
   */
  async register(plugin: RcPlugin): Promise<boolean> {
    const { id } = plugin.manifest;

    if (this.plugins.has(id)) {
      console.error(`[plugins] Plugin "${id}" already registered, skipping duplicate`);
      return false;
    }

    // Initialize if the plugin has an init hook
    if (plugin.initialize) {
      try {
        const ok = await plugin.initialize();
        if (ok === false) {
          console.error(`[plugins] Plugin "${id}" initialization returned false, not loading`);
          return false;
        }
      } catch (err) {
        console.error(`[plugins] Plugin "${id}" initialization failed:`, err);
        return false;
      }
    }

    this.plugins.set(id, plugin);
    return true;
  }

  /**
   * Unregister a plugin.
   */
  async unregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (plugin?.destroy) {
      try {
        await plugin.destroy();
      } catch (err) {
        console.error(`[plugins] Plugin "${id}" destroy failed:`, err);
      }
    }
    this.plugins.delete(id);
  }

  /**
   * Load JSON plugin files from a directory.
   * JSON plugins define declarative extensions (personas, security rules).
   */
  async loadFromDirectory(dir: string): Promise<number> {
    if (!fs.existsSync(dir)) return 0;

    let loaded = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;

      const filePath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as Partial<RcPlugin> & { manifest?: PluginManifest };

        if (!data.manifest?.id || !data.manifest?.name) {
          this.loadErrors.push({ path: filePath, error: 'Missing manifest.id or manifest.name' });
          continue;
        }

        // Reconstruct RegExp objects from serialized patterns
        if (data.securityRules) {
          for (const rule of data.securityRules) {
            if (typeof rule.pattern === 'string') {
              rule.pattern = new RegExp(rule.pattern, 'gi');
            }
          }
        }

        const plugin: RcPlugin = {
          manifest: {
            ...data.manifest,
            capabilities: data.manifest.capabilities ?? [],
            version: data.manifest.version ?? '1.0.0',
            description: data.manifest.description ?? '',
          },
          personas: data.personas,
          securityRules: data.securityRules as CustomSecurityRule[] | undefined,
          gateCriteria: data.gateCriteria,
        };

        const ok = await this.register(plugin);
        if (ok) loaded++;
      } catch (err) {
        this.loadErrors.push({ path: filePath, error: (err as Error).message });
      }
    }

    return loaded;
  }

  /**
   * Load plugins from standard locations for a project.
   */
  async loadForProject(projectPath: string): Promise<number> {
    let total = 0;

    // Project-local plugins
    const localDir = path.join(projectPath, '.rc-engine', 'plugins');
    total += await this.loadFromDirectory(localDir);

    // Global plugins
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const globalDir = path.join(home, '.rc-engine', 'plugins');
    total += await this.loadFromDirectory(globalDir);

    if (total > 0) {
      console.error(`[plugins] Loaded ${total} plugin(s)`);
    }

    return total;
  }

  // ── Aggregated Extension Points ─────────────────────────────────────

  /** Get all custom personas from all loaded plugins. */
  getCustomPersonas(): CustomPersona[] {
    const personas: CustomPersona[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.personas) {
        personas.push(...plugin.personas);
      }
    }
    return personas;
  }

  /** Get all custom security rules from all loaded plugins. */
  getCustomSecurityRules(): CustomSecurityRule[] {
    const rules: CustomSecurityRule[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.securityRules) {
        rules.push(...plugin.securityRules);
      }
    }
    return rules;
  }

  /** Get all custom gate criteria from all loaded plugins. */
  getCustomGateCriteria(domain: string, gateNumber: number): CustomGateCriterion[] {
    const criteria: CustomGateCriterion[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.gateCriteria) {
        for (const c of plugin.gateCriteria) {
          if (c.domain === domain && (!c.gates || c.gates.length === 0 || c.gates.includes(gateNumber))) {
            criteria.push(c);
          }
        }
      }
    }
    return criteria;
  }

  /**
   * Evaluate all custom gate criteria for a given context.
   * Returns failed criteria (empty array = all passed).
   */
  async evaluateGateCriteria(context: GateCriterionContext): Promise<GateCriterionResult[]> {
    const criteria = this.getCustomGateCriteria(context.domain, context.gateNumber);
    const failures: GateCriterionResult[] = [];

    for (const criterion of criteria) {
      try {
        const result = await criterion.evaluate(context);
        if (!result.passed) {
          failures.push(result);
        }
      } catch (err) {
        failures.push({
          passed: false,
          reason: `Gate criterion "${criterion.id}" threw: ${(err as Error).message}`,
          overridable: true,
        });
      }
    }

    return failures;
  }

  // ── Lifecycle Hook Dispatch ─────────────────────────────────────────

  /** Fire onBeforePhase hooks. Returns false if any hook blocks execution. */
  async fireBeforePhase(event: PhaseEvent): Promise<boolean> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onBeforePhase) {
        try {
          const result = await plugin.hooks.onBeforePhase(event);
          if (result === false) {
            console.error(`[plugins] Plugin "${plugin.manifest.id}" blocked phase ${event.phase}`);
            return false;
          }
        } catch (err) {
          console.error(`[plugins] onBeforePhase error in "${plugin.manifest.id}":`, err);
        }
      }
    }
    return true;
  }

  /** Fire onAfterPhase hooks. */
  async fireAfterPhase(event: PhaseEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onAfterPhase) {
        try {
          await plugin.hooks.onAfterPhase(event);
        } catch (err) {
          console.error(`[plugins] onAfterPhase error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  /** Fire onAfterGate hooks. */
  async fireAfterGate(event: GateEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onAfterGate) {
        try {
          await plugin.hooks.onAfterGate(event);
        } catch (err) {
          console.error(`[plugins] onAfterGate error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  /** Fire onFinding hooks for each finding. */
  async fireOnFinding(finding: Finding): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onFinding) {
        try {
          await plugin.hooks.onFinding(finding);
        } catch (err) {
          console.error(`[plugins] onFinding error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  /** Fire onScanComplete hooks. */
  async fireOnScanComplete(event: ScanEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onScanComplete) {
        try {
          await plugin.hooks.onScanComplete(event);
        } catch (err) {
          console.error(`[plugins] onScanComplete error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  /** Fire onProjectCreate hooks. */
  async fireOnProjectCreate(event: ProjectEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onProjectCreate) {
        try {
          await plugin.hooks.onProjectCreate(event);
        } catch (err) {
          console.error(`[plugins] onProjectCreate error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  /** Fire onProjectOutcome hooks. */
  async fireOnProjectOutcome(event: ProjectEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.onProjectOutcome) {
        try {
          await plugin.hooks.onProjectOutcome(event);
        } catch (err) {
          console.error(`[plugins] onProjectOutcome error in "${plugin.manifest.id}":`, err);
        }
      }
    }
  }

  // ── Status ──────────────────────────────────────────────────────────

  /** Get all loaded plugins. */
  getLoadedPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest);
  }

  /** Get plugin load errors. */
  getLoadErrors(): Array<{ path: string; error: string }> {
    return [...this.loadErrors];
  }

  /** Get summary for status displays. */
  getSummary(): {
    loaded: number;
    errors: number;
    personas: number;
    securityRules: number;
    gateCriteria: number;
    hooks: number;
  } {
    let hookCount = 0;
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks) {
        hookCount += Object.values(plugin.hooks).filter((h) => typeof h === 'function').length;
      }
    }

    return {
      loaded: this.plugins.size,
      errors: this.loadErrors.length,
      personas: this.getCustomPersonas().length,
      securityRules: this.getCustomSecurityRules().length,
      gateCriteria: Array.from(this.plugins.values()).reduce((sum, p) => sum + (p.gateCriteria?.length ?? 0), 0),
      hooks: hookCount,
    };
  }
}

/** Shared singleton registry. */
let _registry: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (!_registry) {
    _registry = new PluginRegistry();
  }
  return _registry;
}
