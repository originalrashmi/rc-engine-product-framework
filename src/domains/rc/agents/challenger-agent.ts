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
import { resolveTierCapabilities } from '../../../shared/tier-capabilities.js';

export class ChallengerAgent extends BaseAgent {
  /**
   * Run the full Design Challenge — 5 parallel sub-agents (Pro) or 3 (community).
   * Each lens evaluates the design from a different adversarial angle.
   * Returns a unified Challenge Report with verdict.
   */
  async challenge(state: ProjectState, input: ChallengeInput): Promise<AgentResult> {
    // Determine which lenses to run based on tier (not knowledge dir heuristic)
    const caps = resolveTierCapabilities(input.projectPath);
    const lenses = caps.hasProKnowledge ? PRO_LENSES : COMMUNITY_LENSES;

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
      caps.hasProKnowledge,
    );

    // Save report (markdown)
    const reportPath = path.join(state.projectPath, 'rc-method', 'design', 'CHALLENGE-REPORT.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf-8');

    // Save structured findings as JSON for downstream automation (challenge → iterate)
    const structuredReport = {
      projectName: state.projectName,
      verdict,
      generatedAt: new Date().toISOString(),
      lenses: lensResults,
      findings: {
        critical: criticalIssues,
        high: highPriorityIssues,
        recommendations,
      },
      iterationFeedback: ChallengerAgent.buildIterationFeedback(criticalIssues, highPriorityIssues),
    };
    const jsonPath = path.join(state.projectPath, 'rc-method', 'design', 'CHALLENGE-REPORT.json');
    fs.writeFileSync(jsonPath, JSON.stringify(structuredReport, null, 2), 'utf-8');

    const artifactRef = 'rc-method/design/CHALLENGE-REPORT.md';
    const jsonArtifactRef = 'rc-method/design/CHALLENGE-REPORT.json';
    if (!state.artifacts.includes(artifactRef)) {
      state.artifacts.push(artifactRef);
    }
    if (!state.artifacts.includes(jsonArtifactRef)) {
      state.artifacts.push(jsonArtifactRef);
    }

