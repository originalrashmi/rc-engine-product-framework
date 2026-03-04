/**
 * HTML Traceability Report Generator - Consulting-Grade Document
 *
 * Generates a polished, print-ready HTML document matching the
 * Pre-RC Method Agent visual language. Designed for Word/PDF export.
 *
 * Usage:
 *   import { generateHtmlReport } from './generators/html-report-generator.js';
 *   const html = generateHtmlReport(matrix);
 *   fs.writeFileSync('traceability-report.html', html);
 */

import type { TraceabilityMatrix, RequirementCategory } from '../types.js';

export function generateHtmlReport(matrix: TraceabilityMatrix): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const categories = [...new Set(matrix.requirements.map((r) => r.category))];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(matrix.projectName)} - Requirements Traceability Report</title>
${STYLES}
</head>
<body>

${coverPage(matrix, date)}
${executiveSummaryPage(matrix)}
${coverageByCategory(matrix, categories)}
${requirementMatrixPages(matrix, categories)}
${orphanAnalysisPage(matrix)}
${methodologyPage(matrix)}
${disclaimerPage(matrix)}

</body>
</html>`;
}

// ============================================================================
// PAGE BUILDERS
// ============================================================================

function coverPage(matrix: TraceabilityMatrix, date: string): string {
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
    <div class="cover-title">Requirements Traceability Report</div>
    <div class="cover-subtitle">${esc(matrix.projectName)} &mdash; Bidirectional traceability from requirements through implementation to verification.</div>
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><div class="cm-label">Requirements</div><div class="cm-value">${matrix.summary.totalRequirements}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Coverage</div><div class="cm-value">${matrix.summary.coveragePercent}%</div></div>
      <div class="cover-meta-item"><div class="cm-label">Verified</div><div class="cm-value">${matrix.summary.verified}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Failed</div><div class="cm-value">${matrix.summary.failed}</div></div>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-left">RC Traceability Addon &mdash; ${matrix.summary.totalRequirements} Requirements &middot; ${matrix.summary.coveragePercent}% Coverage</div>
    <div class="geo-bottom"><span></span><span></span><span></span></div>
  </div>
  <div style="padding: 0 72px 16px; position: relative; z-index: 1;">
    <div style="font-size: 7px; line-height: 1.5; color: #bbb; font-style: italic; max-width: 520px;">Generated with AI assistance via the RC Traceability Addon. This report is a decision-support tool and requires human validation. It does not constitute certification or guarantee of compliance. See Disclaimer (p. ${6 + Math.ceil(matrix.requirements.length / 18)}) for full terms. &copy; ${new Date().getFullYear()} Toerana.</div>
  </div>
</div>`;
}

