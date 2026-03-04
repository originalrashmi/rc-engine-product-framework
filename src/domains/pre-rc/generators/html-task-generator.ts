/**
 * HTML Task List Generator - Consulting-Grade Document
 *
 * Generates a polished, print-ready HTML document from the Pre-RC Method
 * task list output. Same visual language as the PRD deck.
 *
 * Usage:
 *   import { generateHtmlTaskList } from './generators/html-task-generator.js';
 *   const html = generateHtmlTaskList(projectName, taskSections);
 *   fs.writeFileSync('tasks-output.html', html);
 */

import type { ResearchState } from '../types.js';

// ============================================================================
// PUBLIC INTERFACE
// ============================================================================

export interface TaskSections {
  title: string;
  generatedFrom: string;
  createdDate: string;
  relevantFiles: Array<{
    category: string;
    files: Array<{ path: string; description: string }>;
  }>;
  phases: Array<{
    id: string;
    name: string;
    timeline: string;
    tasks: Array<{
      id: string;
      name: string;
      subtasks: Array<{ id: string; description: string }>;
    }>;
  }>;
}

export function generateHtmlTaskList(state: ResearchState, sections: TaskSections): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(state.projectName)} - Implementation Tasks</title>
${STYLES}
</head>
<body>

${coverPage(state, sections, date)}
${relevantFilesPages(sections)}
${taskPages(sections)}
${closingPage(sections)}

</body>
</html>`;
}

// ============================================================================
// PAGE BUILDERS
// ============================================================================

function coverPage(state: ResearchState, sections: TaskSections, date: string): string {
  const phaseCount = sections.phases.length;
  const totalTasks = sections.phases.reduce((sum, p) => sum + p.tasks.reduce((s, t) => s + t.subtasks.length, 0), 0);

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
    <div class="cover-title">${esc(sections.title)}</div>
    <div class="cover-subtitle">Implementation task list generated from the Pre-RC Method PRD for ${esc(state.projectName)}.</div>
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><div class="cm-label">Client</div><div class="cm-value">${esc(state.brief.name)}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Status</div><div class="cm-value">Draft</div></div>
      <div class="cover-meta-item"><div class="cm-label">Phases</div><div class="cm-value">${phaseCount}</div></div>
      <div class="cover-meta-item"><div class="cm-label">Sub-tasks</div><div class="cm-value">${totalTasks}</div></div>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-left">Pre-RC Method Agent Output &mdash; Implementation Tasks</div>
    <div class="geo-bottom"><span></span><span></span><span></span></div>
  </div>
  <div style="padding: 0 72px 16px; position: relative; z-index: 1;">
    <div style="font-size: 7px; line-height: 1.5; color: #bbb; font-style: italic; max-width: 520px;">Generated with AI assistance via the Pre-RC Method Agent in collaboration with human-in-the-loop strategic direction. The Pre-RC Method Agent is a product of Toerana.</div>
  </div>
</div>`;
}

function relevantFilesPages(sections: TaskSections): string {
  if (!sections.relevantFiles || sections.relevantFiles.length === 0) return '';

  const pages: string[] = [];
  const catsPerPage = 4;
  let pageNum = 2;
  let isFirst = true;

  for (let i = 0; i < sections.relevantFiles.length; i += catsPerPage) {
    const chunk = sections.relevantFiles.slice(i, i + catsPerPage);

    const categoriesHtml = chunk
      .map((cat) => {
        const fileRows = cat.files
          .map((f) => `<tr><td class="file-path">${esc(f.path)}</td><td>${esc(f.description)}</td></tr>`)
          .join('\n          ');

        return `<div class="mod-header">${esc(cat.category)}</div>
      <table>
        <thead><tr><th style="width:320px">File</th><th>Description</th></tr></thead>
        <tbody>
          ${fileRows}
        </tbody>
      </table>`;
      })
      .join('\n\n      ');

    const sectionHeader = isFirst
      ? `<span class="sn">01</span>
      <div class="st">Relevant Files</div>
      <div class="sd"></div>

      `
      : '';

    pages.push(`<!-- RELEVANT FILES (page ${pageNum}) -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    ${sectionHeader}${categoriesHtml}
  </div>
  ${pageFooter(pageNum)}
</div>`);

    pageNum++;
    isFirst = false;
  }

  return pages.join('\n\n');
}

