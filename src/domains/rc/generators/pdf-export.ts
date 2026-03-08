/**
 * PDF Export -- Converts markdown artifacts to print-ready HTML.
 *
 * Users open the HTML in a new tab and use Cmd+P / Ctrl+P to print to PDF.
 * Each document gets a professional cover page, table of contents, and
 * styled content with @media print rules.
 */

import fs from 'node:fs';
import path from 'node:path';

interface ExportOptions {
  projectPath: string;
  files: string[]; // Relative paths within the project
  title?: string;
  subtitle?: string;
}

/**
 * Generate a print-ready HTML document from one or more project artifacts.
 */
export function generatePrintableHtml(options: ExportOptions): string {
  const { projectPath, files, title, subtitle } = options;

  const sections: Array<{ filename: string; content: string }> = [];
  for (const file of files) {
    const fullPath = path.resolve(projectPath, file);
    const resolvedProject = path.resolve(projectPath);
    if (!fullPath.startsWith(resolvedProject)) continue; // Security: prevent traversal

    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      sections.push({ filename: path.basename(file), content: raw });
    }
  }

  if (sections.length === 0) {
    return '<html><body><p>No files found to export.</p></body></html>';
  }

  const projectName = title ?? path.basename(projectPath);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const renderedSections = sections
    .map(
      (s, i) => `
    <section class="document-section">
      ${i > 0 ? '<div class="page-break"></div>' : ''}
      <div class="section-header">
        <span class="section-badge">${s.filename}</span>
      </div>
      <div class="markdown-body">
        ${markdownToHtml(s.content)}
      </div>
    </section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(projectName)} - RC Engine Export</title>
  <style>
    /* ── Base Reset ───────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a2e;
      background: #ffffff;
      line-height: 1.7;
      font-size: 14px;
    }

    /* ── Cover Page ──────────────────────────────────────────────── */
    .cover {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 4rem 2rem;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      color: #ffffff;
    }
    .cover-brand { font-size: 0.75rem; letter-spacing: 0.3em; text-transform: uppercase; color: #d4a574; margin-bottom: 2rem; }
    .cover-title { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.75rem; line-height: 1.2; }
    .cover-subtitle { font-size: 1.1rem; color: #94a3b8; margin-bottom: 3rem; }
    .cover-meta { font-size: 0.85rem; color: #64748b; }
    .cover-meta span { display: block; margin-bottom: 0.25rem; }
    .cover-divider { width: 60px; height: 3px; background: #d4a574; margin: 2rem auto; border-radius: 2px; }

    /* ── Content ─────────────────────────────────────────────────── */
    .content { max-width: 800px; margin: 0 auto; padding: 3rem 2rem; }

    .document-section { margin-bottom: 3rem; }
    .section-header { margin-bottom: 1.5rem; }
    .section-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #d4a574;
      background: #fef3e2;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
    }

    /* ── Markdown Styles ─────────────────────────────────────────── */
    .markdown-body h1 { font-size: 1.75rem; font-weight: 700; margin: 2rem 0 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    .markdown-body h2 { font-size: 1.4rem; font-weight: 600; margin: 1.75rem 0 0.75rem; color: #1e293b; }
    .markdown-body h3 { font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #334155; }
    .markdown-body h4 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #475569; }
    .markdown-body p { margin-bottom: 0.75rem; color: #374151; }
    .markdown-body ul, .markdown-body ol { margin: 0.5rem 0 1rem 1.5rem; }
    .markdown-body li { margin-bottom: 0.35rem; color: #374151; }
    .markdown-body strong { font-weight: 600; color: #1e293b; }
    .markdown-body em { font-style: italic; }
    .markdown-body code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.85em;
      background: #f1f5f9;
      padding: 0.15em 0.4em;
      border-radius: 3px;
      color: #7c3aed;
    }
    .markdown-body pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1rem 0;
      font-size: 0.85em;
      line-height: 1.5;
    }
    .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
    .markdown-body blockquote {
      border-left: 3px solid #d4a574;
      padding: 0.5rem 1rem;
      margin: 1rem 0;
      background: #fffbf5;
      color: #78716c;
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.9em;
    }
    .markdown-body th {
      background: #f8fafc;
      font-weight: 600;
      text-align: left;
      padding: 0.5rem 0.75rem;
      border-bottom: 2px solid #e2e8f0;
    }
    .markdown-body td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .markdown-body hr { border: none; height: 1px; background: #e2e8f0; margin: 2rem 0; }

    /* ── Print Styles ────────────────────────────────────────────── */
    .page-break { page-break-before: always; }
    .print-hint {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #1a1a2e;
      color: #d4a574;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 0.8rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 100;
    }
    .print-hint kbd {
      background: rgba(255,255,255,0.15);
      padding: 0.15em 0.4em;
      border-radius: 3px;
      font-family: monospace;
    }

    @media print {
      .print-hint { display: none; }
      .cover { min-height: auto; page-break-after: always; }
      body { font-size: 11pt; }
      .content { max-width: none; padding: 0; }
      .markdown-body pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    <div class="cover-brand">RC Engine</div>
    <h1 class="cover-title">${escapeHtml(projectName)}</h1>
    ${subtitle ? `<p class="cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    <div class="cover-divider"></div>
    <div class="cover-meta">
      <span>Generated ${dateStr}</span>
      <span>${sections.length} document${sections.length > 1 ? 's' : ''}</span>
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    ${renderedSections}
  </div>

  <!-- Print hint (hidden when printing) -->
  <div class="print-hint">
    Press <kbd>Ctrl+P</kbd> / <kbd>Cmd+P</kbd> to save as PDF
  </div>
</body>
</html>`;
}

/**
 * Minimal markdown-to-HTML converter.
 * Handles headings, bold, italic, code, lists, tables, blockquotes, and horizontal rules.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let inList = false;
  let inTable = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        output.push('</code></pre>');
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        output.push('<pre><code>');
      }
      continue;
    }
    if (inCodeBlock) {
      output.push(escapeHtml(line));
      continue;
    }

    // Close open list if non-list line
    if (inList && !line.match(/^\s*[-*+]\s/) && !line.match(/^\s*\d+\.\s/) && line.trim() !== '') {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Close table if non-table line
    if (inTable && !line.includes('|')) {
      output.push('</tbody></table>');
      inTable = false;
    }

    // Blank line
    if (line.trim() === '') {
      if (inList) {
        output.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      output.push('<hr>');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      output.push(`<blockquote><p>${inlineFormat(line.slice(1).trim())}</p></blockquote>`);
      continue;
    }

    // Table rows
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line
        .split('|')
        .filter((c) => c.trim() !== '')
        .map((c) => c.trim());

      // Skip separator rows (|---|---|)
      if (cells.every((c) => c.match(/^[-:]+$/))) continue;

      if (!inTable) {
        inTable = true;
        output.push('<table><thead><tr>');
        for (const cell of cells) {
          output.push(`<th>${inlineFormat(cell)}</th>`);
        }
        output.push('</tr></thead><tbody>');
      } else {
        output.push('<tr>');
        for (const cell of cells) {
          output.push(`<td>${inlineFormat(cell)}</td>`);
        }
        output.push('</tr>');
      }
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList) {
        inList = true;
        listType = 'ul';
        output.push('<ul>');
      }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList) {
        inList = true;
        listType = 'ol';
        output.push('<ol>');
      }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Paragraph
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Close any open blocks
  if (inCodeBlock) output.push('</code></pre>');
  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inTable) output.push('</tbody></table>');

  return output.join('\n');
}

/** Apply inline markdown formatting (bold, italic, code, links) */
function inlineFormat(text: string): string {
  let result = escapeHtml(text);
  // Code (must be before bold/italic to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
