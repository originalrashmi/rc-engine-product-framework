/**
 * Thin wrapper for deployment readiness checks and CI/CD generation.
 *
 * Pure functions - no singletons needed.
 */

import { checkDeployReadiness, formatReadinessReport } from '../core/deployment/readiness.js';
import type { ReadinessReport } from '../core/deployment/readiness.js';
import { generateConfigs, writeConfigs } from '../core/deployment/ci-generator.js';
import type { DeployTarget, GeneratedConfig } from '../core/deployment/ci-generator.js';

/** Run deployment readiness check. Returns null on error. */
export function checkReadiness(projectPath: string): ReadinessReport | null {
  try {
    return checkDeployReadiness(projectPath);
  } catch {
    return null;
  }
}

/** Format readiness report as markdown. Returns '' on error. */
export function formatReadiness(report: ReadinessReport): string {
  try {
    return formatReadinessReport(report);
  } catch {
    return '';
  }
}

/** Generate CI/CD configs for deployment targets. Returns [] on error. */
export function generateCiConfigs(projectPath: string, targets: DeployTarget[]): GeneratedConfig[] {
  try {
    return generateConfigs(projectPath, targets);
  } catch {
    return [];
  }
}

/** Write CI/CD configs to disk. Returns empty result on error. */
export function writeCiConfigs(
  projectPath: string,
  configs: GeneratedConfig[],
  overwrite?: boolean,
): { written: string[]; skipped: string[] } {
  try {
    return writeConfigs(projectPath, configs, overwrite);
  } catch {
    return { written: [], skipped: [] };
  }
}
