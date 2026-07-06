import type { Commit, DiffFile, GitService } from './gitService';

/**
 * "Git Wrapped" — a Spotify-Wrapped-style year-in-review computed entirely
 * from local git history. Designed to produce a small, shareable payload the
 * frontend can render as an exportable card. Everything here is local-first:
 * no commit content ever leaves the machine.
 */

export interface WrappedContributor {
  author: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
}

export interface WrappedFile {
  file: string;
  commits: number;
  churn: number;
}

export interface WrappedSuperlatives {
  /** Commit with the largest churn (additions + deletions). */
  biggestCommit: {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    churn: number;
  } | null;
  /** Day (YYYY-MM-DD) with the most commits. */
  busiestDay: { date: string; commits: number } | null;
  /** Hour of day (0-23, local to commit timestamp offset) with the most commits. */
  busiestHour: { hour: number; commits: number } | null;
  /** Longest run of consecutive calendar days with at least one commit. */
  longestStreakDays: number;
}

export interface WrappedStats {
  /** Window label, e.g. "2026" or "2026-01-01 → 2026-12-31". */
  label: string;
  windowStart: string | null;
  windowEnd: string | null;
  totalCommits: number;
  totalAuthors: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesTouched: number;
  /** Percentage (0-100) of commits authored between 22:00 and 05:59. */
  nightOwlPercent: number;
  /** Percentage (0-100) of commits authored on Saturday or Sunday. */
  weekendWarriorPercent: number;
  topContributors: WrappedContributor[];
  topFiles: WrappedFile[];
  /** Most frequent meaningful words from commit subjects. */
  topWords: Array<{ word: string; count: number }>;
  superlatives: WrappedSuperlatives;
}

export interface WrappedOptions {
  /** Calendar year to summarize. Mutually exclusive with since/until. */
  year?: number;
  since?: string;
  until?: string;
  branch?: string;
  author?: string;
  maxCommits?: number;
  signal?: AbortSignal;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'fix',
  'fixes',
  'fixed',
  'add',
  'adds',
  'added',
  'update',
  'updates',
  'updated',
  'remove',
  'removed',
  'merge',
  'wip',
  'chore',
  'feat',
  'refactor',
  'test',
  'tests',
  'is',
  'it',
  'this',
  'that',
  'from',
  'by',
  'use',
  'using',
  'into',
  'when',
  'not',
  'pr',
  'pull',
  'request',
  'branch',
  'main',
  'master',
  'into',
  'via',
  'now'
]);

/** Compute the full Wrapped payload for a repo over a time window. */
export async function computeWrapped(
  gitService: GitService,
  opts: WrappedOptions = {}
): Promise<WrappedStats> {
  const { since, until, label } = resolveWindow(opts);
  const maxCommits = Math.min(20_000, Math.max(50, opts.maxCommits ?? 5000));

  const page = await gitService.getCommits({
    since,
    until,
    branch: opts.branch,
    author: opts.author,
    page: 1,
    pageSize: maxCommits
  });
  const commits = page.commits;

  // Pull additions/deletions in a single numstat pass (same fast path the
  // insights dashboard uses) so big repos stay responsive.
  let numstat: Awaited<ReturnType<typeof gitService.getNumstat>> | null = null;
  try {
    numstat = await gitService.getNumstat(
      { since, until, branch: opts.branch, author: opts.author },
      maxCommits,
      { signal: opts.signal }
    );
  } catch {
    numstat = null;
  }

  const churnFor = (hash: string): DiffFile[] =>
    (numstat?.get(hash) ?? []).map((e) => ({
      file: e.file,
      status: 'modified' as const,
      additions: e.additions,
      deletions: e.deletions,
      changes: ''
    }));

  return aggregateWrapped(commits, churnFor, label, since ?? null, until ?? null);
}

/**
 * Pure aggregator — separated from git I/O so it is trivially unit-testable.
 */
