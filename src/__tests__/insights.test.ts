import { computeInsights } from '../backend/insights';
import type { GitService, Commit, DiffFile } from '../backend/gitService';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: 'h',
    author: over.author ?? 'alice',
    authorEmail: over.authorEmail ?? 'alice@example.com',
    date: over.date ?? '2026-05-01T00:00:00Z',
    message: 'm',
    subject: over.subject ?? 'subj',
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
    ...over
  };
}

function fakeGit(commits: Commit[], diffs: Record<string, DiffFile[]>): GitService {
  return {
    getCommits: async () => ({
      commits,
      total: commits.length,
      page: 1,
      pageSize: commits.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    }),
    getDiff: async (hash: string) => diffs[hash] ?? []
  } as unknown as GitService;
}

const diff = (file: string, additions = 1, deletions = 0): DiffFile => ({
  file,
  status: 'modified',
  additions,
  deletions,
  changes: ''
});

describe('computeInsights', () => {
  it('aggregates commits, contributors, hotspots, churn-by-day and risky files', async () => {
    const commits = [
      commit({ hash: 'c1', author: 'alice', authorEmail: 'a@x.com', date: '2026-04-01T00:00:00Z' }),
      commit({ hash: 'c2', author: 'bob', authorEmail: 'b@x.com', date: '2026-04-02T00:00:00Z' }),
      commit({ hash: 'c3', author: 'alice', authorEmail: 'a@x.com', date: '2026-04-03T00:00:00Z' })
    ];
    const diffs = {
      c1: [diff('src/hot.ts', 30, 5), diff('README.md', 1)],
      c2: [diff('src/hot.ts', 10, 5), diff('src/calm.ts', 2)],
      c3: [diff('src/hot.ts', 8, 1)]
    };
    const svc = fakeGit(commits, diffs);

    const bundle = await computeInsights(svc, {});
    expect(bundle.totalCommits).toBe(3);
    expect(bundle.totalAuthors).toBe(2);
    expect(bundle.windowStart).toBe('2026-04-01T00:00:00Z');
    expect(bundle.windowEnd).toBe('2026-04-03T00:00:00Z');

    const hotspot = bundle.hotspots.find((h) => h.file === 'src/hot.ts');
    expect(hotspot?.commits).toBe(3);

    const aliceStats = bundle.topContributors.find((c) => c.author === 'alice');
    expect(aliceStats?.commits).toBe(2);

    expect(bundle.churnByDay.length).toBeGreaterThan(0);
    expect(bundle.riskyFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('clamps maxCommits between 50 and 2000', async () => {
    let calledWith = -1;
    const svc = {
      getCommits: async (q: { pageSize?: number }) => {
        calledWith = q.pageSize ?? 0;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getDiff: async () => []
    } as unknown as GitService;

    await computeInsights(svc, { maxCommits: 1 });
    expect(calledWith).toBe(50);
    await computeInsights(svc, { maxCommits: 99999 });
    expect(calledWith).toBe(2000);
    await computeInsights(svc, { maxCommits: 700 });
    expect(calledWith).toBe(700);
  });

  it('returns null window markers when there are no commits', async () => {
    const svc = fakeGit([], {});
    const bundle = await computeInsights(svc, {});
    expect(bundle.totalCommits).toBe(0);
    expect(bundle.windowStart).toBeNull();
    expect(bundle.windowEnd).toBeNull();
    expect(bundle.topContributors).toEqual([]);
  });

  it('survives diffs that throw', async () => {
    const commits = [commit({ hash: 'a' })];
    const svc = {
      getCommits: async () => ({
        commits,
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }),
      getDiff: async () => {
        throw new Error('boom');
      }
    } as unknown as GitService;
    const bundle = await computeInsights(svc, {});
    expect(bundle.totalCommits).toBe(1);
    expect(bundle.hotspots).toEqual([]);
  });
});
