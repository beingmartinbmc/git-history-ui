import { getFileBreakageAnalysis } from '../backend/breakage';
import type { Commit, GitService, PaginatedCommits } from '../backend/gitService';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: (over.hash ?? 'h').slice(0, 7),
    author: 'Tester',
    authorEmail: 'tester@example.com',
    date: '2026-05-01T00:00:00Z',
    message: over.subject ?? '',
    subject: over.subject ?? '',
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
    ...over
  };
}

interface FakeOpts {
  commits?: Commit[];
  total?: number;
  numstat?: Record<string, Array<{ file: string; additions: number; deletions: number }>>;
  diffs?: Record<string, Array<{ file: string }>>;
  failGetCommits?: boolean;
  failNumstat?: boolean;
  failDiff?: (hash: string) => boolean;
}

function fakeGit(opts: FakeOpts): GitService {
  return {
    getCommits: async (q: { file?: string; pageSize?: number }): Promise<PaginatedCommits> => {
      if (opts.failGetCommits) throw new Error('boom');
      const list = (opts.commits ?? []).filter(() => !!q.file);
      return {
        commits: list,
        total: opts.total ?? list.length,
        page: 1,
        pageSize: q.pageSize ?? list.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };
    },
    getNumstat: async () => {
      if (opts.failNumstat) throw new Error('boom');
      return new Map(Object.entries(opts.numstat ?? {}));
    },
    getDiff: async (hash: string) => {
      if (opts.failDiff?.(hash)) throw new Error('boom');
      return (opts.diffs?.[hash] ?? []).map((d) => ({
        file: d.file,
        status: 'modified' as const,
        additions: 0,
        deletions: 0,
        changes: ''
      }));
    }
  } as unknown as GitService;
}

