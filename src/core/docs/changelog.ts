/**
 * Changelog Generator
 *
 * Generates structured changelogs from git history and pipeline artifacts.
 * Groups commits by type (feat, fix, refactor, etc.) using conventional commit format.
 * Can also incorporate pipeline events (gate approvals, scan results) for richer context.
 */

import { execFileSync } from 'node:child_process';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  hash: string;
  shortHash: string;
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  date: string;
  author: string;
}

export interface ChangelogSection {
  title: string;
  entries: ChangelogEntry[];
}

export interface ChangelogOptions {
  /** Starting ref (exclusive). Defaults to last tag or initial commit. */
  from?: string;
  /** Ending ref (inclusive). Defaults to HEAD. */
  to?: string;
  /** Group by conventional commit type. Default: true. */
  groupByType?: boolean;
}

// ── Commit Type Labels ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  refactor: 'Refactoring',
  perf: 'Performance',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Chores',
  ci: 'CI/CD',
  style: 'Style',
  build: 'Build',
};

const TYPE_ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'ci', 'chore', 'style', 'build', 'other'];

// ── Parser ──────────────────────────────────────────────────────────────────

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

export function parseCommitMessage(message: string): { type: string; scope?: string; subject: string } {
  const match = message.match(CONVENTIONAL_RE);
  if (match) {
    return {
      type: match[1],
      scope: match[2],
      subject: match[3],
    };
  }

  return { type: 'other', subject: message };
}

// ── Git Integration ─────────────────────────────────────────────────────────

function getLastTag(cwd: string): string | null {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function getCommits(cwd: string, from?: string, to = 'HEAD'): ChangelogEntry[] {
  const SEPARATOR = '---COMMIT---';
  const FIELD_SEP = '---FIELD---';
  const format = ['%H', '%h', '%s', '%b', '%ai', '%an'].join(FIELD_SEP);

  const range = from ? `${from}..${to}` : to;
  const args = ['log', range, `--format=${format}${SEPARATOR}`, '--no-merges'];

  let output: string;
  try {
    output = execFileSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return [];
  }

  const entries: ChangelogEntry[] = [];
  const chunks = output.split(SEPARATOR).filter((c) => c.trim());

  for (const chunk of chunks) {
    const fields = chunk.trim().split(FIELD_SEP);
    if (fields.length < 5) continue;

    const [hash, shortHash, subject, body, date, author] = fields;
    const parsed = parseCommitMessage(subject);

    entries.push({
      hash,
      shortHash,
      type: parsed.type,
      scope: parsed.scope,
      subject: parsed.subject,
      body: body?.trim() || undefined,
      date: date.split(' ')[0], // Date only, no time
      author,
    });
  }

  return entries;
}

// ── Generator ───────────────────────────────────────────────────────────────

export function generateChangelog(projectPath: string, options: ChangelogOptions = {}): string {
  const cwd = projectPath;
  const from = options.from ?? getLastTag(cwd) ?? undefined;
  const to = options.to ?? 'HEAD';
  const groupByType = options.groupByType ?? true;

  const entries = getCommits(cwd, from, to);
  if (entries.length === 0) {
    return '# Changelog\n\nNo changes found.\n';
  }

  const lines: string[] = ['# Changelog', ''];

  if (from) {
    lines.push(`Changes from \`${from}\` to \`${to}\``, '');
  }

  if (groupByType) {
    const sections = groupEntries(entries);
    for (const section of sections) {
      lines.push(`## ${section.title}`, '');
      for (const entry of section.entries) {
        const scope = entry.scope ? `**${entry.scope}:** ` : '';
        lines.push(`- ${scope}${entry.subject} (${entry.shortHash})`);
      }
      lines.push('');
    }
  } else {
    for (const entry of entries) {
      const scope = entry.scope ? `**${entry.scope}:** ` : '';
      const type = entry.type !== 'other' ? `[${entry.type}] ` : '';
      lines.push(`- ${type}${scope}${entry.subject} (${entry.shortHash}, ${entry.date})`);
    }
    lines.push('');
  }

  lines.push(`---`, `Generated: ${new Date().toISOString().split('T')[0]}`, '');
  return lines.join('\n');
}

function groupEntries(entries: ChangelogEntry[]): ChangelogSection[] {
  const groups = new Map<string, ChangelogEntry[]>();

  for (const entry of entries) {
    const type = TYPE_LABELS[entry.type] ? entry.type : 'other';
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(entry);
  }

  const sections: ChangelogSection[] = [];
  for (const type of TYPE_ORDER) {
    const entries = groups.get(type);
    if (entries && entries.length > 0) {
      sections.push({
        title: TYPE_LABELS[type] || 'Other Changes',
        entries,
      });
    }
  }

  return sections;
}
