import fs from 'node:fs';
import path from 'node:path';
import { BaseAgent } from './base-agent.js';
import type { AgentResult, ProjectState } from '../types.js';
import type {
  ChallengeInput,
  ChallengeFinding,
  ChallengeLensResult,
  ChallengerLens,
} from '../challenger-types.js';
import { COMMUNITY_LENSES, PRO_LENSES } from '../challenger-types.js';

export class ChallengerAgent extends BaseAgent {
  /**
   * Run the full Design Challenge — 5 parallel sub-agents (Pro) or 3 (community).
   * Each lens evaluates the design from a different adversarial angle.
   * Returns a unified Challenge Report with verdict.
   */
  async challenge(state: ProjectState, input: ChallengeInput): Promise<AgentResult> {
    // Determine which lenses to run based on Pro vs community
    const lenses = this.contextLoader.isProMode() ? PRO_LENSES : COMMUNITY_LENSES;

    // Gather all available context for the sub-agents
    const context = this.gatherContext(input);

    // Run all lenses in parallel
    const lensResults = await Promise.all(
      lenses.map((lens) => this.runLens(lens, context, state)),
    );

    // Aggregate findings
    const allFindings = lensResults.flatMap((r) => r.findings);
    const criticalIssues = allFindings.filter((f) => f.severity === 'critical');
    const highPriorityIssues = allFindings.filter((f) => f.severity === 'high');
    const recommendations = allFindings.filter((f) => f.severity === 'recommendation');

    // Determine verdict
    const lowestTierCount = lensResults.filter((r) =>
      ['DISCONNECTED', 'HOLLOW', 'DECORATIVE', 'BROKEN', 'HOSTILE'].includes(r.rating),
    ).length;
    let verdict = 'READY';
    if (criticalIssues.length >= 4 || lowestTierCount >= 2) {
      verdict = 'CRITICAL_FAILURES';
    } else if (criticalIssues.length >= 1 || lowestTierCount >= 1) {
      verdict = 'NOT_READY';
    }

    // Build the report markdown
    const report = this.formatReport(
      state.projectName,
      verdict,
      lensResults,
      criticalIssues,
      highPriorityIssues,
      recommendations,
    );

    // Save report
    const reportPath = path.join(state.projectPath, 'rc-method', 'design', 'CHALLENGE-REPORT.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf-8');

    const artifactRef = 'rc-method/design/CHALLENGE-REPORT.md';
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }

