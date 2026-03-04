/**
 * HTML PRD Generator - Consulting-Grade Document
 *
 * Generates a polished, print-ready HTML document from Pre-RC Method
 * research state. Designed for Word/PDF export.
 *
 * Usage:
 *   import { generateHtmlPrd } from './generators/html-prd-generator.js';
 *   const html = generateHtmlPrd(state, prdSections);
 *   fs.writeFileSync('prd-output.html', html);
 */

import { z } from 'zod';
import type { ResearchState } from '../types.js';

// ============================================================================
// PUBLIC INTERFACE + ZOD SCHEMA
// ============================================================================

export interface PRDSections {
  execSummary: {
    recommendation: string;
    metrics: Array<{ label: string; value: string; target: string }>;
    painPoints: string[];
    keyInsight: string;
  };
  icp: {
    rows: Array<{ label: string; value: string }>;
    persona: { name: string; title: string; description: string };
    painPoints: Array<{ title: string; detail: string }>;
    behavioralTraits: Array<{ title: string; detail: string }>;
    secondaryUsers: string;
    accessibility: string[];
  };
  solution: {
    overview: string;
    currentState: string;
    targetState: string;
    phases: Array<{ phase: string; weeks: string; scope: string; rollout: string }>;
    costImpact: Array<{ item: string; current: string; projected: string; delta: string; deltaColor: string }>;
    rollbackNote: string;
  };
  goals: Array<{ id: string; goal: string; baseline: string; target: string }>;
  userStoryGroups: Array<{
    category: string;
    stories: Array<{ id: string; story: string; criteria: string }>;
  }>;
  features: Array<{ name: string; priority: string; effort: string; module: string }>;
  requirementModules: Array<{
    id: string;
    name: string;
    requirements: Array<{ id: string; requirement: string }>;
  }>;
  ux: {
    surfaces: string[];
    flows: Array<{ title: string; description: string }>;
  };
  risks: Array<{ risk: string; likelihood: string; impact: string; mitigation: string }>;
  methodology: { researchScope: string; nextSteps: string };
  rcMethodMetadata?: {
    phase: string;
    gateStatus: string;
    researchArtifactCount: number;
    personaCount: number;
    tokenCount: number;
    handoffInstructions: string;
  };
}

// Zod schema for runtime validation of Claude's JSON output
export const PRDSectionsSchema = z.object({
  execSummary: z.object({
    recommendation: z.string().default(''),
    metrics: z.array(z.object({ label: z.string(), value: z.string(), target: z.string() })).default([]),
    painPoints: z.array(z.string()).default([]),
    keyInsight: z.string().default(''),
  }),
  icp: z.object({
    rows: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    persona: z.object({
      name: z.string().default(''),
      title: z.string().default(''),
      description: z.string().default(''),
    }),
    painPoints: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    behavioralTraits: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    secondaryUsers: z.string().default(''),
    accessibility: z.array(z.string()).default([]),
  }),
  solution: z.object({
    overview: z.string().default(''),
    currentState: z.string().default(''),
    targetState: z.string().default(''),
    phases: z
      .array(z.object({ phase: z.string(), weeks: z.string(), scope: z.string(), rollout: z.string() }))
      .default([]),
    costImpact: z
      .array(
        z.object({
          item: z.string(),
          current: z.string(),
          projected: z.string(),
          delta: z.string(),
          deltaColor: z.string().default('#C4952B'),
        }),
      )
      .default([]),
    rollbackNote: z.string().default(''),
  }),
  goals: z.array(z.object({ id: z.string(), goal: z.string(), baseline: z.string(), target: z.string() })).default([]),
  userStoryGroups: z
    .array(
      z.object({
        category: z.string(),
        stories: z.array(z.object({ id: z.string(), story: z.string(), criteria: z.string() })).default([]),
      }),
    )
    .default([]),
  features: z
    .array(z.object({ name: z.string(), priority: z.string(), effort: z.string(), module: z.string().default('') }))
    .default([]),
  requirementModules: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        requirements: z.array(z.object({ id: z.string(), requirement: z.string() })).default([]),
      }),
    )
    .default([]),
  ux: z.object({
    surfaces: z.array(z.string()).default([]),
    flows: z.array(z.object({ title: z.string(), description: z.string() })).default([]),
  }),
  risks: z
    .array(z.object({ risk: z.string(), likelihood: z.string(), impact: z.string(), mitigation: z.string() }))
    .default([]),
  methodology: z.object({ researchScope: z.string().default(''), nextSteps: z.string().default('') }),
  rcMethodMetadata: z
    .object({
      phase: z.string(),
      gateStatus: z.string(),
      researchArtifactCount: z.number(),
      personaCount: z.number(),
      tokenCount: z.number(),
      handoffInstructions: z.string(),
    })
    .optional(),
});

