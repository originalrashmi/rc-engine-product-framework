import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatePlaybook } from '../generators/playbook-generator.js';
import { generatePrintableHtml } from '../generators/pdf-export.js';
import fs from 'node:fs';
import path from 'node:path';

export function registerExportTools(server: McpServer): void {
  // playbook_generate - Aggregate all pipeline artifacts into master playbook
  server.registerTool(
    'playbook_generate',
    {
      description:
        'Generate the Project Playbook / Architecture Decision Record (ARD). Aggregates ALL pipeline outputs — research, PRD, design decisions, architecture, implementation plan, quality/security findings, traceability matrix — into a single comprehensive markdown document. This is the master deliverable that a non-technical user can hand to a development team. Saves to rc-method/PLAYBOOK-{name}.md. Requires at least one pipeline phase to have been completed.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        project_name: z.string().optional().describe('Human-readable project name (defaults to directory name)'),
      },
      annotations: {
        title: 'Generate Playbook',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ project_path, project_name }) => {
      try {
        const name = project_name ?? path.basename(project_path);

        const result = generatePlaybook({
          projectPath: project_path,
          projectName: name,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Playbook generated successfully.\n\nSaved to: \`${result.savedPath}\`\nSize: ${(result.markdown.length / 1024).toFixed(1)} KB\n\nThe playbook contains all available pipeline artifacts organized into 10 sections:\n1. Executive Summary\n2. Research Findings\n3. Product Requirements\n4. Design Decisions\n5. Architecture Decisions\n6. Implementation Plan\n7. Quality & Security\n8. Traceability Matrix\n9. Cost & Value Summary\n10. Artifact Index\n\nNext steps:\n- "pdf_export" to generate a print-ready HTML version\n- Share the markdown with your team or feed into documentation tools`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // pdf_export - Convert markdown artifacts to print-ready HTML
  server.registerTool(
    'pdf_export',
    {
      description:
        'Export project artifacts as a professional, print-ready HTML document. Converts one or more markdown files into styled HTML with a cover page, section headers, and @media print rules. Users open the HTML in a browser and use Cmd+P / Ctrl+P to save as PDF. Supports any markdown file in the project (PRDs, playbook, design briefs, reports). Saves the HTML to rc-method/exports/.',
      inputSchema: {
        project_path: z.string().describe('Absolute path to the project directory'),
        files: z
          .array(z.string())
          .optional()
          .describe(
            'Relative paths of files to export (e.g. ["rc-method/prds/PRD-myapp.md", "rc-method/PLAYBOOK-myapp.md"]). If omitted, exports the playbook if it exists, or all PRDs.',
          ),
        title: z.string().optional().describe('Document title (defaults to project directory name)'),
        subtitle: z.string().optional().describe('Document subtitle'),
      },
      annotations: {
        title: 'PDF Export',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ project_path, files, title, subtitle }) => {
      try {
        // Auto-detect files if not specified
        let filesToExport = files ?? [];
        if (filesToExport.length === 0) {
          filesToExport = autoDetectExportFiles(project_path);
        }

        if (filesToExport.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No exportable files found. Run pipeline tools first (rc_define, ux_design, playbook_generate) to generate artifacts, then call pdf_export again.',
              },
            ],
            isError: true,
          };
        }

        const html = generatePrintableHtml({
          projectPath: project_path,
          files: filesToExport,
          title,
          subtitle,
        });

        // Save the HTML file
        const exportDir = path.join(project_path, 'rc-method', 'exports');
        fs.mkdirSync(exportDir, { recursive: true });

        const safeName = (title ?? path.basename(project_path))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const outputPath = path.join(exportDir, `${safeName}-export.html`);
        fs.writeFileSync(outputPath, html, 'utf-8');

        const relativePath = `rc-method/exports/${safeName}-export.html`;

        return {
          content: [
            {
              type: 'text' as const,
              text: `PDF-ready HTML exported successfully.\n\nSaved to: \`${relativePath}\`\nSize: ${(html.length / 1024).toFixed(1)} KB\nDocuments included: ${filesToExport.length}\n\nFiles exported:\n${filesToExport.map((f) => `  - ${f}`).join('\n')}\n\nTo create PDF:\n1. Open the HTML file in a browser\n2. Press Ctrl+P (Windows/Linux) or Cmd+P (Mac)\n3. Select "Save as PDF" as the printer\n4. Click Save`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

/** Auto-detect exportable files in priority order */
function autoDetectExportFiles(projectPath: string): string[] {
  const candidates: string[] = [];

  // 1. Playbook (highest priority — contains everything)
  const rcMethodDir = path.join(projectPath, 'rc-method');
  if (fs.existsSync(rcMethodDir)) {
    try {
      const playbooks = fs.readdirSync(rcMethodDir).filter((f) => f.startsWith('PLAYBOOK-') && f.endsWith('.md'));
      if (playbooks.length > 0) {
        return playbooks.map((f) => `rc-method/${f}`);
      }
    } catch {
      /* continue */
    }
  }

  // 2. PRDs
  const prdDir = path.join(projectPath, 'rc-method', 'prds');
  if (fs.existsSync(prdDir)) {
    try {
      const prds = fs.readdirSync(prdDir).filter((f) => f.endsWith('.md'));
      candidates.push(...prds.map((f) => `rc-method/prds/${f}`));
    } catch {
      /* continue */
    }
  }

  // 3. Design briefs
  const designDir = path.join(projectPath, 'rc-method', 'design');
  if (fs.existsSync(designDir)) {
    try {
      const designs = fs.readdirSync(designDir).filter((f) => f.endsWith('.md'));
      candidates.push(...designs.map((f) => `rc-method/design/${f}`));
    } catch {
      /* continue */
    }
  }

  // 4. Copy system
  const copyDir = path.join(projectPath, 'rc-method', 'copy');
  if (fs.existsSync(copyDir)) {
    try {
      const copies = fs.readdirSync(copyDir).filter((f) => f.endsWith('.md'));
      candidates.push(...copies.map((f) => `rc-method/copy/${f}`));
    } catch {
      /* continue */
    }
  }

  return candidates;
}