    return {
      text: report,
      artifacts: [artifactRef],
    };
  }

  /** Run a single challenge lens */
  private async runLens(
    lens: ChallengerLens,
    context: string,
    state: ProjectState,
  ): Promise<ChallengeLensResult> {
    const lensInstructions = this.getLensInstructions(lens);

    const text = await this.execute(
      ['skills/design/rc-design-challenger.md'],
      lensInstructions,
      `Run the ${this.lensDisplayName(lens)} challenge on this project.\n\nProject: ${state.projectName}\n\n${context}`,
    );

    // Parse findings from the response
    const findings = this.parseFindings(text, lens);
    const rating = this.parseRating(text, lens);

    return {
      lens: this.lensDisplayName(lens),
      rating,
      criticalCount: findings.filter((f) => f.severity === 'critical').length,
      findings,
    };
  }

  /** Get lens-specific instructions */
  private getLensInstructions(lens: ChallengerLens): string {
    const base = `You are the Challenger. Follow the Challenger protocol from the knowledge file. You are running ONLY the specified lens. Be brutal, specific, and constructive.

OUTPUT FORMAT (strict):
For each finding, output exactly this format:

FINDING: [C|H|R]{number}
SEVERITY: critical | high | recommendation
ELEMENT: {specific screen/component}
PROBLEM: {what's wrong}
EVIDENCE: {why it matters}
FIX: {specific fix}
---

After all findings, output:
RATING: {the lens-specific rating}

`;

    const lensMap: Record<ChallengerLens, string> = {
      icp_alignment: `${base}
Run LENS 1: ICP ALIGNMENT CHALLENGE.
Rate as: ALIGNED / DRIFTED / DISCONNECTED.
Focus: Does this design serve the target user or the builder's assumptions?`,

      copy: `${base}
Run LENS 2: COPY CHALLENGE.
Rate as: SHARP / SOFT / HOLLOW.
Focus: Specificity test, awareness level match, objection blindness, CTA strength, jargon audit.`,

      design_decisions: `${base}
Run LENS 3: DESIGN DECISIONS CHALLENGE.
Rate as: JUSTIFIED / FASHIONABLE / DECORATIVE.
Focus: Visual hierarchy, cognitive load, Gestalt principles, trend vs function.`,

      conversion_path: `${base}
Run LENS 4: CONVERSION PATH CHALLENGE.
Rate as: CONVERTING / LEAKING / BROKEN.
Focus: Above-fold test, 3-second test, friction audit, trust signals, mobile conversion.`,

      accessibility: `${base}
Run LENS 5: ACCESSIBILITY & INCLUSION CHALLENGE.
Rate as: INCLUSIVE / EXCLUDING / HOSTILE.
Focus: Contrast, keyboard, screen reader, motion, cognitive a11y, responsive.`,
    };

    return lensMap[lens];
  }

  /** Gather all available project context into a single string */
  private gatherContext(input: ChallengeInput): string {
    const sections: string[] = [];

    sections.push(`## PRD Context\n${input.prdContext}`);

    if (input.icpData) {
      sections.push(`## ICP / User Research\n${input.icpData}`);
    }

    if (input.designSpecPath && fs.existsSync(input.designSpecPath)) {
      sections.push(`## Design Spec\n${fs.readFileSync(input.designSpecPath, 'utf-8')}`);
    }

    if (input.copySystemPath && fs.existsSync(input.copySystemPath)) {
      sections.push(`## Copy System\n${fs.readFileSync(input.copySystemPath, 'utf-8')}`);
    }

    if (input.wireframeHtml) {
      sections.push(`## Wireframe HTML\n\`\`\`html\n${input.wireframeHtml}\n\`\`\``);
    }

    if (input.screenDescriptions) {
      sections.push(`## Screen Descriptions\n${input.screenDescriptions}`);
    }

    // Try to load additional artifacts from project
    const designDir = path.join(input.projectPath, 'rc-method', 'design');
    if (fs.existsSync(designDir)) {
      const designFiles = fs.readdirSync(designDir).filter((f) => f.endsWith('.md') || f.endsWith('.json'));
      for (const f of designFiles.slice(0, 5)) {
        const content = fs.readFileSync(path.join(designDir, f), 'utf-8');
        sections.push(`## ${f}\n${content.slice(0, 3000)}`);
      }
    }

    const copyDir = path.join(input.projectPath, 'rc-method', 'copy');
    if (fs.existsSync(copyDir)) {
      const copyFiles = fs.readdirSync(copyDir).filter((f) => f.endsWith('.md'));
      for (const f of copyFiles.slice(0, 3)) {
        const content = fs.readFileSync(path.join(copyDir, f), 'utf-8');
        sections.push(`## ${f}\n${content.slice(0, 3000)}`);
      }
    }

    return sections.join('\n\n---\n\n');
  }

  /** Parse findings from agent response text */
  private parseFindings(text: string, lens: ChallengerLens): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];
    const blocks = text.split(/FINDING:\s*/i).slice(1);

    for (const block of blocks) {
      const id = block.match(/^([CHR]\d+)/i)?.[1] ?? `${lens[0].toUpperCase()}?`;
      const severity = block.match(/SEVERITY:\s*(critical|high|recommendation)/i)?.[1] as
        | 'critical'
        | 'high'
        | 'recommendation'
        | undefined;
      const element = block.match(/ELEMENT:\s*(.+)/i)?.[1]?.trim() ?? 'Unknown';
      const problem = block.match(/PROBLEM:\s*(.+)/i)?.[1]?.trim() ?? block.slice(0, 200);
      const evidence = block.match(/EVIDENCE:\s*(.+)/i)?.[1]?.trim();
      const fix = block.match(/FIX:\s*(.+)/i)?.[1]?.trim() ?? 'Review and address';

      findings.push({
        id,
        lens: this.lensDisplayName(lens),
        element,
        problem,
        evidence,
        fix,
        severity: severity ?? 'high',
      });
    }

    // If structured parsing found nothing, create a single finding from the whole text
    if (findings.length === 0 && text.length > 100) {
      findings.push({
        id: 'U1',
        lens: this.lensDisplayName(lens),
        element: 'Overall',
        problem: 'See detailed analysis below',
        fix: 'Address findings in the analysis',
        severity: 'high',
      });
    }

    return findings;
  }

  /** Parse lens rating from agent response */
  private parseRating(text: string, lens: ChallengerLens): string {
    const ratingMatch = text.match(/RATING:\s*(\w+)/i);
    if (ratingMatch) return ratingMatch[1].toUpperCase();

    // Fallback: look for known rating words
    const ratingMap: Record<ChallengerLens, string[]> = {
      icp_alignment: ['ALIGNED', 'DRIFTED', 'DISCONNECTED'],
      copy: ['SHARP', 'SOFT', 'HOLLOW'],
      design_decisions: ['JUSTIFIED', 'FASHIONABLE', 'DECORATIVE'],
      conversion_path: ['CONVERTING', 'LEAKING', 'BROKEN'],
      accessibility: ['INCLUSIVE', 'EXCLUDING', 'HOSTILE'],
    };

    for (const rating of ratingMap[lens]) {
      if (text.toUpperCase().includes(rating)) return rating;
    }

    return 'UNRATED';
  }

  /** Format the full Challenge Report */
  private formatReport(
    projectName: string,
    verdict: string,
    lensResults: ChallengeLensResult[],
    criticalIssues: ChallengeFinding[],
    highPriorityIssues: ChallengeFinding[],
    recommendations: ChallengeFinding[],
  ): string {
    const lines: string[] = [];

    lines.push(`# Design Challenge Report — ${projectName}`);
    lines.push('');
    lines.push(`## Overall Verdict: ${verdict}`);
    lines.push('');

    // Summary table
    lines.push('## Challenge Summary');
    lines.push('');
    lines.push('| Lens | Rating | Critical Issues |');
    lines.push('|------|--------|----------------|');
    for (const r of lensResults) {
      lines.push(`| ${r.lens} | **${r.rating}** | ${r.criticalCount} |`);
    }
    lines.push('');

    // Critical issues
    if (criticalIssues.length > 0) {
      lines.push('## Critical Issues (fix before shipping)');
      lines.push('');
      for (const f of criticalIssues) {
        lines.push(`### ${f.id}: ${f.problem.slice(0, 80)}`);
        lines.push(`- **Lens**: ${f.lens}`);
        lines.push(`- **Element**: ${f.element}`);
        lines.push(`- **Problem**: ${f.problem}`);
        if (f.evidence) lines.push(`- **Evidence**: ${f.evidence}`);
        lines.push(`- **Fix**: ${f.fix}`);
        lines.push('');
      }
    }

    // High priority
    if (highPriorityIssues.length > 0) {
      lines.push('## High-Priority Issues (fix before launch)');
      lines.push('');
      for (const f of highPriorityIssues) {
        lines.push(`### ${f.id}: ${f.problem.slice(0, 80)}`);
        lines.push(`- **Lens**: ${f.lens}`);
        lines.push(`- **Element**: ${f.element}`);
        lines.push(`- **Problem**: ${f.problem}`);
        lines.push(`- **Fix**: ${f.fix}`);
        lines.push('');
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      lines.push('## Recommendations (consider for next iteration)');
      lines.push('');
      for (const f of recommendations) {
        lines.push(`- **${f.element}**: ${f.problem} → ${f.fix}`);
      }
      lines.push('');
    }

    // Pro upsell for community mode
    if (!this.contextLoader.isProMode()) {
      lines.push('---');
      lines.push('');
      lines.push('> **Community Edition**: This report ran 3 of 5 challenge lenses.');
      lines.push('> Upgrade to RC Engine Pro for Conversion Path Analysis and Accessibility/Inclusion Challenge.');
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Get display name for a lens */
  private lensDisplayName(lens: ChallengerLens): string {
    const names: Record<ChallengerLens, string> = {
      icp_alignment: 'ICP Alignment',
      copy: 'Copy',
      design_decisions: 'Design Decisions',
      conversion_path: 'Conversion Path',
      accessibility: 'Accessibility & Inclusion',
    };
    return names[lens];
  }

  /** Required by BaseAgent */
  async run(): Promise<AgentResult> {
    return { text: 'ChallengerAgent requires calling challenge() directly.' };
  }
}