export function generateHtmlPrd(state: ResearchState, sections: PRDSections): string {
  const totalTokens = state.artifacts.reduce((s, a) => s + a.tokenCount, 0);
  const personaCount = state.artifacts.length;
  const stageCount = new Set(state.artifacts.map((a) => a.stage)).size;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(state.projectName)} - Complete PRD</title>
${STYLES}
</head>
<body>

${coverPage(state, date, personaCount, totalTokens)}
${execSummaryPage(sections)}
${icpPage(sections)}
${solutionPage(sections)}
${goalsAndStoriesPage1(sections)}
${storiesAndFeaturesPage2(sections)}
${requirementsPages(sections)}
${uxRiskMethodologyPage(sections, personaCount, totalTokens, stageCount)}
${sections.rcMethodMetadata ? metadataPage(sections) : ''}

</body>
</html>`;
}

// ============================================================================
// PAGE BUILDERS
// ============================================================================

function coverPage(state: ResearchState, date: string, personaCount: number, totalTokens: number): string {
  const domain = state.classification?.domain || 'N/A';
  return `<!-- COVER -->
<div class="page cover">
  <div>
    <div class="cover-top-bar"></div>
    <div class="cover-header">
      <div class="cover-confidential">Confidential</div>
      <div class="cover-date">${esc(date)}</div>
    </div>
  </div>
  <div class="cover-body">
    <div class="cover-geo"></div>
    <div class="cover-title">${esc(state.projectName)}</div>
    <div class="cover-subtitle">${esc(state.brief.description)}</div>
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><div class="cm-label">Client</div><div class="cm-value">${esc(state.brief.name)}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Status</div><div class="cm-value">Draft</div></div>
      <div class="cover-meta-item"><div class="cm-label">Domain</div><div class="cm-value">${esc(capitalize(domain))}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Personas</div><div class="cm-value">${personaCount}</div></div>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-left">Pre-RC Method Agent Output &mdash; ${personaCount} Personas &middot; ${totalTokens.toLocaleString()} Tokens</div>
    <div class="geo-bottom"><span></span><span></span><span></span></div>
  </div>
  <div style="padding: 0 72px 16px; position: relative; z-index: 1;">
    <div style="font-size: 7px; line-height: 1.5; color: #bbb; font-style: italic; max-width: 520px;">Generated with AI assistance via the Pre-RC Method Agent in collaboration with human-in-the-loop strategic direction. The Pre-RC Method Agent is a product of Toerana.</div>
  </div>
</div>`;
}

function execSummaryPage(s: PRDSections): string {
  const metrics = s.execSummary.metrics
    .map(
      (m) =>
        `<div class="metric"><div class="metric-label">${esc(m.label)}</div><div class="metric-val">${esc(m.value)}</div><div class="metric-note">Target: ${esc(m.target)}</div></div>`,
    )
    .join('\n      ');

  const painPoints = s.execSummary.painPoints.map((p) => `<li>${p}</li>`).join('\n      ');

  return `<!-- EXEC SUMMARY -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">01</span>
    <div class="st">Executive Summary</div>
    <div class="sd"></div>
    <div class="exec">
      <div class="exec-bar"></div>
      <div class="exec-body">
        <div class="exec-label">Strategic Recommendation</div>
        <p>${esc(s.execSummary.recommendation)}</p>
      </div>
    </div>
    <div class="metrics">
      ${metrics}
    </div>
    <h3>Critical Pain Points</h3>
    <ol class="nlist">
      ${painPoints}
    </ol>
    <div class="insight">
      <div class="insight-label">Key Insight</div>
      <p>${esc(s.execSummary.keyInsight)}</p>
    </div>
  </div>
  ${pageFooter(2)}
