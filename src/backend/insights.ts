import {
  computeChurnByDay,
  computeContributorStats,
  computeFileChurn,
  computeRiskyFiles,
  type InsightsBundle
} from './aggregations';
import type { GitService } from './gitService';

export interface InsightsOptions {
  since?: string;
  until?: string;
  /** Cap on commits scanned to keep dashboards responsive. */
  maxCommits?: number;
}

const CONCURRENCY = 6;

export async function computeInsights(
  gitService: GitService,
  opts: InsightsOptions = {}
): Promise<InsightsBundle> {
  const maxCommits = Math.min(2000, Math.max(50, opts.maxCommits ?? 500));
  const page = await gitService.getCommits({
    since: opts.since,
    until: opts.until,
    page: 1,
    pageSize: maxCommits
  });
  const commits = page.commits;

  // Fan out diffs with bounded concurrency.
  const pairs: Array<{ commit: (typeof commits)[number]; files: Awaited<ReturnType<typeof gitService.getDiff>> }> = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < commits.length) {
        const i = cursor++;
        const commit = commits[i];
        const files = await gitService.getDiff(commit.hash).catch(() => []);
        pairs.push({ commit, files });
      }
    })
  );

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