function taskPages(sections: TaskSections): string {
  const pages: string[] = [];
  let pageNum = sections.relevantFiles.length > 0 ? 2 + Math.ceil(sections.relevantFiles.length / 4) : 2;
  const sectionNum = sections.relevantFiles.length > 0 ? 2 : 1;
  let isFirstTask = true;

  // Each phase gets its own page(s)
  for (const phase of sections.phases) {
    const sectionHeader = isFirstTask
      ? `<span class="sn">${String(sectionNum).padStart(2, '0')}</span>
      <div class="st">Implementation Tasks</div>
      <div class="sd"></div>

      `
      : '';

    const phaseHeader = `<div class="phase-header">
        <div class="phase-id">${esc(phase.id)}</div>
        <div class="phase-name">${esc(phase.name)}</div>
        ${phase.timeline ? `<div class="phase-timeline">${esc(phase.timeline)}</div>` : ''}
      </div>`;

    const tasksHtml = phase.tasks
      .map((task) => {
        const subtaskRows = task.subtasks
          .map(
            (st) =>
              `<tr>
            <td class="st-check"><div class="checkbox"></div></td>
            <td class="st-id">${esc(st.id)}</td>
            <td>${esc(st.description)}</td>
          </tr>`,
          )
          .join('\n          ');

        return `<div class="task-block">
        <div class="task-header">
          <div class="checkbox"></div>
          <span class="task-id">${esc(task.id)}</span>
          <span class="task-name">${esc(task.name)}</span>
        </div>
        <table class="subtask-table">
          <tbody>
            ${subtaskRows}
          </tbody>
        </table>
      </div>`;
      })
      .join('\n\n      ');

    pages.push(`<!-- TASKS: ${esc(phase.name)} (page ${pageNum}) -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    ${sectionHeader}${phaseHeader}
      ${tasksHtml}
  </div>
  ${pageFooter(pageNum)}
</div>`);

    pageNum++;
    isFirstTask = false;
  }

  return pages.join('\n\n');
}