</div>`;
}

function icpPage(s: PRDSections): string {
  const icpRows = s.icp.rows
    .map(
      (r) =>
        `<div class="icp-row"><div class="icp-label">${esc(r.label)}</div><div class="icp-value">${esc(r.value)}</div></div>`,
    )
    .join('\n      ');

  const painBlocks = s.icp.painPoints
    .map(
      (p) =>
        `<p${s.icp.painPoints.indexOf(p) > 0 ? ' style="margin-top: 8px;"' : ''}><strong>${esc(p.title)}:</strong> ${esc(p.detail)}</p>`,
    )
    .join('\n        ');

  const traitBlocks = s.icp.behavioralTraits
    .map(
      (t) =>
        `<p${s.icp.behavioralTraits.indexOf(t) > 0 ? ' style="margin-top: 8px;"' : ''}><strong>${esc(t.title)}:</strong> ${esc(t.detail)}</p>`,
    )
    .join('\n        ');

  const accessItems = s.icp.accessibility.map((a) => `<li><strong>${esc(a)}</strong></li>`).join('\n      ');

  return `<!-- TARGET USER & ICP -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">02</span>
    <div class="st">Target User &amp; ICP</div>
    <div class="sd"></div>
    <h3>Ideal Customer Profile</h3>
    <div class="icp-table">
      ${icpRows}
    </div>
    <h3>Primary Persona</h3>
    <div class="exec">
      <div class="exec-bar"></div>
      <div class="exec-body">
        <div class="exec-label">${esc(s.icp.persona.name)} &mdash; ${esc(s.icp.persona.title)}</div>
        <p>${esc(s.icp.persona.description)}</p>
      </div>
    </div>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">Pain Points</div>
        ${painBlocks}
      </div>
      <div class="col-block">
        <div class="col-block-title">Behavioral Traits</div>
        ${traitBlocks}
      </div>
    </div>
    <h3>Secondary Users</h3>
    <p>${esc(s.icp.secondaryUsers)}</p>
    <h3>Accessibility Considerations</h3>
    <ol class="nlist">
      ${accessItems}
    </ol>
  </div>
  ${pageFooter(3)}
</div>`;
}

function solutionPage(s: PRDSections): string {
  const phaseRows = s.solution.phases
    .map(
      (p) =>
        `<tr><td><strong>${esc(p.phase)}</strong></td><td>${esc(p.weeks)}</td><td>${esc(p.scope)}</td><td>${esc(p.rollout)}</td></tr>`,
    )
    .join('\n        ');

  const costRows = s.solution.costImpact
    .map(
      (c) =>
        `<tr><td>${c.item}</td><td>${esc(c.current)}</td><td>${esc(c.projected)}</td><td style="color:${c.deltaColor};font-weight:600">${esc(c.delta)}</td></tr>`,
    )
    .join('\n        ');

  return `<!-- SOLUTION OVERVIEW -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">03</span>
    <div class="st">Solution Overview</div>
    <div class="sd"></div>
    <p>${esc(s.solution.overview)}</p>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">Current State</div>
        <p>${esc(s.solution.currentState)}</p>
      </div>
      <div class="col-block target">
        <div class="col-block-title">Target State</div>
        <p>${esc(s.solution.targetState)}</p>
      </div>
    </div>
    <h3>Migration Phases</h3>
    <table>
      <thead><tr><th style="width:64px">Phase</th><th style="width:72px">Weeks</th><th>Scope</th><th style="width:112px">Rollout</th></tr></thead>
      <tbody>
        ${phaseRows}
      </tbody>
    </table>
    <h3>Cost Impact</h3>
    <table>
      <thead><tr><th>Item</th><th style="width:72px">Current</th><th style="width:72px">Projected</th><th style="width:64px">Delta</th></tr></thead>
      <tbody>
        ${costRows}
      </tbody>
    </table>
    <div class="insight">
      <div class="insight-label">Rollback Guarantee</div>
      <p>${esc(s.solution.rollbackNote)}</p>
    </div>
  </div>
  ${pageFooter(4)}