    return {
      text: report,
      artifacts: [artifactRef, jsonArtifactRef],
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

  /** Gather all available project context into a single string, capped at ~30K chars */
  private gatherContext(input: ChallengeInput): string {
    const MAX_CONTEXT_CHARS = 30_000;
    const MAX_FILE_CHARS = 3_000;
    const sections: string[] = [];

    // Primary context (always included)
    sections.push(`## PRD Context\n${input.prdContext.slice(0, 5000)}`);

    if (input.icpData) {
      sections.push(`## ICP / User Research\n${input.icpData.slice(0, 3000)}`);
    }

    if (input.designSpecPath && fs.existsSync(input.designSpecPath)) {
      sections.push(`## Design Spec\n${fs.readFileSync(input.designSpecPath, 'utf-8').slice(0, 5000)}`);
    }

    if (input.copySystemPath && fs.existsSync(input.copySystemPath)) {
      sections.push(`## Copy System\n${fs.readFileSync(input.copySystemPath, 'utf-8').slice(0, 5000)}`);
    }

    if (input.wireframeHtml) {
      sections.push(`## Wireframe HTML\n\`\`\`html\n${input.wireframeHtml.slice(0, 5000)}\n\`\`\``);
    }

    if (input.screenDescriptions) {
      sections.push(`## Screen Descriptions\n${input.screenDescriptions.slice(0, 3000)}`);
    }

    // Design intake assessment -- alignment score, constraints, competitive differentiators
    const intakeJsonPath = path.join(input.projectPath, 'rc-method', 'design', 'DESIGN-INTAKE.json');
    if (fs.existsSync(intakeJsonPath)) {
      try {
        const intake = JSON.parse(fs.readFileSync(intakeJsonPath, 'utf-8'));
        const intakeLines: string[] = [`## Design Intake Assessment`];
        intakeLines.push(`- Verdict: ${intake.verdict}`);
        intakeLines.push(`- Alignment Score: ${intake.alignmentScore}`);
        if (intake.extractedConstraints?.moodDirection?.keywords?.length) {
          intakeLines.push(`- Mood: ${intake.extractedConstraints.moodDirection.keywords.join(', ')}`);
        }
        if (intake.extractedConstraints?.competitiveDifferentiators?.length) {
          intakeLines.push(`- Competitive Differentiators:`);
          for (const d of intake.extractedConstraints.competitiveDifferentiators) {
            intakeLines.push(`  - ${d}`);
          }
        }
        if (intake.extractedConstraints?.accessibilityDirection?.wcagTarget) {
          intakeLines.push(`- WCAG Target: ${intake.extractedConstraints.accessibilityDirection.wcagTarget}`);
        }
        sections.push(intakeLines.join('\n'));
      } catch { /* continue without intake */ }
    }

    // Brand profile -- voice, personality, visual identity
    const brandPath = path.join(input.projectPath, 'rc-method', 'design', 'BRAND-PROFILE.json');
    if (fs.existsSync(brandPath)) {
      try {
        const brand = JSON.parse(fs.readFileSync(brandPath, 'utf-8'));
        const brandLines: string[] = [`## Brand Profile`];
        if (brand.voice?.personality?.length) brandLines.push(`- Personality: ${brand.voice.personality.join(', ')}`);
        if (brand.voice?.tone) brandLines.push(`- Tone: ${brand.voice.tone}`);
        if (brand.positioning?.tagline) brandLines.push(`- Tagline: ${brand.positioning.tagline}`);
        if (brand.positioning?.valueProposition) brandLines.push(`- Value Prop: ${brand.positioning.valueProposition}`);
        if (brandLines.length > 1) sections.push(brandLines.join('\n'));
      } catch { /* continue without brand */ }
    }

    // Supplementary context — only add if we have budget
    const currentLen = sections.reduce((sum, s) => sum + s.length, 0);
    let budget = MAX_CONTEXT_CHARS - currentLen;

    if (budget > 0) {
      const designDir = path.join(input.projectPath, 'rc-method', 'design');
      if (fs.existsSync(designDir)) {
        // Scan top-level design files (.md, .json)
        const designFiles = fs.readdirSync(designDir).filter(
          (f) => (f.endsWith('.md') || f.endsWith('.json')) && f !== 'CHALLENGE-REPORT.md',
        );
        for (const f of designFiles.slice(0, 3)) {
          if (budget <= 0) break;
          const content = fs.readFileSync(path.join(designDir, f), 'utf-8').slice(0, MAX_FILE_CHARS);
          sections.push(`## ${f}\n${content}`);
          budget -= content.length;
        }

        // Scan option-* subdirectories for HTML wireframes
        if (budget > 0) {
          const subdirs = fs.readdirSync(designDir).filter((d) => {
            const fullPath = path.join(designDir, d);
            return d.startsWith('option-') && fs.statSync(fullPath).isDirectory();
          });
          for (const subdir of subdirs) {
            if (budget <= 0) break;
            const subdirPath = path.join(designDir, subdir);
            const htmlFiles = fs.readdirSync(subdirPath).filter(
              (f) => f.endsWith('.html'),
            );
            for (const f of htmlFiles.slice(0, 3)) {
              if (budget <= 0) break;
              const content = fs.readFileSync(path.join(subdirPath, f), 'utf-8').slice(0, MAX_FILE_CHARS);
              sections.push(`## ${subdir}/${f}\n\`\`\`html\n${content}\n\`\`\``);
              budget -= content.length;
            }
          }
        }
      }
    }

    if (budget > 0) {
      const copyDir = path.join(input.projectPath, 'rc-method', 'copy');
      if (fs.existsSync(copyDir)) {
        const copyFiles = fs.readdirSync(copyDir).filter((f) => f.endsWith('.md'));
        for (const f of copyFiles.slice(0, 2)) {
          if (budget <= 0) break;
          const content = fs.readFileSync(path.join(copyDir, f), 'utf-8').slice(0, MAX_FILE_CHARS);
          sections.push(`## ${f}\n${content}`);
          budget -= content.length;
        }
      }
    }

    return sections.join('\n\n---\n\n');
  }

  /** Parse findings from agent response text with multi-strategy extraction */
  private parseFindings(text: string, lens: ChallengerLens): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    // Strategy 1: Structured FINDING: blocks (preferred)
    const blocks = text.split(/FINDING:\s*/i).slice(1);
    for (const block of blocks) {
      const id = block.match(/^([CHR]\d+)/i)?.[1] ?? `${lens[0].toUpperCase()}${findings.length + 1}`;
      const severity = block.match(/SEVERITY:\s*(critical|high|recommendation)/i)?.[1] as
        | 'critical'
        | 'high'
        | 'recommendation'
        | undefined;
      const element = block.match(/ELEMENT:\s*(.+)/i)?.[1]?.trim() ?? 'Unknown';
      const problem = block.match(/PROBLEM:\s*([\s\S]+?)(?=\n(?:EVIDENCE|FIX|SEVERITY|FINDING|$))/i)?.[1]?.trim()
        ?? block.slice(0, 200);
      const evidence = block.match(/EVIDENCE:\s*(.+)/i)?.[1]?.trim();
      const fix = block.match(/FIX:\s*([\s\S]+?)(?=\n(?:FINDING|$))/i)?.[1]?.trim() ?? 'Review and address';

      findings.push({
        id,
        lens: this.lensDisplayName(lens),
        element,
        problem,
        evidence,
        fix,
        severity: severity ?? this.inferSeverity(problem),
      });
    }

    // Strategy 2: Fallback — extract from numbered lists or bullet points
    if (findings.length === 0) {
      const bulletPattern = /(?:^|\n)\s*(?:\d+\.|[-*•])\s*\*?\*?(.+?)(?:\*?\*?)\s*[:—–-]\s*(.+)/gm;
      let bulletMatch;
      let idx = 1;
      while ((bulletMatch = bulletPattern.exec(text)) !== null && idx <= 10) {
        const title = bulletMatch[1].trim();
        const detail = bulletMatch[2].trim();
        findings.push({
          id: `${lens[0].toUpperCase()}${idx}`,
          lens: this.lensDisplayName(lens),
          element: title,
          problem: detail,
          fix: 'Review and address',
          severity: this.inferSeverity(detail),
        });
        idx++;
      }
    }

    // Strategy 3: Last resort — extract meaningful sentences as individual findings
    if (findings.length === 0 && text.length > 100) {
      const sentences = text.match(/[^.!?\n]{30,}[.!?]/g) ?? [];
      const issueIndicators = /(?:missing|broken|fail|violat|incorrect|inconsistent|poor|lack|no |without)/i;
      let idx = 1;
      for (const sentence of sentences.slice(0, 5)) {
        if (issueIndicators.test(sentence)) {
          findings.push({
            id: `U${idx}`,
            lens: this.lensDisplayName(lens),
            element: 'Overall',
            problem: sentence.trim(),
            fix: 'Review and address',
            severity: this.inferSeverity(sentence),
          });
          idx++;
        }
      }

      // Absolute fallback: single aggregate finding
      if (findings.length === 0) {
        findings.push({
          id: 'U1',
          lens: this.lensDisplayName(lens),
          element: 'Overall',
          problem: 'Analysis produced unstructured output. Review raw text for details.',
          fix: 'Address findings in the analysis',
          severity: 'high',
        });
      }
    }

    return findings;
  }

