import {
  computeChurnByDay,
  computeContributorStats,
  computeFileChurn,
  computeRiskyFiles,
  type InsightsBundle
} from './aggregations';
import type { DiffFile, GitService } from './gitService';

export interface InsightsOptions {
  since?: string;
  until?: string;
  branch?: string;
  /** Cap on commits scanned to keep dashboards responsive. */
  maxCommits?: number;
  signal?: AbortSignal;
}

const CONCURRENCY = 3;
const FALLBACK_DIFF_LIMIT = 50;

export async function computeInsights(
  gitService: GitService,
  opts: InsightsOptions = {}
): Promise<InsightsBundle> {
  const maxCommits = Math.min(2000, Math.max(50, opts.maxCommits ?? 500));
  const page = await gitService.getCommits({
    since: opts.since,
    until: opts.until,
    branch: opts.branch,
    page: 1,
    pageSize: maxCommits
  });
  const commits = page.commits;

  // Fast path: a single `git log --numstat` returns per-commit additions
  // and deletions in one subprocess. This is ~50x faster than fanning out
  // N separate `git diff` calls and is what keeps the insights dashboard
  // snappy on huge repos. We fall back to per-commit diff only if numstat
  // returns nothing for some reason (e.g. shallow clones).
  const pairs: Array<{ commit: (typeof commits)[number]; files: DiffFile[] }> = [];
  let numstat: Awaited<ReturnType<typeof gitService.getNumstat>> | null = null;
  try {
    numstat = await gitService.getNumstat(
      { since: opts.since, until: opts.until, branch: opts.branch },
      maxCommits,
      { signal: opts.signal }
    );
  } catch {
    numstat = null;
  }

  if (numstat && numstat.size > 0) {
    for (const commit of commits) {
      const entries = numstat.get(commit.hash) ?? [];
      pairs.push({
        commit,
        files: entries.map((e) => ({
          file: e.file,
          status: 'modified' as const,
          additions: e.additions,
          deletions: e.deletions,
          changes: ''
        }))
      });
    }
  } else {
    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < Math.min(commits.length, FALLBACK_DIFF_LIMIT)) {
          if (opts.signal?.aborted) throw new Error('insights aborted');
          const i = cursor++;
          const commit = commits[i];
          const files = await gitService
            .getDiff(commit.hash, { signal: opts.signal })
            .catch(() => []);
          pairs.push({ commit, files });
        }
      })
    );
  }

  const contributors = computeContributorStats(commits).slice(0, 15);
  const churn = computeFileChurn(pairs);
  const churnByDay = computeChurnByDay(pairs);
  const risky = computeRiskyFiles(churn);

  const sortedDates = commits.map((c) => c.date).sort();
  const windowStart = sortedDates[0] ?? null;
  const windowEnd = sortedDates[sortedDates.length - 1] ?? null;

  return {
    windowStart,
    windowEnd,
    totalCommits: commits.length,
    totalAuthors: new Set(commits.map((c) => c.authorEmail || c.author)).size,
    topContributors: contributors,
    hotspots: churn.slice(0, 20),
    churnByDay,
    riskyFiles: risky
  };
}