function executiveSummaryPage(matrix: TraceabilityMatrix): string {
  const s = matrix.summary;
  const unimplemented = s.totalRequirements - s.implemented - s.verified - s.failed;
  const gateDecision =
    s.failed > 0
      ? 'BLOCK - Failed requirements detected'
      : s.orphanRequirements.length > 0
        ? 'WARN - Orphan requirements exist'
        : s.coveragePercent === 100
          ? 'PASS - Full traceability achieved'
          : 'WARN - Incomplete coverage';

  return `<!-- EXECUTIVE SUMMARY -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">01</span>
    <div class="st">Executive Summary</div>
    <div class="sd"></div>
    <div class="exec">
      <div class="exec-bar"></div>
      <div class="exec-body">
        <div class="exec-label">Checkpoint Decision</div>
        <p>${esc(gateDecision)}</p>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="metric-label">Total Requirements</div><div class="metric-val">${s.totalRequirements}</div><div class="metric-note">${s.implemented} implemented</div></div>
      <div class="metric"><div class="metric-label">Verification Coverage</div><div class="metric-val">${s.coveragePercent}%</div><div class="metric-note">${s.verified} pass / ${s.failed} fail</div></div>
      <div class="metric"><div class="metric-label">Orphans</div><div class="metric-val">${s.orphanRequirements.length + s.orphanTasks.length}</div><div class="metric-note">${s.orphanRequirements.length} reqs / ${s.orphanTasks.length} tasks</div></div>
    </div>
    <h3>Traceability Health</h3>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">Requirement Status</div>
        <p><strong>${unimplemented}</strong> unimplemented</p>
        <p><strong>${s.implemented}</strong> implemented (tasks mapped)</p>
        <p><strong>${s.verified}</strong> verified (findings pass)</p>
        <p><strong>${s.failed}</strong> failed (findings fail)</p>
      </div>
      <div class="col-block${s.failed > 0 ? '' : ' target'}">
        <div class="col-block-title">Quality Indicators</div>
        <p><strong>Orphan Requirements:</strong> ${s.orphanRequirements.length} (no implementation)</p>
        <p><strong>Orphan Tasks:</strong> ${s.orphanTasks.length} (no requirement)</p>
        <p><strong>Coverage Gap:</strong> ${100 - s.coveragePercent}% untested</p>
      </div>
    </div>
    <div class="insight">
      <div class="insight-label">What This Means</div>
      <p>${
        s.coveragePercent === 100
          ? 'Every requirement has been verified through Post-RC scanning. Full bidirectional traceability from PRD to code to verification is established.'
          : s.coveragePercent > 70
            ? 'Most requirements have been verified. Address the remaining orphan requirements and untested areas to achieve full traceability.'
            : s.coveragePercent > 30
              ? 'Partial traceability established. Significant gaps remain - review orphan requirements and ensure Post-RC scanning covers all requirement categories.'
              : 'Traceability is in early stages. Run Post-RC scans and map RC tasks to improve coverage. Focus on implementing orphan requirements first.'
      }</p>
    </div>
  </div>
  ${pageFooter(2)}
</div>`;
}

function coverageByCategory(matrix: TraceabilityMatrix, categories: RequirementCategory[]): string {
  const categoryNames: Record<string, string> = {
    FUNC: 'Functional',
    SEC: 'Security',
    PERF: 'Performance',
    UX: 'UX / Accessibility',
    DATA: 'Data Model',
    INT: 'Integration',
    OBS: 'Observability',
    BIZ: 'Business Rules',
  };

  const rows = categories
    .map((cat) => {
      const reqs = matrix.requirements.filter((r) => r.category === cat);
      const impl = reqs.filter((r) => r.status !== 'unimplemented').length;
      const verified = reqs.filter((r) => r.verificationResult === 'pass').length;
      const failed = reqs.filter((r) => r.verificationResult === 'fail').length;
      const cov = reqs.length > 0 ? Math.round(((verified + failed) / reqs.length) * 100) : 0;
      const bar = Math.round((cov / 100) * 200);

      return `<tr>
      <td><strong>${esc(categoryNames[cat] || cat)}</strong></td>
      <td>${reqs.length}</td>
      <td>${impl}</td>
      <td>${verified}</td>
      <td>${failed}</td>
      <td>
        <div class="cov-bar-bg"><div class="cov-bar-fill" style="width:${bar}px"></div></div>
        <span class="cov-pct">${cov}%</span>
      </td>
    </tr>`;
    })
    .join('\n    ');

  return `<!-- COVERAGE BY CATEGORY -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">02</span>
    <div class="st">Coverage by Category</div>
    <div class="sd"></div>
    <p>Each PRD requirement is classified into a category based on its content. This breakdown shows traceability health per category - helping identify which areas of the product specification have been verified and which remain untested.</p>
    <table>
      <thead><tr><th>Category</th><th style="width:50px">Total</th><th style="width:50px">Impl</th><th style="width:50px">Pass</th><th style="width:50px">Fail</th><th style="width:240px">Coverage</th></tr></thead>
      <tbody>
    ${rows}
      </tbody>
    </table>
    <div class="insight">
      <div class="insight-label">Category Mapping</div>
      <p>Requirements are auto-classified using section heading keywords: security/auth &rarr; SEC, performance/latency &rarr; PERF, monitor/observability &rarr; OBS, data/database &rarr; DATA, integration/API &rarr; INT, UI/accessibility &rarr; UX, business/compliance &rarr; BIZ. All others default to FUNC.</p>
    </div>
  </div>
  ${pageFooter(3)}
</div>`;
}

