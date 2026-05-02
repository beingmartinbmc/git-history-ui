import type { Commit, DiffFile } from './gitService';

export interface ContributorStat {
  author: string;
  email: string;
  commits: number;
  firstCommit: string;
  lastCommit: string;
}

export interface FileChurn {
  file: string;
  commits: number;
  additions: number;
  deletions: number;
  lastTouched: string;
  authors: number;
}

export interface RiskyFile {
  file: string;
  riskScore: number; // 0..1
  reason: string;
  commits: number;
  authors: number;
  churn: number;
}

export interface InsightsBundle {
  windowStart: string | null;
  windowEnd: string | null;
  totalCommits: number;
  totalAuthors: number;
  topContributors: ContributorStat[];
  hotspots: FileChurn[];
  churnByDay: Array<{ date: string; commits: number; additions: number; deletions: number }>;
  riskyFiles: RiskyFile[];
}

export function computeContributorStats(commits: Commit[]): ContributorStat[] {
  const map = new Map<string, ContributorStat>();
  for (const c of commits) {
    const key = c.authorEmail || c.author;
    const cur = map.get(key);
    if (cur) {
      cur.commits++;
      if (c.date > cur.lastCommit) cur.lastCommit = c.date;
      if (c.date < cur.firstCommit) cur.firstCommit = c.date;
    } else {
      map.set(key, {
        author: c.author,
        email: c.authorEmail,
        commits: 1,
        firstCommit: c.date,
        lastCommit: c.date
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.commits - a.commits);
}

/**
 * Compute file churn from a sequence of {commit, files}. Caller is expected to
 * fetch diff for each commit (potentially expensively); this is a pure aggregator.
 */
export function computeFileChurn(
  pairs: Array<{ commit: Commit; files: DiffFile[] }>
): FileChurn[] {
  const map = new Map<string, FileChurn & { authorSet: Set<string> }>();
  for (const { commit, files } of pairs) {
    for (const f of files) {
      const key = f.file;
      let cur = map.get(key);
      if (!cur) {
        cur = {
          file: key,
          commits: 0,
          additions: 0,
          deletions: 0,
          lastTouched: commit.date,
          authors: 0,
          authorSet: new Set<string>()
        };
        map.set(key, cur);
      }
      cur.commits++;
      cur.additions += f.additions || 0;
      cur.deletions += f.deletions || 0;
      cur.authorSet.add(commit.authorEmail || commit.author);
      if (commit.date > cur.lastTouched) cur.lastTouched = commit.date;
    }
  }
  return Array.from(map.values())
    .map(({ authorSet, ...rest }) => ({ ...rest, authors: authorSet.size }))
    .sort((a, b) => b.commits - a.commits);
}

export function computeChurnByDay(
  pairs: Array<{ commit: Commit; files: DiffFile[] }>
): InsightsBundle['churnByDay'] {
  const map = new Map<string, { commits: number; additions: number; deletions: number }>();
  for (const { commit, files } of pairs) {
    const day = (commit.date || '').slice(0, 10);
    if (!day) continue;
    let cur = map.get(day);
    if (!cur) {
      cur = { commits: 0, additions: 0, deletions: 0 };
      map.set(day, cur);
    }
    cur.commits++;
    for (const f of files) {
      cur.additions += f.additions || 0;
      cur.deletions += f.deletions || 0;
    }
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Risk score: heuristic combining churn density, contributor diversity,
 * and recency. Inspired by Microsoft Research's "fault density" findings.
 */
export function computeRiskyFiles(churn: FileChurn[], limit = 20): RiskyFile[] {
  if (churn.length === 0) return [];
  const maxCommits = Math.max(...churn.map((c) => c.commits));
  const maxChurn = Math.max(...churn.map((c) => c.additions + c.deletions));
  const now = Date.now();

  return churn
    .map<RiskyFile>((c) => {
      const churnRaw = c.additions + c.deletions;
      const norm =
        0.4 * (c.commits / Math.max(1, maxCommits)) +
        0.4 * (churnRaw / Math.max(1, maxChurn)) +
        0.2 * Math.min(1, c.authors / 5);
      const ageDays =
        (now - new Date(c.lastTouched || 0).getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = ageDays < 30 ? 0.15 : ageDays < 90 ? 0.08 : 0;
      const score = Math.min(1, norm + recencyBoost);
      const reasons: string[] = [];
      if (c.commits >= 0.5 * maxCommits) reasons.push('high commit frequency');
      if (churnRaw >= 0.5 * maxChurn) reasons.push('large churn');
      if (c.authors >= 5) reasons.push('many contributors');
      if (ageDays < 30) reasons.push('recently modified');
      return {
        file: c.file,
        riskScore: round(score, 3),
        reason: reasons.join(', ') || 'general activity',
        commits: c.commits,
        authors: c.authors,
        churn: churnRaw
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
