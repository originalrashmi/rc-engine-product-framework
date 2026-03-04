/**
 * Thin PluginRegistry wrapper for user plugin management.
 *
 * Loads plugins from .rc-engine/plugins/ (project) and ~/.rc-engine/plugins/ (global).
 */

import { getPluginRegistry } from '../core/plugins/registry.js';

/** Load plugins for a project. Returns count loaded. Never throws. */
export async function loadPlugins(projectPath: string): Promise<number> {
  try {
    return await getPluginRegistry().loadForProject(projectPath);
  } catch {
    return 0;
  }
}

/** Get plugin summary for status display. Returns '' if no plugins loaded. */
export function getPluginSummary(): string {
  try {
    const s = getPluginRegistry().getSummary();
    if (s.loaded === 0) return '';
    return `\n  PLUGINS:
    Loaded: ${s.loaded}${s.errors > 0 ? ` (${s.errors} errors)` : ''}
    Custom personas: ${s.personas}
    Security rules: ${s.securityRules}
    Gate criteria: ${s.gateCriteria}
    Hooks: ${s.hooks}`;
  } catch {
    return '';
  }
}