function requirementMatrixPages(matrix: TraceabilityMatrix, _categories: RequirementCategory[]): string {
  let pages = '';
  let pageNum = 4;

  // Group requirements by category and generate one page per category (or combined if small)
  const allRows = matrix.requirements.map((req) => {
    const statusClass =
      req.status === 'failed'
        ? 'status-fail'
        : req.status === 'verified'
          ? 'status-pass'
          : req.status === 'implemented'
            ? 'status-impl'
            : 'status-none';
    const verifyClass =
      req.verificationResult === 'fail' ? 'status-fail' : req.verificationResult === 'pass' ? 'status-pass' : '';

    return `<tr>
      <td><code>${esc(req.id)}</code></td>
      <td>${esc(truncate(req.title, 30))}</td>
      <td><span class="badge-status ${statusClass}">${esc(req.status)}</span></td>
      <td>${req.mappedTasks.length > 0 ? req.mappedTasks.map((t) => `<code>${esc(t)}</code>`).join(', ') : '<span class="dim">none</span>'}</td>
      <td>${req.mappedFindings.length > 0 ? req.mappedFindings.length.toString() : '<span class="dim">0</span>'}</td>
      <td><span class="${verifyClass}">${esc(req.verificationResult)}</span></td>
    </tr>`;
  });

  // Split into pages of ~18 rows each
  const rowsPerPage = 18;
  for (let i = 0; i < allRows.length; i += rowsPerPage) {
    const chunk = allRows.slice(i, i + rowsPerPage);
    const isFirst = i === 0;
    pages += `<!-- REQUIREMENT MATRIX ${pageNum} -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    ${
      isFirst
        ? `<span class="sn">03</span>
    <div class="st">Requirement Traceability Matrix</div>
    <div class="sd"></div>
    <p>Complete bidirectional mapping from PRD requirements to RC Method tasks and Post-RC scan findings. Each row traces a single requirement through the full development lifecycle.</p>`
        : `<h3>Requirement Matrix (continued)</h3>`
    }
    <table class="matrix-table">
      <thead><tr><th style="width:100px">ID</th><th>Title</th><th style="width:90px">Status</th><th style="width:100px">Tasks</th><th style="width:50px">Finds</th><th style="width:70px">Verify</th></tr></thead>
      <tbody>
    ${chunk.join('\n    ')}
      </tbody>
    </table>
  </div>
  ${pageFooter(pageNum)}
</div>`;
    pageNum++;
  }

  return pages;
}

