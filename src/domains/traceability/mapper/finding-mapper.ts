import { RequirementCategory } from '../types.js';
import type { Requirement, ParsedFinding, ParsedTask, TraceSummary } from '../types.js';

// Module -> RequirementCategory mapping for Post-RC findings
const MODULE_TO_CATEGORY: Record<string, RequirementCategory> = {
  security: RequirementCategory.SEC,
  monitoring: RequirementCategory.OBS,
  observability: RequirementCategory.OBS,
  performance: RequirementCategory.PERF,
};

/**
 * Map Post-RC findings to requirement IDs.
 * Uses category matching (security -> PRD-SEC) and keyword content matching.
 */
export function mapFindingsToRequirements(findings: ParsedFinding[], requirements: Requirement[]): void {
  for (const finding of findings) {
    // Strategy 1: Match by module -> category
    const category = MODULE_TO_CATEGORY[finding.module.toLowerCase()];
    if (category) {
      const categoryReqs = requirements.filter((r) => r.category === category);
      for (const req of categoryReqs) {
        // Check keyword overlap between finding and requirement
        if (hasKeywordOverlap(finding.title + ' ' + finding.description, req.title + ' ' + req.description)) {
          if (!req.mappedFindings.includes(finding.id)) {
            req.mappedFindings.push(finding.id);
          }
          // Update verification result based on finding severity
          if (finding.severity === 'critical' || finding.severity === 'high') {
            req.verificationResult = 'fail';
            req.status = 'failed';
          } else if (req.verificationResult === 'untested') {
            req.verificationResult = 'pass';
            req.status = 'verified';
          }
        }
      }
    }

    // Strategy 2: If no category match, try content-based matching across all requirements
    if (!category || !requirements.some((r) => r.mappedFindings.includes(finding.id))) {
      for (const req of requirements) {
        if (hasKeywordOverlap(finding.title + ' ' + finding.description, req.title + ' ' + req.description)) {
          if (!req.mappedFindings.includes(finding.id)) {
            req.mappedFindings.push(finding.id);
          }
          if (finding.severity === 'critical' || finding.severity === 'high') {
            req.verificationResult = 'fail';
            req.status = 'failed';
          } else if (req.verificationResult === 'untested') {
            req.verificationResult = 'pass';
            req.status = 'verified';
          }
        }
      }
    }
  }
}

/**
 * Map RC Method tasks to requirement IDs.
 * Uses content/description matching and PRD criteria references.
 */
export function mapTasksToRequirements(tasks: ParsedTask[], requirements: Requirement[]): void {
  for (const task of tasks) {
    // Strategy 1: Match by explicit PRD criteria reference
    if (task.prdCriteria) {
      for (const req of requirements) {
        // Check if task references this requirement's feature or criteria
        if (hasKeywordOverlap(task.prdCriteria, req.sourceSection) || hasKeywordOverlap(task.prdCriteria, req.title)) {
          if (!req.mappedTasks.includes(task.id)) {
            req.mappedTasks.push(task.id);
          }
          if (req.status === 'unimplemented') {
            req.status = 'implemented';
          }
        }
      }
    }

    // Strategy 2: Content-based matching
    for (const req of requirements) {
      if (hasKeywordOverlap(task.description, req.title + ' ' + req.description)) {
        if (!req.mappedTasks.includes(task.id)) {
          req.mappedTasks.push(task.id);
        }
        if (req.status === 'unimplemented') {
          req.status = 'implemented';
        }
      }
    }
  }
}

/**
 * Calculate coverage metrics and orphan lists from the current state of requirements.
 */
export function calculateCoverage(requirements: Requirement[], tasks: ParsedTask[]): TraceSummary {
  const totalRequirements = requirements.length;
  const implemented = requirements.filter((r) => r.status !== 'unimplemented').length;
  const verified = requirements.filter((r) => r.verificationResult === 'pass').length;
  const failed = requirements.filter((r) => r.verificationResult === 'fail').length;

  // Orphan requirements: no mapped tasks
  const orphanRequirements = requirements.filter((r) => r.mappedTasks.length === 0).map((r) => r.id);

  // Orphan tasks: not mapped to any requirement
  const mappedTaskIds = new Set(requirements.flatMap((r) => r.mappedTasks));
  const orphanTasks = tasks.filter((t) => !mappedTaskIds.has(t.id)).map((t) => t.id);

  const coveragePercent = totalRequirements > 0 ? Math.round(((verified + failed) / totalRequirements) * 100) : 0;

  return {
    totalRequirements,
    implemented,
    verified,
    failed,
    orphanRequirements,
    orphanTasks,
    coveragePercent,
  };
}

/**
 * Check if two text strings share meaningful keywords.
 * Simple implementation: tokenize, filter stop words, check intersection.
 */
function hasKeywordOverlap(textA: string, textB: string): boolean {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'must',
    'need',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'and',
    'or',
    'but',
    'not',
    'no',
    'nor',
    'so',
    'yet',
    'both',
    'each',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'than',
    'too',
    'very',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
  ]);

  const tokenize = (text: string): Set<string> => {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w)),
    );
  };

  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap++;
    }
  }

  // Require at least 2 meaningful keyword matches
  return overlap >= 2;
}
