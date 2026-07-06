import { computeWrapped } from '../backend/wrapped';
import type { GitService, Commit } from '../backend/gitService';

function commit(over: Partial<Commit> = {}): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: 'h',
    author: over.author ?? 'alice',
    authorEmail: over.authorEmail ?? 'alice@example.com',
    date: over.date ?? '2026-05-01T12:00:00Z',
    message: 'm',
    subject: over.subject ?? 'subj',
    body: over.body ?? '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
    ...over
  };
}

function fakeGit(
  commits: Commit[],
  numstatData?: Map<string, Array<{ file: string; additions: number; deletions: number }>>
): GitService {
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
    getNumstat: async () => numstatData ?? new Map()
  } as unknown as GitService;
}

describe('computeWrapped (async path)', () => {
  it('calls gitService with year-based window', async () => {
    let calledWith: any = null;
    const svc = {
      getCommits: async (q: any) => {
        calledWith = q;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getNumstat: async () => new Map()
    } as unknown as GitService;

    const result = await computeWrapped(svc, { year: 2025 });
    expect(calledWith.since).toBe('2025-01-01');
    expect(calledWith.until).toBe('2025-12-31');
    expect(result.label).toBe('2025');
    expect(result.windowStart).toBe('2025-01-01');
    expect(result.windowEnd).toBe('2025-12-31');
  });

  it('uses since/until window when provided without year', async () => {
    let calledWith: any = null;
    const svc = {
      getCommits: async (q: any) => {
        calledWith = q;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getNumstat: async () => new Map()
    } as unknown as GitService;

    const result = await computeWrapped(svc, { since: '2025-06-01', until: '2025-12-31' });
    expect(calledWith.since).toBe('2025-06-01');
    expect(calledWith.until).toBe('2025-12-31');
    expect(result.label).toBe('2025-06-01 → 2025-12-31');
  });

  it('defaults to current year when no window specified', async () => {
    let calledWith: any = null;
    const svc = {
      getCommits: async (q: any) => {
        calledWith = q;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getNumstat: async () => new Map()
    } as unknown as GitService;

    const result = await computeWrapped(svc, {});
    const year = new Date().getUTCFullYear();
    expect(calledWith.since).toBe(`${year}-01-01`);
    expect(calledWith.until).toBe(`${year}-12-31`);
    expect(result.label).toBe(String(year));
  });

  it('passes branch and author to getCommits and getNumstat', async () => {
    let commitQuery: any = null;
    let numstatQuery: any = null;
    const svc = {
      getCommits: async (q: any) => {
        commitQuery = q;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getNumstat: async (q: any) => {
        numstatQuery = q;
        return new Map();
      }
    } as unknown as GitService;

    await computeWrapped(svc, { year: 2026, branch: 'main', author: 'bob' });
    expect(commitQuery.branch).toBe('main');
    expect(commitQuery.author).toBe('bob');
    expect(numstatQuery.branch).toBe('main');
    expect(numstatQuery.author).toBe('bob');
  });

  it('clamps maxCommits between 50 and 20000', async () => {
    let calledPageSize = 0;
    const svc = {
      getCommits: async (q: any) => {
        calledPageSize = q.pageSize;
        return {
          commits: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        };
      },
      getNumstat: async () => new Map()
    } as unknown as GitService;

    await computeWrapped(svc, { maxCommits: 1 });
    expect(calledPageSize).toBe(50);

    await computeWrapped(svc, { maxCommits: 99999 });
    expect(calledPageSize).toBe(20000);
  });

  it('survives numstat throwing', async () => {
    const commits = [commit({ hash: 'c1' }), commit({ hash: 'c2' })];
    const svc = {
      getCommits: async () => ({
        commits,
        total: 2,
        page: 1,
        pageSize: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }),
      getNumstat: async () => {
        throw new Error('boom');
      }
    } as unknown as GitService;

    const result = await computeWrapped(svc, { year: 2026 });
    expect(result.totalCommits).toBe(2);
    expect(result.totalAdditions).toBe(0);
  });

  it('maps numstat data to DiffFile format for aggregation', async () => {
    const commits = [commit({ hash: 'c1' })];
    const numstat = new Map([['c1', [{ file: 'src/a.ts', additions: 10, deletions: 3 }]]]);
    const svc = fakeGit(commits, numstat);

    const result = await computeWrapped(svc, { year: 2026 });
    expect(result.totalAdditions).toBe(10);
    expect(result.totalDeletions).toBe(3);
    expect(result.totalFilesTouched).toBe(1);
  });

  it('handles since-only label', async () => {
    const svc = {
      getCommits: async () => ({
        commits: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }),
      getNumstat: async () => new Map()
    } as unknown as GitService;

    const result = await computeWrapped(svc, { since: '2025-01-01' });
    expect(result.label).toBe('2025-01-01 → now');
  });

  it('handles until-only label', async () => {
    const svc = {
      getCommits: async () => ({
        commits: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }),
      getNumstat: async () => new Map()
    } as unknown as GitService;

    const result = await computeWrapped(svc, { until: '2025-12-31' });
    expect(result.label).toBe('… → 2025-12-31');
  });
});