function orphanAnalysisPage(matrix: TraceabilityMatrix): string {
  const orphanReqRows = matrix.summary.orphanRequirements
    .map((id) => {
      const req = matrix.requirements.find((r) => r.id === id);
      return `<tr><td><code>${esc(id)}</code></td><td>${esc(req?.category || '')}</td><td>${esc(truncate(req?.title || 'Unknown', 50))}</td><td>${esc(req?.sourceSection || '')}</td></tr>`;
    })
    .join('\n    ');

  const orphanTaskRows = matrix.summary.orphanTasks
    .map((id) => `<tr><td><code>${esc(id)}</code></td><td colspan="3">No matching PRD requirement found</td></tr>`)
    .join('\n    ');

  const pageNum = 4 + Math.ceil(matrix.requirements.length / 18);

  return `<!-- ORPHAN ANALYSIS -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">04</span>
    <div class="st">Orphan Analysis</div>
    <div class="sd"></div>
    <p>Orphans represent gaps in the traceability chain. Orphan requirements have no implementation; orphan tasks have no backing requirement. Both indicate potential scope drift or missed coverage.</p>

    <h3>Orphan Requirements (${matrix.summary.orphanRequirements.length})</h3>
    ${
      matrix.summary.orphanRequirements.length > 0
        ? `
    <p>These requirements exist in the PRD but have no mapped RC Method tasks. They may be unimplemented or the task mapping needs review.</p>
    <table>
      <thead><tr><th style="width:100px">ID</th><th style="width:50px">Cat</th><th>Title</th><th style="width:120px">Source Section</th></tr></thead>
      <tbody>
    ${orphanReqRows}
      </tbody>
    </table>`
        : `
    <div class="exec">
      <div class="exec-bar" style="background: #2D7D46;"></div>
      <div class="exec-body">
        <div class="exec-label" style="color: #2D7D46;">All Clear</div>
        <p>Every requirement has at least one mapped task. No orphan requirements detected.</p>
      </div>
    </div>`
    }

    <h3>Orphan Tasks (${matrix.summary.orphanTasks.length})</h3>
    ${
      matrix.summary.orphanTasks.length > 0
        ? `
    <p>These tasks exist in the RC Method task list but don't map to any PRD requirement. They may represent scope creep or utility tasks.</p>
    <table>
      <thead><tr><th style="width:100px">Task ID</th><th colspan="3">Notes</th></tr></thead>
      <tbody>
    ${orphanTaskRows}
      </tbody>
    </table>`
        : `
    <div class="exec">
      <div class="exec-bar" style="background: #2D7D46;"></div>
      <div class="exec-body">
        <div class="exec-label" style="color: #2D7D46;">All Clear</div>
        <p>Every task maps to at least one requirement. No orphan tasks detected.</p>
      </div>
    </div>`
    }

    <div class="insight">
      <div class="insight-label">Recommended Actions</div>
      <p>${
        matrix.summary.orphanRequirements.length > 0
          ? 'Review orphan requirements and either create implementation tasks for them or mark them as out-of-scope in the PRD. Each orphan represents a gap between what was specified and what was built.'
          : matrix.summary.orphanTasks.length > 0
            ? "Review orphan tasks and determine if they represent needed functionality that should be added to the PRD, or if they are implementation-level details that don't need requirement-level tracing."
            : 'Full bidirectional traceability achieved. Every requirement has implementation and every task has a backing requirement.'
      }</p>
    </div>
  </div>
  ${pageFooter(pageNum)}
</div>`;
}

function methodologyPage(matrix: TraceabilityMatrix): string {
  const pageNum = 5 + Math.ceil(matrix.requirements.length / 18);

  return `<!-- METHODOLOGY -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">05</span>
    <div class="st">Methodology &amp; Traceability Process</div>
    <div class="sd"></div>
    <p>This report was generated using the RC Traceability Addon - a standalone enhancement layer for the Pre-RC / RC / Post-RC AI development framework. It implements NASA DO-178C-inspired requirements traceability.</p>

    <h3>Three-Phase Process</h3>
    <table>
      <thead><tr><th style="width:48px">Step</th><th style="width:160px">Tool</th><th>Description</th><th style="width:80px">Timing</th></tr></thead>
      <tbody>
        <tr><td><strong>1</strong></td><td><code>trace_enhance_prd</code></td><td>Parses the PRD, assigns deterministic IDs (PRD-FUNC-001, PRD-SEC-001, etc.), generates testable acceptance criteria, creates the traceability matrix.</td><td>Pre-build</td></tr>
        <tr><td><strong>2</strong></td><td><code>trace_map_findings</code></td><td>Reads Post-RC scan results and RC Method tasks. Maps findings and tasks back to requirement IDs. Calculates coverage metrics and detects orphans.</td><td>Post-build</td></tr>
        <tr><td><strong>3</strong></td><td><code>trace_status</code></td><td>Displays the current traceability matrix as a readable summary with coverage percentages, requirement statuses, and orphan lists.</td><td>Anytime</td></tr>
      </tbody>
    </table>

    <h3>ID Assignment Scheme</h3>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">Requirement Categories</div>
        <p><strong>PRD-FUNC</strong> - Functional requirements</p>
        <p><strong>PRD-SEC</strong> - Security requirements</p>
        <p><strong>PRD-PERF</strong> - Performance requirements</p>
        <p><strong>PRD-UX</strong> - UX / Accessibility</p>
      </div>
      <div class="col-block">
        <div class="col-block-title">&nbsp;</div>
        <p><strong>PRD-DATA</strong> - Data model requirements</p>
        <p><strong>PRD-INT</strong> - Integration requirements</p>
        <p><strong>PRD-OBS</strong> - Observability requirements</p>
        <p><strong>PRD-BIZ</strong> - Business rules</p>
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Deterministic Guarantee</div>
      <p>IDs are assigned based on section position and order within each category - not by LLM judgment. The same PRD structure always produces the same IDs, ensuring consistency across runs.</p>
    </div>

    <h3>Report Metadata</h3>
    <div class="icp-table">
      <div class="icp-row"><div class="icp-label">Project</div><div class="icp-value">${esc(matrix.projectName)}</div></div>
      <div class="icp-row"><div class="icp-label">Generated</div><div class="icp-value">${new Date().toISOString()}</div></div>
      <div class="icp-row"><div class="icp-label">Enhanced PRD</div><div class="icp-value">${esc(matrix.enhancedPrdPath)}</div></div>
      <div class="icp-row"><div class="icp-label">Matrix File</div><div class="icp-value">rc-traceability/TRACEABILITY.json</div></div>
    </div>
  </div>
  ${pageFooter(pageNum)}
</div>`;
}

