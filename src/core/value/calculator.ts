/**
 * Value Calculator -- Quantifies the human-equivalent value of an RC Engine pipeline run.
 *
 * Computes: roles replaced, hours saved, cost savings, speed multiplier, team equivalence.
 * Designed for non-technical users to understand exactly what RC Engine does for them.
 */

import type { RoleSummary } from './role-registry.js';
import { getRoleRegistry } from './role-registry.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValueReport {
  projectName: string;

  // What RC Engine did
  aiCostUsd: number;
  aiDurationMinutes: number;
  pipelineDurationMinutes: number;

  // What humans would have cost
  rolesReplaced: RoleSummary[];
  totalHumanHours: number;
  totalHumanCostUsd: number;
  totalHumanWeeks: number;

  // The comparison
  costSavingsUsd: number;
  costSavingsPercent: number;
  timeSavingsHours: number;
  speedMultiplier: number;

  // Team equivalent
  equivalentTeamSize: number;
  equivalentTeamMonths: number;
  annualSavingsUsd: number;

  // Breakdown by category
  byCategory: Record<string, { roles: number; hours: number; costUsd: number }>;
}

export interface ValueInput {
  projectName: string;

  /** Persona IDs that were activated during Pre-RC. */
  activatedPersonas?: string[];
  /** RC phases that were completed. */
  completedPhases?: string[];
  /** Number of forge tasks completed. */
  forgeTaskCount?: number;
  /** Post-RC tools that were run. */
  postRcTools?: string[];

  /** Actual AI cost from CostTracker (USD). */
  aiCostUsd?: number;
  /** Actual AI processing duration in minutes. */
  aiDurationMinutes?: number;
  /** Total elapsed time including user review, in minutes. */
  pipelineDurationMinutes?: number;