describe('getFileBreakageAnalysis', () => {
  it('returns an empty result when the file has no history', async () => {
    const svc = fakeGit({ commits: [] });
    const r = await getFileBreakageAnalysis(svc, 'src/missing.ts');
    expect(r.commits).toEqual([]);
    expect(r.fixCommits).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.coChangedFiles).toEqual([]);
    expect(r.riskScore).toBe(0);
    expect(r.summary).toMatch(/no commit history/i);
  });

  it('rejects empty or null-byte file paths', async () => {
    const svc = fakeGit({ commits: [] });
    await expect(getFileBreakageAnalysis(svc, '')).rejects.toThrow(/Invalid path/);
    await expect(getFileBreakageAnalysis(svc, 'foo\0bar')).rejects.toThrow(/Invalid path/);
  });

  it('flags fix commits and scores the immediate predecessor as the prime suspect', async () => {
    // Newest first: fix lands May 5, big refactor May 4, older bookkeeping May 1.
    const fix = commit({
      hash: 'fix1',
      subject: 'fix: NPE on save',
      date: '2026-05-05T10:00:00Z'
    });
    const refactor = commit({
      hash: 'ref1',
      subject: 'refactor save flow',
      date: '2026-05-04T10:00:00Z'
    });
    const docs = commit({
      hash: 'doc1',
      subject: 'docs: tweak readme',
      date: '2026-05-01T10:00:00Z'
    });

    const svc = fakeGit({
      commits: [fix, refactor, docs],
      numstat: {
        ref1: [{ file: 'src/save.ts', additions: 80, deletions: 40 }],
        doc1: [{ file: 'src/save.ts', additions: 1, deletions: 1 }],
        fix1: [{ file: 'src/save.ts', additions: 5, deletions: 2 }]
      },
      diffs: {
        fix1: [{ file: 'src/save.ts' }, { file: 'src/save.test.ts' }]
      }
    });

    const r = await getFileBreakageAnalysis(svc, 'src/save.ts');
    expect(r.fixCommits.map((c) => c.hash)).toEqual(['fix1']);
    expect(r.commits[0].churn).toBe(7);
    const refactorRow = r.commits.find((c) => c.hash === 'ref1');
    expect(refactorRow?.churn).toBe(120);

    expect(r.suspects[0].hash).toBe('ref1');
    expect(r.suspects[0].reasons).toEqual(
      expect.arrayContaining([
        'immediately preceded a fix',
        'large change (>=100 lines)',
        'fix landed within a week'
      ])
    );
    expect(r.suspects[0].linkedFixes.map((f) => f.hash)).toEqual(['fix1']);

    const docsSuspect = r.suspects.find((s) => s.hash === 'doc1');
    expect(docsSuspect?.reasons).toEqual(expect.arrayContaining(['changed shortly before a fix']));

    expect(r.coChangedFiles.map((c) => c.file)).toEqual(['src/save.test.ts']);
    expect(r.summary).toMatch(/Most likely culprit/);
  });

  it('detects revert commits and excludes them from the suspect list', async () => {
    const revert = commit({
      hash: 'rv1',
      subject: 'Revert "feat: risky change"',
      date: '2026-05-05T10:00:00Z'
    });
    const risky = commit({
      hash: 'risk1',
      subject: 'feat: risky change',
      date: '2026-05-04T10:00:00Z'
    });

    const svc = fakeGit({
      commits: [revert, risky],
      numstat: {
        risk1: [{ file: 'src/x.ts', additions: 50, deletions: 5 }],
        rv1: [{ file: 'src/x.ts', additions: 5, deletions: 50 }]
      }
    });

    const r = await getFileBreakageAnalysis(svc, 'src/x.ts');
    expect(r.commits.find((c) => c.hash === 'rv1')?.isRevert).toBe(true);
    expect(r.commits.find((c) => c.hash === 'rv1')?.isFix).toBe(false);
    expect(r.fixCommits.map((c) => c.hash)).toEqual(['rv1']);
    // The reverted commit becomes the prime suspect.
    expect(r.suspects[0].hash).toBe('risk1');
  });

  it('caps suspects, sorts by score, and aggregates linked fixes', async () => {
    // Two fixes, each preceded by the same big refactor — score should add up.
    const fix2 = commit({ hash: 'f2', subject: 'fix: another bug', date: '2026-05-10T00:00:00Z' });
    const fix1 = commit({ hash: 'f1', subject: 'fix: a bug', date: '2026-05-09T00:00:00Z' });
    const big = commit({ hash: 'big', subject: 'refactor giant', date: '2026-05-08T00:00:00Z' });
    const noise = Array.from({ length: 12 }, (_, i) =>
      commit({
        hash: 'n' + i,
        subject: 'chore: tiny ' + i,
        date: `2026-04-${String(20 - i).padStart(2, '0')}T00:00:00Z`
      })
    );

    const svc = fakeGit({
      commits: [fix2, fix1, big, ...noise],
      numstat: {
        big: [{ file: 'src/x.ts', additions: 200, deletions: 50 }]
      }
    });

    const r = await getFileBreakageAnalysis(svc, 'src/x.ts');
    expect(r.suspects.length).toBeLessThanOrEqual(10);
    expect(r.suspects[0].hash).toBe('big');
    expect(r.suspects[0].linkedFixes.map((f) => f.hash).sort()).toEqual(['f1', 'f2']);
    // High-churn refactor should pick up the large-change reason.
    expect(r.suspects[0].reasons).toEqual(expect.arrayContaining(['large change (>=100 lines)']));
  });

  it('survives numstat and diff failures without throwing', async () => {
    const fix = commit({ hash: 'fx', subject: 'fix: x', date: '2026-05-05T00:00:00Z' });
    const prev = commit({ hash: 'pv', subject: 'feat: x', date: '2026-05-04T00:00:00Z' });
    const svc = fakeGit({
      commits: [fix, prev],
      failNumstat: true,
      failDiff: () => true
    });
    const r = await getFileBreakageAnalysis(svc, 'src/x.ts');
    expect(r.commits.map((c) => c.hash)).toEqual(['fx', 'pv']);
    expect(r.commits[0].churn).toBe(0);
    expect(r.coChangedFiles).toEqual([]);
    // Suspect detection still works without numstat (no churn-based reasons).
    expect(r.suspects[0].hash).toBe('pv');
  });

  it('returns an empty result when getCommits rejects', async () => {
    const svc = fakeGit({ failGetCommits: true });
    const r = await getFileBreakageAnalysis(svc, 'src/x.ts');
    expect(r.commits).toEqual([]);
    expect(r.summary).toMatch(/no commit history/i);
  });

  it('clamps the limit option to a reasonable range', async () => {
    const svc = fakeGit({ commits: [] });
    const r1 = await getFileBreakageAnalysis(svc, 'src/x.ts', { limit: 5 });
    const r2 = await getFileBreakageAnalysis(svc, 'src/x.ts', { limit: 9999 });
    // Both clamp paths exit through the empty-result branch — just making sure
    // we don't reject or hang on out-of-range inputs.
    expect(r1.commits).toEqual([]);
    expect(r2.commits).toEqual([]);
  });

  it('produces a high risk score when fixes dominate the file history', async () => {
    const commits = [
      commit({ hash: 'a', subject: 'fix: 1', date: '2026-05-05T00:00:00Z' }),
      commit({ hash: 'b', subject: 'bugfix nullptr', date: '2026-05-04T00:00:00Z' }),
      commit({ hash: 'c', subject: 'hotfix crash', date: '2026-05-03T00:00:00Z' }),
      commit({ hash: 'd', subject: 'feat: stable', date: '2026-05-02T00:00:00Z' })
    ];
    const svc = fakeGit({ commits });
    const r = await getFileBreakageAnalysis(svc, 'src/x.ts');
    expect(r.fixCount).toBeGreaterThanOrEqual(3);
    expect(r.riskScore).toBeGreaterThanOrEqual(30);
    expect(r.summary).toMatch(/risk/i);
  });
});