function disclaimerPage(matrix: TraceabilityMatrix): string {
  const pageNum = 6 + Math.ceil(matrix.requirements.length / 18);

  return `<!-- DISCLAIMER -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn">06</span>
    <div class="st">Disclaimer &amp; Terms of Use</div>
    <div class="sd"></div>

    <div class="exec">
      <div class="exec-bar" style="background: var(--navy);"></div>
      <div class="exec-body">
        <div class="exec-label" style="color: var(--navy);">Important Notice</div>
        <p>This report is generated by the RC Traceability Addon, an AI-assisted software development tool created by Toerana. It is provided as a <strong>decision-support instrument</strong> and does not constitute a certification, audit, legal opinion, or guarantee of software quality, safety, or regulatory compliance.</p>
      </div>
    </div>

    <h3>Nature of This Report</h3>
    <p>The RC Traceability Addon automates the extraction, classification, and mapping of software requirements using deterministic parsing algorithms and, when configured, large language model (LLM) assistance. While the tool is inspired by established traceability practices such as those found in NASA DO-178C and similar standards, <strong>this tool does not implement, certify, or replace formal compliance with any regulatory framework</strong>. References to such standards describe the conceptual lineage of the approach, not a claim of conformance.</p>

    <h3>Human Oversight Required</h3>
    <div class="two-col">
      <div class="col-block">
        <div class="col-block-title">The Tool Provides</div>
        <p>Automated requirement extraction from PRDs</p>
        <p>Deterministic ID assignment and categorization</p>
        <p>Mapping of tasks and findings to requirements</p>
        <p>Coverage metrics and orphan detection</p>
        <p>Structured reporting for review</p>
      </div>
      <div class="col-block target">
        <div class="col-block-title">The User Must Provide</div>
        <p>Verification that extracted requirements are complete and accurate</p>
        <p>Validation that mappings reflect actual implementation intent</p>
        <p>Professional judgment on coverage adequacy for the use case</p>
        <p>Final decisions on whether quality gates are satisfied</p>
        <p>Domain expertise for safety-critical or regulated contexts</p>
      </div>
    </div>

    <h3>Limitations</h3>
    <p>Requirement extraction relies on structural patterns in PRD documents (headings, bullet points, modal verbs). Requirements expressed in non-standard formats may not be captured. LLM-generated acceptance criteria, when present, should be reviewed for accuracy and completeness. Coverage percentages reflect <strong>mapping completeness</strong>, not functional correctness &mdash; a requirement mapped to a task is not inherently verified unless Post-RC scan findings confirm it.</p>

    <div class="insight">
      <div class="insight-label">Liability</div>
      <p>The RC Traceability Addon and this report are provided <strong>&ldquo;as is&rdquo;</strong> without warranty of any kind, express or implied. Toerana and the authors of this tool accept no liability for decisions made, actions taken, or outcomes resulting from the use of this report. Users assume full responsibility for validating the contents of this report and for any reliance placed upon it in software development, deployment, or compliance processes.</p>
    </div>

    <h3>Intellectual Property</h3>
    <p>The RC Method, Pre-RC Method, Post-RC Method, and RC Traceability Addon are proprietary tools developed by Toerana. This report and its underlying methodology are confidential. Redistribution, reproduction, or use of this report outside the scope of the licensed project is prohibited without prior written consent.</p>

    <p style="font-size: 11px; color: #999; margin-top: 32px; font-style: italic;">Report generated ${new Date().toISOString()} &mdash; RC Traceability Addon v1.0.0 &mdash; &copy; ${new Date().getFullYear()} Toerana. All rights reserved.</p>
  </div>
  ${pageFooter(pageNum)}
</div>`;
}