</div>`;
}

function goalsAndStoriesPage1(s: PRDSections): string {
  const goalRows = s.goals
    .map(
      (g) =>
        `<tr><td><strong>${esc(g.id)}</strong></td><td>${esc(g.goal)}</td><td>${esc(g.baseline)}</td><td>${esc(g.target)}</td></tr>`,
    )
    .join('\n        ');

  // First 2 story groups on this page
  const storyGroups = s.userStoryGroups
    .slice(0, 2)
    .map((grp) => {
      const rows = grp.stories
        .map((st) => `<tr><td>${esc(st.id)}</td><td>${esc(st.story)}</td><td>${esc(st.criteria)}</td></tr>`)
        .join('\n        ');
      return `<h3>${esc(grp.category)}</h3>
    <table>
      <thead><tr><th style="width:48px">ID</th><th style="width:240px">Story</th><th>Acceptance Criteria</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
    })
    .join('\n\n    ');

  return `<!-- GOALS & USER STORIES (part 1) -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">04</span>
    <div class="st">Goals &amp; Success Measures</div>
    <div class="sd"></div>
    <table>
      <thead><tr><th style="width:36px">#</th><th>Goal</th><th style="width:88px">Baseline</th><th style="width:88px">Target</th></tr></thead>
      <tbody>
        ${goalRows}
      </tbody>
    </table>
    <span class="sn" style="margin-top:32px">05</span>
    <div class="st">User Stories</div>
    <div class="sd"></div>
    ${storyGroups}
  </div>
  ${pageFooter(5)}
</div>`;
}

function storiesAndFeaturesPage2(s: PRDSections): string {
  // Remaining story groups
  const storyGroups = s.userStoryGroups
    .slice(2)
    .map((grp) => {
      const rows = grp.stories
        .map((st) => `<tr><td>${esc(st.id)}</td><td>${esc(st.story)}</td><td>${esc(st.criteria)}</td></tr>`)
        .join('\n        ');
      return `<h3>${esc(grp.category)}</h3>
    <table>
      <thead><tr><th style="width:48px">ID</th><th style="width:240px">Story</th><th>Acceptance Criteria</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
    })
    .join('\n\n    ');

  const featureRows = s.features
    .map((f) => {
      const badgeClass = f.priority === 'Must' ? 'b-must' : 'b-should';
      return `<tr><td>${esc(f.name)}</td><td><span class="badge ${badgeClass}">${esc(f.priority)}</span></td><td>${esc(f.effort)}</td><td>${esc(f.module)}</td></tr>`;
    })
    .join('\n        ');

  return `<!-- USER STORIES (part 2) + FEATURES -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    ${storyGroups}
    <span class="sn" style="margin-top:32px">06</span>
    <div class="st">Feature Prioritization</div>
    <div class="sd"></div>
    <table>
      <thead><tr><th>Feature</th><th style="width:72px">Priority</th><th style="width:72px">Effort</th><th style="width:48px">Module</th></tr></thead>
      <tbody>
        ${featureRows}
      </tbody>
    </table>
  </div>
  ${pageFooter(6)}
</div>`;
}

function requirementsPages(s: PRDSections): string {
  // Split modules across pages (~4 modules per page
  const pages: string[] = [];
  const modulesPerPage = 4;
  let pageNum = 7;
  let isFirst = true;

  for (let i = 0; i < s.requirementModules.length; i += modulesPerPage) {
    const chunk = s.requirementModules.slice(i, i + modulesPerPage);
    const modulesHtml = chunk
      .map((mod) => {
        const rows = mod.requirements
          .map((r) => `<tr><td>${esc(r.id)}</td><td>${r.requirement}</td></tr>`)
          .join('\n        ');
        return `<div class="mod-header">Module ${esc(mod.id)}: ${esc(mod.name)}</div>
    <table>
      <thead><tr><th style="width:72px">#</th><th>Requirement</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
      })
      .join('\n\n    ');

    const sectionHeader = isFirst
      ? `<span class="sn">07</span>
    <div class="st">Functional Requirements</div>
    <div class="sd"></div>

    `
      : '';

    pages.push(`<!-- FUNCTIONAL REQUIREMENTS (page ${pageNum}) -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    ${sectionHeader}${modulesHtml}
  </div>
  ${pageFooter(pageNum)}
</div>`);
    pageNum++;
    isFirst = false;
  }

  return pages.join('\n\n');
}

