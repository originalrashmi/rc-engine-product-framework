import { RequirementCategory } from '../types.js';
import type { ParsedRequirement, Requirement } from '../types.js';

/**
 * Assign deterministic stable IDs to parsed requirements.
 * Algorithm:
 * 1. Group by category
 * 2. Within each group, maintain order as they appeared in the PRD (by sourceSection order)
 * 3. Assign sequential numbers: PRD-{CAT}-001, PRD-{CAT}-002, etc.
 *
 * Same input always produces same output (deterministic).
 */
export function assignIds(parsedRequirements: ParsedRequirement[]): Requirement[] {
  if (parsedRequirements.length === 0) {
    return [];
  }

  // Group by category, preserving order within each group
  const groups = new Map<RequirementCategory, ParsedRequirement[]>();

  for (const req of parsedRequirements) {
    const group = groups.get(req.suggestedCategory) || [];
    group.push(req);
    groups.set(req.suggestedCategory, group);
  }

  // Process groups in a deterministic order (enum order)
  const categoryOrder: RequirementCategory[] = [
    RequirementCategory.FUNC,
    RequirementCategory.SEC,
    RequirementCategory.PERF,
    RequirementCategory.UX,
    RequirementCategory.DATA,
    RequirementCategory.INT,
    RequirementCategory.OBS,
    RequirementCategory.BIZ,
  ];

  const requirements: Requirement[] = [];

  for (const category of categoryOrder) {
    const group = groups.get(category);
    if (!group || group.length === 0) continue;

    let counter = 1;
    for (const parsed of group) {
      const id = `PRD-${category}-${String(counter).padStart(3, '0')}`;
      requirements.push({
        id,
        category,
        title: parsed.title,
        description: parsed.description,
        acceptanceCriteria: '', // Filled by LLM in autonomous mode or by host IDE in passthrough
        sourceSection: parsed.sourceSection,
        status: 'unimplemented',
        mappedTasks: [],
        mappedFindings: [],
        mappedFiles: [],
        verificationResult: 'untested',
      });
      counter++;
    }
  }

  return requirements;
}
