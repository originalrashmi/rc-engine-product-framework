import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generatePrintableHtml } from '../../web/server/pdf-export.js';

describe('PDF Export', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-pdf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates valid HTML document', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Hello World\n\nThis is a test.');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['test.md'] });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('Hello World');
    expect(html).toContain('This is a test');
  });

  it('includes cover page with project name', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Content');
    const html = generatePrintableHtml({
      projectPath: tmpDir,
      files: ['doc.md'],
      title: 'My Project',
      subtitle: 'Research Report',
    });
    expect(html).toContain('My Project');
    expect(html).toContain('Research Report');
    expect(html).toContain('cover-title');
    expect(html).toContain('RC Engine');
  });

  it('includes print styles', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Test');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('@media print');
    expect(html).toContain('Ctrl+P');
    expect(html).toContain('Cmd+P');
  });

  it('converts markdown headings to HTML', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# H1\n## H2\n### H3\n#### H4');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).toContain('<h3>H3</h3>');
    expect(html).toContain('<h4>H4</h4>');
  });

  it('converts markdown bold and italic', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'This is **bold** and *italic* text.');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('converts markdown lists', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '- Item 1\n- Item 2\n- Item 3');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Item 1</li>');
    expect(html).toContain('<li>Item 3</li>');
    expect(html).toContain('</ul>');
  });

  it('converts ordered lists', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '1. First\n2. Second\n3. Third');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('</ol>');
  });

  it('converts code blocks', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '```\nconst x = 1;\n```');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('</code></pre>');
  });

  it('converts inline code', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'Use `npm install` to install.');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<code>npm install</code>');
  });

  it('converts blockquotes', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '> Important note here');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<blockquote>');
    expect(html).toContain('Important note here');
  });

  it('converts tables', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '| Name | Value |\n|------|-------|\n| Key | 42 |\n| Other | 99 |');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<td>42</td>');
    expect(html).toContain('</table>');
  });

  it('converts horizontal rules', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'Above\n---\nBelow');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<hr>');
  });

  it('escapes HTML in content', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'Use <div> and & "quotes"');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('&lt;div&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quotes&quot;');
  });

  it('handles multiple files with section badges', () => {
    fs.writeFileSync(path.join(tmpDir, 'first.md'), '# First Doc');
    fs.writeFileSync(path.join(tmpDir, 'second.md'), '# Second Doc');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['first.md', 'second.md'] });
    expect(html).toContain('first.md');
    expect(html).toContain('second.md');
    expect(html).toContain('section-badge');
  });

  it('adds page breaks between sections', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), '# B');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['a.md', 'b.md'] });
    expect(html).toContain('page-break');
  });

  it('blocks path traversal', () => {
    fs.writeFileSync(path.join(tmpDir, 'safe.md'), 'safe content');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['../../../etc/passwd', 'safe.md'] });
    expect(html).not.toContain('root:');
    expect(html).toContain('safe content');
  });

  it('returns fallback for missing files', () => {
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['nonexistent.md'] });
    expect(html).toContain('No files found');
  });

  it('shows document count on cover', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), '# B');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['a.md', 'b.md'] });
    expect(html).toContain('2 documents');
  });

  it('converts markdown links', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), 'Visit [Google](https://google.com) for search.');
    const html = generatePrintableHtml({ projectPath: tmpDir, files: ['doc.md'] });
    expect(html).toContain('<a href="https://google.com">Google</a>');
  });
});
