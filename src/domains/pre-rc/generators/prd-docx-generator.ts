/**
 * McKinsey-format PRD Document Generator
 * Toerana Design System - Playfair Display + Inter, gold accents, navy headers
 *
 * Generates a professional Word document from the synthesized PRD content.
 * Called automatically by prc_synthesize after PRD markdown is generated.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  ShadingType,
  PageBreak,
  convertInchesToTwip,
} from 'docx';
import * as fs from 'fs';

// --- Design Tokens ---

const NAVY = '0B1D3A';
const GOLD = 'C8A25C';
const WHITE = 'FFFFFF';
const GRAY_700 = '374151';
const GRAY_500 = '6B7280';
const GREEN = '059669';
const RED_SOFT = 'DC2626';
const AMBER = 'D97706';
const ZEBRA = 'F9FAFB';

const FONT_HEADING = 'Playfair Display';
const FONT_BODY = 'Inter';

// --- Helpers ---

function styledRun(
  text: string,
  opts: {
    font?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
  } = {},
): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? FONT_BODY,
    size: (opts.size ?? 10) * 2, // docx uses half-points
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    color: opts.color ?? GRAY_700,
  });
}

function headingParagraph(text: string, level: 1 | 2 | 3 = 1): Paragraph[] {
  const size = { 1: 22, 2: 15, 3: 12 }[level];
  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { before: level === 1 ? 560 : 320, after: 80 },
      children: [styledRun(text, { font: FONT_HEADING, size, bold: true, color: NAVY })],
    }),
  ];

  if (level === 1) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 0, after: 200 },
        children: [styledRun('\u2501'.repeat(40), { size: 8, color: GOLD })],
      }),
    );
  }

  return paragraphs;
}

function bodyParagraph(
  text: string,
  opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 120, line: 300 },
    children: [
      styledRun(text, {
        size: opts.size ?? 10,
        bold: opts.bold,
        italic: opts.italic,
        color: opts.color,
      }),
    ],
  });
}

function calloutBox(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.SOLID, color: 'F5EEDC' },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    children: [styledRun(text, { size: 9, color: NAVY })],
  });
}

function bulletItem(text: string, size = 9): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 40 },
    indent: { left: convertInchesToTwip(0.3) },
    children: [styledRun(`\u2022  ${text}`, { size, color: GRAY_700 })],
  });
}

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' };

function styledTable(headers: string[], rows: string[][], opts: { boldCols?: number[]; tagCol?: number } = {}): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: NAVY },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [styledRun(h, { size: 8, bold: true, color: WHITE })],
            }),
          ],
        }),
    ),
  });

  const dataRows = rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map((cellText, colIdx) => {
          const isZebra = rowIdx % 2 === 0;
          const isBold = opts.boldCols?.includes(colIdx) ?? false;

          let color = GRAY_700;
          let cellBold = isBold;
          if (opts.tagCol !== undefined && colIdx === opts.tagCol) {
            cellBold = true;
            if (cellText.includes('Must')) color = GREEN;
            else if (cellText.includes('Should')) color = AMBER;
            else if (cellText.includes('Nice') || cellText.includes("Won't")) color = RED_SOFT;
          }

          return new TableCell({
            shading: isZebra ? { type: ShadingType.SOLID, color: ZEBRA } : undefined,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  styledRun(cellText, {
                    size: 8.5,
                    bold: cellBold,
                    color,
                  }),
                ],
              }),
            ],
          });
        }),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
      insideHorizontal: thinBorder,
      insideVertical: thinBorder,
    },
  });
}

// --- PRD Section Parsers ---

interface PrdSection {
  title: string;
  content: string;
}

function parsePrdSections(markdown: string): PrdSection[] {
  const sections: PrdSection[] = [];
  const lines = markdown.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (h2Match) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = `${h2Match[1]}. ${h2Match[2]}`;
      currentContent = [];
      continue;
    }
    if (currentTitle) {
      currentContent.push(line);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }

  // Fallback: if numbered sections found fewer than 10, try matching any ## heading
  if (sections.length < 10) {
    const fallbackSections: PrdSection[] = [];
    let fbTitle = '';
    let fbContent: string[] = [];

    for (const line of lines) {
      const h2Any = line.match(/^##\s+(.+?)\s*$/);
      if (h2Any) {
        if (fbTitle) {
          fallbackSections.push({ title: fbTitle, content: fbContent.join('\n').trim() });
        }
        fbTitle = h2Any[1];
        fbContent = [];
        continue;
      }
      if (fbTitle) {
        fbContent.push(line);
      }
    }
    if (fbTitle) {
      fallbackSections.push({ title: fbTitle, content: fbContent.join('\n').trim() });
    }

    if (fallbackSections.length > sections.length) {
      console.error(
        `[prd-docx] Numbered heading parse found ${sections.length} sections; fallback found ${fallbackSections.length}. Using fallback.`,
      );
      return fallbackSections;
    }
  }

  return sections;
}

// --- Main Generator ---

export interface DocxGeneratorInput {
  projectName: string;
  prdContent: string;
  researchTokens: number;
  synthesisTokens: number;
  personaCount: number;
  stageCount: number;
  cynefinDomain?: string;
  productClass?: string;
}

export async function generatePrdDocx(input: DocxGeneratorInput, outputPath: string): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // - COVER PAGE --

  for (let i = 0; i < 5; i++) {
    children.push(new Paragraph({ children: [] }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [styledRun('\u2501'.repeat(21), { size: 14, color: GOLD })],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280 },
      children: [styledRun(input.projectName.toUpperCase(), { font: FONT_HEADING, size: 36, bold: true, color: NAVY })],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
      children: [styledRun('Product Requirements Document', { size: 14, color: GOLD })],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280 },
      children: [styledRun('\u2501'.repeat(21), { size: 14, color: GOLD })],
    }),
  );

  const metaLines = [
    `Prepared by: Pre-RC Research Agent (${input.personaCount} Research Specialists)`,
    `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Cynefin Domain: ${input.cynefinDomain ?? 'N/A'} | Product Class: ${input.productClass ?? 'N/A'}`,
    '',
    'Research Basis:',
    `   ${input.personaCount} research specialists`,
    `   ${(input.researchTokens + input.synthesisTokens).toLocaleString()} units of multi-LLM research`,
    `   ${input.stageCount} research stages + 3 quality checkpoints`,
  ];

  for (const line of metaLines) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
        children: [styledRun(line, { size: 9, color: GRAY_500 })],
      }),
    );
  }

  for (let i = 0; i < 4; i++) {
    children.push(new Paragraph({ children: [] }));
  }

  // Toerana disclaimer
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: 'F5EEDC' },
      spacing: { before: 200, after: 80 },
      children: [styledRun('TOERANA', { font: FONT_HEADING, size: 11, bold: true, color: NAVY })],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: 'F5EEDC' },
      spacing: { before: 0, after: 200 },
      children: [
        styledRun(
          'This document is confidential and intended solely for the named recipients. ' +
            'It contains proprietary product specifications and strategic analysis. ' +
            'Do not distribute without authorization.',
          { size: 7, color: GRAY_500 },
        ),
      ],
    }),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // - PARSE AND RENDER PRD SECTIONS --

  const sections = parsePrdSections(input.prdContent);

  for (const section of sections) {
    children.push(...headingParagraph(section.title, 1));

    const contentLines = section.content.split('\n');
    let i = 0;

    while (i < contentLines.length) {
      const line = contentLines[i];

      if (!line.trim()) {
        i++;
        continue;
      }

      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        children.push(...headingParagraph(h3Match[1], 2));
        i++;
        continue;
      }

      const h4Match = line.match(/^####\s+(.+)$/);
      if (h4Match) {
        children.push(...headingParagraph(h4Match[1], 3));
        i++;
        continue;
      }

      if (line.includes('|') && line.trim().startsWith('|')) {
        const tableLines: string[] = [];
        while (i < contentLines.length && contentLines[i].includes('|') && contentLines[i].trim().startsWith('|')) {
          tableLines.push(contentLines[i]);
          i++;
        }

        if (tableLines.length >= 2) {
          const parseRow = (row: string): string[] =>
            row
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim());

          const headers = parseRow(tableLines[0]);
          const startIdx = tableLines[1].includes('---') ? 2 : 1;
          const dataRows = tableLines.slice(startIdx).map(parseRow);

          if (headers.length > 0 && dataRows.length > 0) {
            children.push(styledTable(headers, dataRows, { boldCols: [0] }));
            children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
          }
        }
        continue;
      }

      if (line.match(/^\s*[-*]\s+/)) {
        const bulletText = line.replace(/^\s*[-*]\s+/, '').trim();
        children.push(bulletItem(bulletText));
        i++;
        continue;
      }

      if (line.startsWith('>')) {
        const quoteText = line.replace(/^>\s*/, '').trim();
        if (quoteText) {
          children.push(calloutBox(quoteText));
        }
        i++;
        continue;
      }

      const boldMatch = line.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        children.push(bodyParagraph(boldMatch[1], { bold: true }));
        i++;
        continue;
      }

      children.push(bodyParagraph(line.replace(/\*\*/g, '')));
      i++;
    }
  }

  // - RESEARCH SUMMARY --

  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(...headingParagraph('Pre-RC Research Summary', 1));

  children.push(
    calloutBox(
      `This PRD was synthesized from ${(input.researchTokens + input.synthesisTokens).toLocaleString()} units ` +
        `of research conducted by ${input.personaCount} research specialists across ` +
        `${input.stageCount} stages, using multi-LLM orchestration. The Cynefin classification ` +
        `identified the ${input.cynefinDomain ?? 'N/A'} domain, guiding appropriate research depth.`,
    ),
  );

  children.push(
    styledTable(
      ['Phase', 'AI Usage', 'Provider'],
      [
        [`Research (${input.personaCount} specialists)`, input.researchTokens.toLocaleString(), 'Multi-LLM'],
        ['Analysis & Synthesis', input.synthesisTokens.toLocaleString(), 'Claude'],
        ['Total Pre-RC', (input.researchTokens + input.synthesisTokens).toLocaleString(), '\u2014'],
      ],
      { boldCols: [0] },
    ),
  );

  // - CLOSING --

  children.push(new Paragraph({ spacing: { before: 400 }, children: [] }));

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [styledRun('\u2501'.repeat(21), { size: 10, color: GOLD })],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120 },
      children: [
        styledRun(
          `This document was generated by the Pre-RC Research Method using ${input.personaCount} research ` +
            `specialists and ${(input.researchTokens + input.synthesisTokens).toLocaleString()} units of multi-LLM research.`,
          { size: 8, italic: true, color: GRAY_500 },
        ),
      ],
    }),
  );

  // - BUILD DOCUMENT --

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.9),
              right: convertInchesToTwip(0.9),
            },
          },
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: FONT_BODY,
            size: 20,
            color: GRAY_700,
          },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}