function uxRiskMethodologyPage(
  s: PRDSections,
  _personaCount: number,
  _totalTokens: number,
  _stageCount: number,
): string {
  const surfaces = s.ux.surfaces.map((sf) => `<li><strong>${sf}</strong></li>`).join('\n      ');

  const flows = s.ux.flows
    .map(
      (f) =>
        `<div class="flow-box">
      <div class="flow-title">${esc(f.title)}</div>
      ${f.description}
    </div>`,
    )
    .join('\n    ');

  const riskRows = s.risks
    .map(
      (r) =>
        `<tr><td>${esc(r.risk)}</td><td>${esc(r.likelihood)}</td><td>${esc(r.impact)}</td><td>${esc(r.mitigation)}</td></tr>`,
    )
    .join('\n        ');

  return `<!-- UX + RISK + METHODOLOGY -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">08</span>
    <div class="st">UX &amp; Design Considerations</div>
    <div class="sd"></div>
    <h3>Key UI Surfaces</h3>
    <ol class="nlist">
      ${surfaces}
    </ol>
    <h3>Critical User Flows</h3>
    ${flows}
    <span class="sn" style="margin-top:28px">09</span>
    <div class="st">Risk Assessment</div>
    <div class="sd"></div>
    <table>
      <thead><tr><th>Risk</th><th style="width:72px">Likelihood</th><th style="width:56px">Impact</th><th>Mitigation</th></tr></thead>
      <tbody>
        ${riskRows}
      </tbody>
    </table>
    <span class="sn" style="margin-top:28px">10</span>
    <div class="st">Research Methodology</div>
    <div class="sd"></div>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">Research Scope</div>
        <p>${esc(s.methodology.researchScope)}</p>
      </div>
      <div class="col-block target">
        <div class="col-block-title">Next Steps</div>
        <p>${esc(s.methodology.nextSteps)}</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:2px solid var(--navy);">
      <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:8px;">End of Document</div>
      <div class="geo-bottom" style="justify-content:center;display:flex;"><span></span><span></span><span></span></div>
    </div>
  </div>
  ${pageFooter('*')}
</div>`;
}