function closingPage(sections: TaskSections): string {
  const totalParent = sections.phases.reduce((s, p) => s + p.tasks.length, 0);
  const totalSub = sections.phases.reduce((s, p) => s + p.tasks.reduce((ss, t) => ss + t.subtasks.length, 0), 0);

  return `<!-- CLOSING -->
<div class="page">
  ${pageHeader()}
  <div class="pc">
    <span class="sn" style="margin-top:40px">Summary</span>
    <div class="st">Task Overview</div>
    <div class="sd"></div>

    <div class="metrics">
      <div class="metric"><div class="metric-label">Phases</div><div class="metric-val">${sections.phases.length}</div><div class="metric-note">Implementation phases</div></div>
      <div class="metric"><div class="metric-label">Parent Tasks</div><div class="metric-val">${totalParent}</div><div class="metric-note">Top-level work items</div></div>
      <div class="metric"><div class="metric-label">Sub-tasks</div><div class="metric-val">${totalSub}</div><div class="metric-note">Actionable steps</div></div>
    </div>

    <div class="insight">
      <div class="insight-label">Usage Instructions</div>
      <p>As you complete each task, check it off. Update this document after completing each sub-task, not just after completing an entire parent task. Task 0.0 (Project setup) should always be completed first.</p>
    </div>

    <div class="insight" style="border-left-color: var(--gold);">
      <div class="insight-label" style="color: var(--gold);">RC Method Handoff</div>
      <p>This task list was generated from the Pre-RC Method PRD. For structured implementation, feed the PRD into the RC Method pipeline (rc_start &rarr; rc_define &rarr; rc_architect &rarr; rc_sequence &rarr; rc_forge_task). Alternatively, use this task list directly for implementation.</p>
    </div>

    <div style="text-align:center;margin-top:60px;padding-top:20px;border-top:2px solid var(--navy);">
      <div style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:8px;">End of Document</div>
      <div class="geo-bottom" style="justify-content:center;display:flex;"><span></span><span></span><span></span></div>
    </div>
  </div>
  ${pageFooter('*')}
</div>`;
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function pageHeader(): string {
  return `<div class="ph"><div class="ph-l">Tasks &mdash; Pre-RC Method Agent</div><div class="ph-r">Confidential</div></div>`;
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

// ============================================================================
// STYLESHEET (embedded - same visual language as PRD deck)
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
  .cover-title { font-family: 'Playfair Display', Georgia, serif; font-size: 40px; font-weight: 700; color: var(--navy); line-height: 1.12; margin-bottom: 16px; letter-spacing: -0.5px; }
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

  /* ===== TABLES ===== */
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11.5px; }
  thead th { background: var(--navy); color: var(--white); font-weight: 600; text-align: left; padding: 8px 12px; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--mid-gray); vertical-align: top; line-height: 1.5; }
  tbody td:first-child, thead th:first-child { white-space: nowrap; }
  tbody tr:nth-child(even) { background: var(--light-gray); }

  /* ===== METRICS ===== */
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--mid-gray); margin: 24px 0; }
  .metric { padding: 20px 14px; text-align: center; border-right: 1px solid var(--mid-gray); }
  .metric:last-child { border-right: none; }
  .metric-val { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: var(--navy); line-height: 1; margin-bottom: 4px; }
  .metric-label { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
  .metric-note { font-size: 11px; font-weight: 600; color: var(--gold); }

  /* ===== INSIGHT BOX ===== */
  .insight { border-left: 3px solid var(--navy); padding: 14px 20px; margin: 20px 0; background: var(--light-gray); }
  .insight-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--navy); margin-bottom: 6px; }
  .insight p { font-size: 12.5px; color: #555; margin-bottom: 0; }

  /* ===== MODULE HEADER ===== */
  .mod-header { background: var(--navy); color: var(--white); padding: 8px 14px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 24px 0 0; }

  /* ===== FILE PATH ===== */
  .file-path { font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; color: var(--navy); }

  /* ===== PHASE HEADER ===== */
  .phase-header {
    background: linear-gradient(135deg, var(--navy) 0%, #2a3f6a 100%);
    color: var(--white);
    padding: 16px 20px;
    margin: 24px 0 16px;
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .phase-header:first-child { margin-top: 0; }
  .phase-id { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7; }
  .phase-name { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 700; flex: 1; }
  .phase-timeline { font-size: 11px; font-weight: 600; color: var(--gold); background: rgba(255,255,255,0.1); padding: 3px 10px; border-radius: 2px; }

  /* ===== TASK BLOCK ===== */
  .task-block { margin: 16px 0; }
  .task-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--light-gray);
    border-left: 3px solid var(--gold);
  }
  .task-id { font-size: 12px; font-weight: 700; color: var(--navy); min-width: 36px; }
  .task-name { font-size: 13px; font-weight: 600; color: var(--charcoal); }

  /* ===== CHECKBOX ===== */
  .checkbox {
    width: 14px;
    height: 14px;
    border: 2px solid var(--navy);
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ===== SUBTASK TABLE ===== */
  .subtask-table { margin: 0; }
  .subtask-table tbody td { padding: 6px 12px; font-size: 11.5px; }
  .subtask-table .st-check { width: 30px; text-align: center; }
  .subtask-table .st-id { width: 48px; font-weight: 600; color: var(--navy); font-size: 11px; }

  @media print { body { background: white; } .page { box-shadow: none; margin: 0; } }
</style>`;
