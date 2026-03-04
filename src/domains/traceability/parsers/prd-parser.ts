import { RequirementCategory } from '../types.js';
import type { ParsedRequirement } from '../types.js';

// Keyword -> category mapping for section heading classification
const CATEGORY_KEYWORDS: Record<string, RequirementCategory> = {
  security: RequirementCategory.SEC,
  auth: RequirementCategory.SEC,
  encryption: RequirementCategory.SEC,
  credential: RequirementCategory.SEC,
  performance: RequirementCategory.PERF,
  speed: RequirementCategory.PERF,
  latency: RequirementCategory.PERF,
  scalab: RequirementCategory.PERF,
  monitor: RequirementCategory.OBS,
  observ: RequirementCategory.OBS,
  log: RequirementCategory.OBS,
  alert: RequirementCategory.OBS,
  metric: RequirementCategory.OBS,
  data: RequirementCategory.DATA,
  database: RequirementCategory.DATA,
  schema: RequirementCategory.DATA,
  model: RequirementCategory.DATA,
  storage: RequirementCategory.DATA,
  integrat: RequirementCategory.INT,
  api: RequirementCategory.INT,
  webhook: RequirementCategory.INT,
  external: RequirementCategory.INT,
  endpoint: RequirementCategory.INT,
  accessib: RequirementCategory.UX,
  ux: RequirementCategory.UX,
  ui: RequirementCategory.UX,
  interface: RequirementCategory.UX,
  display: RequirementCategory.UX,
  business: RequirementCategory.BIZ,
  rule: RequirementCategory.BIZ,
  policy: RequirementCategory.BIZ,
  compliance: RequirementCategory.BIZ,
  legal: RequirementCategory.BIZ,
};

// Modal verbs and patterns that indicate a requirement statement
const REQUIREMENT_PATTERNS = [
  /\b(must|shall|should|will|needs?\s+to)\b/i,
  /\b(required|mandatory|essential)\b/i,
  /\baccept(ance)?\s+(criter|test)/i,
  /^\s*-\s*\[[\s x]\]/i, // Checkbox items (acceptance criteria)
];

interface Section {
  heading: string;
  level: number;
  content: string;
  category: RequirementCategory;
}

function classifySection(heading: string): RequirementCategory {
  const lower = heading.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  return RequirementCategory.FUNC;
}

function parseSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const heading = headingMatch[2].trim();
      currentSection = {
        heading,
        level: headingMatch[1].length,
        content: '',
        category: classifySection(heading),
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

function isRequirementLine(line: string): boolean {
  return REQUIREMENT_PATTERNS.some((pattern) => pattern.test(line));
}

function extractRequirementsFromSection(section: Section): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];
  const lines = section.content.split('\n');

  // Strategy 1: Extract checkbox items (acceptance criteria)
  for (const line of lines) {
    const checkboxMatch = line.match(/^\s*-\s*\[[\s x]\]\s*(.+)/i);
    if (checkboxMatch) {
      const text = checkboxMatch[1].trim();
      requirements.push({
        title: text.length > 80 ? text.slice(0, 80) + '...' : text,
        description: text,
        sourceSection: section.heading,
        suggestedCategory: section.category,
      });
    }
  }

  // Strategy 2: Extract bullet points with modal verbs (if no checkboxes found)
  if (requirements.length === 0) {
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (bulletMatch && isRequirementLine(bulletMatch[1])) {
        const text = bulletMatch[1].trim();
        requirements.push({
          title: text.length > 80 ? text.slice(0, 80) + '...' : text,
          description: text,
          sourceSection: section.heading,
          suggestedCategory: section.category,
        });
      }
    }
  }

  // Strategy 3: Extract sentences with modal verbs from paragraph text
  if (requirements.length === 0) {
    const sentences = section.content
      .replace(/\n/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      if (isRequirementLine(sentence)) {
        const text = sentence.trim();
        requirements.push({
          title: text.length > 80 ? text.slice(0, 80) + '...' : text,
          description: text,
          sourceSection: section.heading,
          suggestedCategory: section.category,
        });
      }
    }
  }

  return requirements;
}

/**
 * Parse a PRD markdown document and extract structured requirements.
 * Returns an array of parsed requirements with suggested categories.
 */
export function parsePrd(markdown: string): ParsedRequirement[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const sections = parseSections(markdown);
  const allRequirements: ParsedRequirement[] = [];

  // Skip metadata/header sections that don't contain requirements
  const skipSections =
    /^(prd|rc method|status|owner|created|last updated|token budget|metadata|split detection|ux child)/i;

  for (const section of sections) {
    if (skipSections.test(section.heading)) {
      continue;
    }
    const sectionReqs = extractRequirementsFromSection(section);
    allRequirements.push(...sectionReqs);
  }

  return allRequirements;
}