  /** Infer severity from problem text keywords */
  private inferSeverity(text: string): 'critical' | 'high' | 'recommendation' {
    const lower = text.toLowerCase();
    if (/\b(broken|crash|fail|xss|inject|vulnerab|security|data.?loss|inaccessib)\b/.test(lower)) return 'critical';
    if (/\b(missing|inconsistent|violat|poor|confus|unclear|wrong)\b/.test(lower)) return 'high';
    return 'recommendation';
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
    isPro: boolean,
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
    if (!isPro) {
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

  /**
   * Build iteration feedback from challenge findings.
   * Maps critical and high-priority findings into a structured feedback string
   * that can be passed directly to design_iterate.
   */
  static buildIterationFeedback(
    criticalIssues: ChallengeFinding[],
    highIssues: ChallengeFinding[],
  ): string {
    const lines: string[] = [];

    if (criticalIssues.length > 0) {
      lines.push('CRITICAL FIXES REQUIRED:');
      for (const f of criticalIssues) {
        lines.push(`- [${f.id}] ${f.element}: ${f.problem} → Fix: ${f.fix}`);
      }
    }

    if (highIssues.length > 0) {
      lines.push('');
      lines.push('HIGH-PRIORITY IMPROVEMENTS:');
      for (const f of highIssues) {
        lines.push(`- [${f.id}] ${f.element}: ${f.problem} → Fix: ${f.fix}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Load challenge findings from saved JSON and produce iteration input.
   * Call this to auto-generate design_iterate feedback from the last challenge.
   */
  static loadIterationFeedback(projectPath: string): string | null {
    const jsonPath = path.join(projectPath, 'rc-method', 'design', 'CHALLENGE-REPORT.json');
    if (!fs.existsSync(jsonPath)) return null;

    try {
      const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      return report.iterationFeedback ?? null;
    } catch {
      return null;
    }
  }

  /** Required by BaseAgent */
  async run(): Promise<AgentResult> {
    return { text: 'ChallengerAgent requires calling challenge() directly.' };
  }
}