// ============================================================================
// PAGE CHROME
// ============================================================================

function pageHeader(): string {
  return `<div class="ph"><div class="ph-l">Traceability Report &mdash; RC Method</div><div class="ph-r">Confidential</div></div>`;
}

function pageFooter(num: number): string {
  return `<div class="pf"><span>RC Traceability Addon</span><span>${num}</span></div>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ============================================================================
// STYLESHEET (embedded - matches Pre-RC Method Agent design system)
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
  .cover { display: flex; flex-direction: column; justify-content: space-between; min-height: 1056px; overflow: hidden; }
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
  code { font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 11px; background: var(--light-gray); padding: 1px 5px; border-radius: 2px; }

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
  .col-block p { font-size: 12px; line-height: 1.6; margin-bottom: 4px; }
  .col-block.target { border-color: var(--gold); border-left: 3px solid var(--gold); }
  .col-block.target .col-block-title { border-bottom-color: var(--gold); color: var(--gold); }

  /* ===== METRICS ===== */
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--mid-gray); margin: 24px 0; }
  .metric { padding: 20px 14px; text-align: center; border-right: 1px solid var(--mid-gray); }
  .metric:last-child { border-right: none; }
  .metric-val { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: var(--navy); line-height: 1; margin-bottom: 4px; }
  .metric-label { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
  .metric-note { font-size: 11px; font-weight: 600; color: var(--gold); }

  /* ===== TABLES ===== */
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11.5px; }
  thead th { background: var(--navy); color: var(--white); font-weight: 600; text-align: left; padding: 8px 12px; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--mid-gray); vertical-align: top; line-height: 1.5; }
  tbody tr:nth-child(even) { background: var(--light-gray); }

  /* ===== ICP TABLE ===== */
  .icp-table { margin: 16px 0; }
  .icp-row { display: grid; grid-template-columns: 140px 1fr; border-bottom: 1px solid var(--mid-gray); }
  .icp-row:nth-child(even) { background: var(--light-gray); }
  .icp-label { padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--navy); }
  .icp-value { padding: 8px 12px; font-size: 11.5px; line-height: 1.5; }

  /* ===== COVERAGE BARS ===== */
  .cov-bar-bg { display: inline-block; width: 200px; height: 12px; background: var(--mid-gray); border-radius: 2px; vertical-align: middle; }
  .cov-bar-fill { height: 100%; background: var(--navy); border-radius: 2px; transition: width 0.3s; }
  .cov-pct { font-size: 11px; font-weight: 700; color: var(--navy); margin-left: 8px; }

  /* ===== STATUS BADGES ===== */
  .badge-status { display: inline-block; padding: 2px 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border-radius: 2px; }
  .status-pass { background: #E8F5E9; color: #2D7D46; }
  .status-fail { background: #FFEBEE; color: #C62828; }
  .status-impl { background: #E3F2FD; color: #1565C0; }
  .status-none { background: var(--light-gray); color: #999; }
  .dim { color: #CCC; }

  @media print { body { background: white; } .page { box-shadow: none; margin: 0; } }
</style>`;