export function aggregateWrapped(
  commits: Commit[],
  churnFor: (hash: string) => DiffFile[],
  label: string,
  windowStart: string | null,
  windowEnd: string | null
): WrappedStats {
  const contributors = new Map<string, WrappedContributor>();
  const files = new Map<string, WrappedFile>();
  const byDay = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  const words = new Map<string, number>();
  const fileSet = new Set<string>();

  let totalAdditions = 0;
  let totalDeletions = 0;
  let nightOwl = 0;
  let weekend = 0;

  let biggest: WrappedSuperlatives['biggestCommit'] = null;

  for (const c of commits) {
    const files_ = churnFor(c.hash);
    let commitChurn = 0;
    for (const f of files_) {
      totalAdditions += f.additions || 0;
      totalDeletions += f.deletions || 0;
      commitChurn += (f.additions || 0) + (f.deletions || 0);
      fileSet.add(f.file);
      const cur = files.get(f.file) ?? { file: f.file, commits: 0, churn: 0 };
      cur.commits++;
      cur.churn += (f.additions || 0) + (f.deletions || 0);
      files.set(f.file, cur);
    }

    if (!biggest || commitChurn > biggest.churn) {
      biggest = {
        hash: c.hash,
        shortHash: c.shortHash,
        subject: c.subject,
        author: c.author,
        churn: commitChurn
      };
    }

    const key = c.authorEmail || c.author;
    const contrib = contributors.get(key) ?? {
      author: c.author,
      email: c.authorEmail,
      commits: 0,
      additions: 0,
      deletions: 0
    };
    contrib.commits++;
    for (const f of files_) {
      contrib.additions += f.additions || 0;
      contrib.deletions += f.deletions || 0;
    }
    contributors.set(key, contrib);

    const d = new Date(c.date);
    if (!Number.isNaN(d.getTime())) {
      const day = c.date.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      // Use the author's local time from the ISO offset, not UTC.
      // c.date is ISO 8601 with offset (e.g. 2024-03-15T23:45:00+05:30).
      // Parse HH from the date string to respect the author's timezone.
      const localHourMatch = c.date.match(/T(\d{2}):/);
      const hour = localHourMatch ? parseInt(localHourMatch[1], 10) : d.getUTCHours();
      byHour[hour]++;
      if (hour >= 22 || hour < 6) nightOwl++;
      // For day-of-week, derive from the date portion (already local in ISO string)
      const localDate = new Date(day + 'T12:00:00Z'); // noon UTC to avoid DST edge
      const dow = localDate.getUTCDay();
      if (dow === 0 || dow === 6) weekend++;
    }

    for (const w of tokenize(c.subject)) {
      words.set(w, (words.get(w) ?? 0) + 1);
    }
  }

  const total = commits.length || 1;

  return {
    label,
    windowStart,
    windowEnd,
    totalCommits: commits.length,
    totalAuthors: contributors.size,
    totalAdditions,
    totalDeletions,
    totalFilesTouched: fileSet.size,
    nightOwlPercent: round((nightOwl / total) * 100, 1),
    weekendWarriorPercent: round((weekend / total) * 100, 1),
    topContributors: Array.from(contributors.values())
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10),
    topFiles: Array.from(files.values())
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10),
    topWords: Array.from(words.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    superlatives: {
      biggestCommit: biggest,
      busiestDay: pickMaxDay(byDay),
      busiestHour: pickMaxHour(byHour),
      longestStreakDays: longestStreak(Array.from(byDay.keys()))
    }
  };
}

function resolveWindow(opts: WrappedOptions): {
  since?: string;
  until?: string;
  label: string;
} {
  if (opts.year) {
    return {
      since: `${opts.year}-01-01`,
      until: `${opts.year}-12-31`,
      label: String(opts.year)
    };
  }
  if (opts.since || opts.until) {
    return {
      since: opts.since,
      until: opts.until,
      label: `${opts.since ?? '…'} → ${opts.until ?? 'now'}`
    };
  }
  const year = new Date().getUTCFullYear();
  return { since: `${year}-01-01`, until: `${year}-12-31`, label: String(year) };
}

function tokenize(subject: string): string[] {
  return (subject || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function pickMaxDay(byDay: Map<string, number>): { date: string; commits: number } | null {
  let best: { date: string; commits: number } | null = null;
  for (const [date, commits] of byDay) {
    if (!best || commits > best.commits) best = { date, commits };
  }
  return best;
}

function pickMaxHour(byHour: number[]): { hour: number; commits: number } | null {
  let best: { hour: number; commits: number } | null = null;
  byHour.forEach((commits, hour) => {
    if (commits > 0 && (!best || commits > best.commits)) best = { hour, commits };
  });
  return best;
}

/** Longest run of consecutive calendar days present in the set. */
function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const sorted = Array.from(new Set(days)).sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${sorted[i]}T00:00:00Z`);
    const diffDays = Math.round((cur - prev) / 86_400_000);
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