  /** Projects per year for annual projection. Default: 12. */
  projectsPerYear?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export class ValueCalculator {
  private registry = getRoleRegistry();

  /**
   * Calculate the full value report for a pipeline run.
   */
  calculate(input: ValueInput): ValueReport {
    const rolesReplaced: RoleSummary[] = [];

    // 1. Map activated personas to roles
    if (input.activatedPersonas) {
      for (const personaId of input.activatedPersonas) {
        const role = this.registry.getPersonaRole(personaId);
        if (role && role.estimatedHours > 0) {
          rolesReplaced.push({
            ...role,
            pipelineKey: personaId,
            totalCostUsd: role.hourlyRateUsd * role.estimatedHours,
          });
        }
      }
    }

    // 2. Map completed phases to roles
    if (input.completedPhases) {
      for (const phase of input.completedPhases) {
        const role = this.registry.getPhaseRole(phase);
        if (role) {
          // Forge phase: multiply by task count
          if (phase.toLowerCase() === 'forge' && input.forgeTaskCount && input.forgeTaskCount > 1) {
            rolesReplaced.push({
              ...role,
              pipelineKey: phase,
              estimatedHours: role.estimatedHours * input.forgeTaskCount,
              totalCostUsd: role.hourlyRateUsd * role.estimatedHours * input.forgeTaskCount,
            });
          } else {
            rolesReplaced.push({
              ...role,
              pipelineKey: phase,
              totalCostUsd: role.hourlyRateUsd * role.estimatedHours,
            });
          }
        }
      }
    }

    // 3. Map Post-RC tools to roles
    if (input.postRcTools) {
      for (const tool of input.postRcTools) {
        const role = this.registry.getPostRcRole(tool);
        if (role) {
          rolesReplaced.push({
            ...role,
            pipelineKey: tool,
            totalCostUsd: role.hourlyRateUsd * role.estimatedHours,
          });
        }
      }
    }

    // 4. Compute totals
    const totalHumanHours = rolesReplaced.reduce((sum, r) => sum + r.estimatedHours, 0);
    const totalHumanCostUsd = rolesReplaced.reduce((sum, r) => sum + r.totalCostUsd, 0);
    const totalHumanWeeks = totalHumanHours / 40;

    const aiCostUsd = input.aiCostUsd ?? 0;
    const aiDurationMinutes = input.aiDurationMinutes ?? 0;
    const pipelineDurationMinutes = input.pipelineDurationMinutes ?? aiDurationMinutes;
    const aiDurationHours = aiDurationMinutes / 60;

    // 5. Compute savings
    const costSavingsUsd = totalHumanCostUsd - aiCostUsd;
    const costSavingsPercent = totalHumanCostUsd > 0 ? (costSavingsUsd / totalHumanCostUsd) * 100 : 0;
    const timeSavingsHours = totalHumanHours - aiDurationHours;
    const speedMultiplier =
      aiDurationHours > 0 ? Math.round(totalHumanHours / aiDurationHours) : totalHumanHours > 0 ? Infinity : 0;

    // 6. Team equivalence
    const uniqueCategories = new Set(rolesReplaced.map((r) => r.category));
    const equivalentTeamSize = rolesReplaced.length;
    const equivalentTeamMonths = totalHumanHours / 160; // 160 hours per month

    // 7. Annual projection
    const projectsPerYear = input.projectsPerYear ?? 12;
    const annualSavingsUsd = costSavingsUsd * projectsPerYear;

    // 8. Category breakdown
    const byCategory: Record<string, { roles: number; hours: number; costUsd: number }> = {};
    for (const cat of uniqueCategories) {
      const catRoles = rolesReplaced.filter((r) => r.category === cat);
      byCategory[cat] = {
        roles: catRoles.length,
        hours: catRoles.reduce((s, r) => s + r.estimatedHours, 0),
        costUsd: catRoles.reduce((s, r) => s + r.totalCostUsd, 0),
      };
    }

    return {
      projectName: input.projectName,
      aiCostUsd,
      aiDurationMinutes,
      pipelineDurationMinutes,
      rolesReplaced,
      totalHumanHours,
      totalHumanCostUsd,
      totalHumanWeeks,
      costSavingsUsd,
      costSavingsPercent,
      timeSavingsHours,
      speedMultiplier,
      equivalentTeamSize,
      equivalentTeamMonths,
      annualSavingsUsd,
      byCategory,
    };
  }

  /**
   * Calculate the maximum possible value (all roles activated).
   */
  calculateMaximum(): { totalHours: number; totalCostUsd: number; roleCount: number } {
    return this.registry.getMaximumValue();
  }

  /**
   * Format a ValueReport as a plain-text summary for non-technical users.
   */
  formatSummary(report: ValueReport): string {
    const lines: string[] = [
      `Value Report: ${report.projectName}`,
      '='.repeat(40),
      '',
      'Your AI Team',
      '-'.repeat(20),
      `${report.equivalentTeamSize} professionals replaced`,
      `${report.totalHumanHours} hours of work saved`,
      `$${formatUsd(report.totalHumanCostUsd)} in human labor costs avoided`,
      '',
      'The Numbers',
      '-'.repeat(20),
      `AI cost: $${formatUsd(report.aiCostUsd)}`,
      `Human cost: $${formatUsd(report.totalHumanCostUsd)}`,
      `You saved: $${formatUsd(report.costSavingsUsd)} (${report.costSavingsPercent.toFixed(1)}%)`,
      `Speed: ${report.speedMultiplier === Infinity ? 'instant' : report.speedMultiplier + 'x'} faster than a human team`,
      '',
      'Team Breakdown',
      '-'.repeat(20),
    ];

    for (const [cat, data] of Object.entries(report.byCategory)) {
      lines.push(`  ${capitalize(cat)}: ${data.roles} roles, ${data.hours}h, $${formatUsd(data.costUsd)}`);
    }

    lines.push('');
    lines.push('Annual Projection');
    lines.push('-'.repeat(20));
    lines.push(
      `At ${report.annualSavingsUsd > 0 ? '12' : '0'} projects/year: $${formatUsd(report.annualSavingsUsd)} saved annually`,
    );
    lines.push(`Equivalent to ${report.equivalentTeamMonths.toFixed(1)} person-months of work per project`);

    return lines.join('\n');
  }

  /**
   * Format a ValueReport as markdown.
   */
  formatMarkdown(report: ValueReport): string {
    const lines: string[] = [
      `# Value Report: ${report.projectName}`,
      '',
      '## Your AI Team',
      '',
      `| Role | Hours | Cost |`,
      `|------|-------|------|`,
    ];

    for (const role of report.rolesReplaced) {
      lines.push(`| ${role.roleTitle} | ${role.estimatedHours}h | $${formatUsd(role.totalCostUsd)} |`);
    }

    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Professionals replaced | ${report.equivalentTeamSize} |`);
    lines.push(`| Human hours saved | ${report.totalHumanHours}h |`);
    lines.push(`| Human cost avoided | $${formatUsd(report.totalHumanCostUsd)} |`);
    lines.push(`| AI cost | $${formatUsd(report.aiCostUsd)} |`);
    lines.push(`| Cost savings | ${report.costSavingsPercent.toFixed(1)}% |`);
    lines.push(`| Speed multiplier | ${report.speedMultiplier === Infinity ? 'N/A' : report.speedMultiplier + 'x'} |`);
    lines.push(`| Human weeks equivalent | ${report.totalHumanWeeks.toFixed(1)} weeks |`);
    lines.push(`| Annual savings (12 projects) | $${formatUsd(report.annualSavingsUsd)} |`);
    lines.push('');

    if (Object.keys(report.byCategory).length > 0) {
      lines.push('## By Category');
      lines.push('');
      lines.push('| Category | Roles | Hours | Cost |');
      lines.push('|----------|-------|-------|------|');
      for (const [cat, data] of Object.entries(report.byCategory)) {
        lines.push(`| ${capitalize(cat)} | ${data.roles} | ${data.hours}h | $${formatUsd(data.costUsd)} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatUsd(amount: number): string {
  if (amount >= 1000) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return amount.toFixed(2);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
