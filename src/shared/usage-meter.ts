/**
 * Thin UsageMeter wrapper for SaaS usage tracking.
 *
 * Tracks per-user project consumption for billing and feature gating.
 */

import { UsageMeter } from '../core/pricing/meter.js';

let _meter: UsageMeter | null = null;

export function getUsageMeter(): UsageMeter {
  if (!_meter) {
    _meter = new UsageMeter();
  }
  return _meter;
}

/** Record a tool call for usage tracking. Never throws. */
export function recordToolCall(userId: string, projectId: string, costUsd: number = 0): void {
  try {
    getUsageMeter().recordToolCall(userId, projectId, costUsd);
  } catch {
    // silent
  }
}

/** Record a new project for usage tracking. Never throws. */
export function recordProjectUsage(userId: string, projectId: string, projectName: string): void {
  try {
    getUsageMeter().recordProject(userId, projectId, projectName);
  } catch {
    // silent
  }
}