function metadataPage(s: PRDSections): string {
  const meta = s.rcMethodMetadata!;
  return `<!-- RC METHOD METADATA -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">11</span>
    <div class="st">RC Method Metadata</div>
    <div class="sd"></div>
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td><strong>Phase</strong></td><td>${esc(meta.phase)}</td></tr>
        <tr><td><strong>Gate Status</strong></td><td>${esc(meta.gateStatus)}</td></tr>
        <tr><td><strong>Research Artifacts</strong></td><td>${meta.researchArtifactCount}</td></tr>
        <tr><td><strong>Personas</strong></td><td>${meta.personaCount}</td></tr>
        <tr><td><strong>Token Count</strong></td><td>${meta.tokenCount.toLocaleString()}</td></tr>
      </tbody>
    </table>
    <div class="insight">
      <div class="insight-label">Handoff Instructions</div>
      <p>${esc(meta.handoffInstructions)}</p>
    </div>
  </div>
  ${pageFooter('M')}
</div>`;
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function pageHeader(): string {
  return `<div class="ph"><div class="ph-l">PRD &mdash; Pre-RC Method Agent</div><div class="ph-r">Confidential</div></div>`;
}

function pageFooter(num: number | string): string {
  return `<div class="pf"><span>Pre-RC Method Agent Output</span><span>${num}</span></div>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// STYLESHEET (embedded)
// ============================================================================

const STYLES = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@400;600;700;800&display=swap');

  :root {
    --navy: #1B2A4A;
    --charcoal: #333333;
    --gold: #C4952B;
    --gold-light: rgba(196, 149, 43, 0.06);
    --light-gray: #F5F5F3;
    --mid-gray: #E8E8E8;
    --white: #FFFFFF;
    --page-width: 816px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    color: var(--charcoal);
    background: #D8D8D8;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    width: var(--page-width);
    min-height: 1056px;
    margin: 32px auto;
    background: var(--white);
    box-shadow: 0 2px 24px rgba(0,0,0,0.12);
    position: relative;
    page-break-after: always;
    overflow: hidden;
  }

  /* ===== COVER ===== */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 1056px;
    overflow: hidden;
  }

  .cover-top-bar { height: 6px; background: var(--gold); position: relative; z-index: 1; }
  .cover-header { padding: 48px 72px 0; display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
  .cover-confidential { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); border: 1px solid var(--gold); padding: 4px 12px; }
  .cover-date { font-size: 13px; color: #888; font-weight: 500; }
  .cover-body { padding: 0 72px; flex: 1; display: flex; flex-direction: column; justify-content: center; position: relative; z-index: 1; }
  .cover-geo { width: 80px; height: 4px; background: var(--gold); margin-bottom: 32px; }
  .cover-title { font-family: 'Playfair Display', Georgia, serif; font-size: 44px; font-weight: 700; color: var(--navy); line-height: 1.12; margin-bottom: 16px; letter-spacing: -0.5px; }
  .cover-subtitle { font-size: 17px; font-weight: 400; color: #666; line-height: 1.55; max-width: 520px; margin-bottom: 48px; }
  .cover-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 2px solid var(--navy); padding-top: 24px; }
  .cover-meta-item { padding-right: 24px; }
  .cm-label { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #999; margin-bottom: 4px; }
  .cm-value { font-size: 14px; font-weight: 600; color: var(--navy); }
  .cover-footer { padding: 32px 72px; border-top: 1px solid var(--mid-gray); display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
  .cover-footer-left { font-size: 11px; color: #999; }
  .geo-bottom { display: flex; gap: 4px; }
  .geo-bottom span { display: block; width: 24px; height: 4px; background: var(--navy); }
  .geo-bottom span:last-child { background: var(--gold); width: 48px; }

  /* ===== PAGE CHROME ===== */
  .ph { padding: 24px 72px 16px; border-bottom: 2px solid var(--navy); display: flex; justify-content: space-between; align-items: baseline; }
  .ph-l { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--navy); }
  .ph-r { font-size: 10px; color: #999; letter-spacing: 1px; text-transform: uppercase; }
  .pc { padding: 40px 72px 80px; }
  .pf { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 72px; border-top: 1px solid var(--mid-gray); display: flex; justify-content: space-between; font-size: 10px; color: #999; }

  /* ===== TYPOGRAPHY ===== */
  .sn { font-size: 12px; font-weight: 700; color: var(--gold); letter-spacing: 1px; margin-bottom: 4px; display: block; }
  .st { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: var(--navy); margin-bottom: 8px; line-height: 1.2; }
  .sd { width: 48px; height: 3px; background: var(--gold); margin: 16px 0 28px; }
  h3 { font-size: 15px; font-weight: 700; color: var(--navy); margin: 28px 0 10px; letter-spacing: -0.2px; }
  h3:first-child { margin-top: 0; }
  p { font-size: 13px; line-height: 1.75; margin-bottom: 14px; }

  /* ===== EXEC SUMMARY ===== */
  .exec { display: grid; grid-template-columns: 4px 1fr; margin: 0 0 32px; }
  .exec-bar { background: var(--gold); }
  .exec-body { background: var(--light-gray); padding: 24px 28px; }
  .exec-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; }
  .exec-body p { font-size: 13.5px; line-height: 1.7; margin-bottom: 10px; }
  .exec-body p:last-child { margin-bottom: 0; }

  /* ===== INSIGHT BOX ===== */
  .insight { border-left: 3px solid var(--navy); padding: 14px 20px; margin: 20px 0; background: var(--light-gray); }
  .insight-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--navy); margin-bottom: 6px; }
  .insight p { font-size: 12.5px; color: #555; margin-bottom: 0; }

  /* ===== TWO-COLUMN ===== */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
  .col-block { padding: 20px; border: 1px solid var(--mid-gray); }
  .col-block-title { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--navy); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--navy); }
  .col-block p { font-size: 12px; line-height: 1.6; margin-bottom: 0; }
  .col-block.target { border-color: var(--gold); border-left: 3px solid var(--gold); }
  .col-block.target .col-block-title { border-bottom-color: var(--gold); color: var(--gold); }

  /* ===== METRICS ===== */
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--mid-gray); margin: 24px 0; }
  .metric { padding: 20px 14px; text-align: center; border-right: 1px solid var(--mid-gray); }
  .metric:last-child { border-right: none; }
  .metric-val { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: var(--navy); line-height: 1; margin-bottom: 4px; }
  .metric-label { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
  .metric-note { font-size: 11px; font-weight: 600; color: var(--gold); }

  /* ===== NUMBERED LIST ===== */
  .nlist { counter-reset: item; list-style: none; padding: 0; margin: 14px 0; }
  .nlist li { counter-increment: item; padding: 7px 0 7px 36px; position: relative; font-size: 12.5px; line-height: 1.6; border-bottom: 1px solid var(--mid-gray); }
  .nlist li::before { content: counter(item, decimal-leading-zero); position: absolute; left: 0; font-family: 'Playfair Display', serif; font-weight: 700; color: var(--gold); font-size: 15px; }

  /* ===== TABLES ===== */
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11.5px; }
  thead th { background: var(--navy); color: var(--white); font-weight: 600; text-align: left; padding: 8px 12px; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--mid-gray); vertical-align: top; line-height: 1.5; }
  tbody td:first-child, thead th:first-child { white-space: nowrap; }
  tbody tr:nth-child(even) { background: var(--light-gray); }
  .badge { display: inline-block; padding: 2px 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border-radius: 2px; }
  .b-must { background: var(--navy); color: var(--white); }
  .b-should { background: var(--gold); color: var(--white); }

  /* ===== ICP TABLE ===== */
  .icp-table { margin: 16px 0; }
  .icp-row { display: grid; grid-template-columns: 140px 1fr; border-bottom: 1px solid var(--mid-gray); }
  .icp-row:nth-child(even) { background: var(--light-gray); }
  .icp-label { padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--navy); }
  .icp-value { padding: 8px 12px; font-size: 11.5px; line-height: 1.5; }

  /* ===== USER FLOW ===== */
  .flow-box { background: var(--light-gray); border: 1px solid var(--mid-gray); padding: 16px 20px; margin: 12px 0; font-size: 12px; line-height: 1.8; font-family: 'Inter', monospace; }
  .flow-title { font-size: 11px; font-weight: 700; color: var(--navy); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }

  /* ===== MODULE HEADER ===== */
  .mod-header { background: var(--navy); color: var(--white); padding: 8px 14px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 24px 0 0; }

  @media print { body { background: white; } .page { box-shadow: none; margin: 0; } }
</style>`;
