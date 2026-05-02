import {
  computeChurnByDay,
  computeContributorStats,
  computeFileChurn,
  computeRiskyFiles
} from '../backend/aggregations';
import type { Commit, DiffFile } from '../backend/gitService';

const commit = (overrides: Partial<Commit>): Commit => ({
  hash: 'h',
  shortHash: 'h',
  author: 'Alice',
  authorEmail: 'alice@example.com',
  date: '2026-01-01T00:00:00Z',
  message: '',
  subject: '',
  body: '',
  parents: [],
  branches: [],
  tags: [],
  isMerge: false,
  ...overrides
});

const diff = (file: string, additions = 1, deletions = 1): DiffFile => ({
  file,
  status: 'modified',
  additions,
  deletions,
  changes: ''
});

describe('aggregations', () => {
  it('computes contributor stats sorted by commit count', () => {
    const c1 = commit({ author: 'Alice', authorEmail: 'a@x', date: '2026-01-01' });
    const c2 = commit({ author: 'Bob', authorEmail: 'b@x', date: '2026-01-02' });
    const c3 = commit({ author: 'Alice', authorEmail: 'a@x', date: '2026-01-03' });
    const stats = computeContributorStats([c1, c2, c3]);
    expect(stats[0]).toMatchObject({ author: 'Alice', commits: 2 });
    expect(stats[1]).toMatchObject({ author: 'Bob', commits: 1 });
  });

  it('computes file churn aggregating per file', () => {
    const c = commit({ author: 'Alice', authorEmail: 'a@x' });
    const churn = computeFileChurn([
      { commit: c, files: [diff('src/a.ts', 10, 5)] },
      { commit: c, files: [diff('src/a.ts', 3, 2), diff('src/b.ts')] }
    ]);
    const a = churn.find((x) => x.file === 'src/a.ts')!;
    expect(a.commits).toBe(2);
    expect(a.additions).toBe(13);
    expect(a.deletions).toBe(7);
  });

  it('computes risky files with reasons', () => {
    const c = commit({ author: 'Alice', authorEmail: 'a@x', date: new Date().toISOString() });
    const churn = computeFileChurn([
      { commit: c, files: [diff('hot.ts', 100, 100)] },
      { commit: c, files: [diff('hot.ts', 100, 100)] },
      { commit: c, files: [diff('cold.ts', 1, 0)] }
    ]);
    const risky = computeRiskyFiles(churn);
    expect(risky[0].file).toBe('hot.ts');
    expect(risky[0].riskScore).toBeGreaterThan(0.5);
  });

  it('computes churn by day grouping', () => {
    const c1 = commit({ date: '2026-01-01T08:00:00Z' });
    const c2 = commit({ date: '2026-01-01T20:00:00Z' });
    const c3 = commit({ date: '2026-01-02T08:00:00Z' });
    const out = computeChurnByDay([
      { commit: c1, files: [diff('a.ts', 1, 0)] },
      { commit: c2, files: [diff('a.ts', 2, 1)] },
      { commit: c3, files: [diff('a.ts', 5, 5)] }
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ date: '2026-01-01', commits: 2, additions: 3, deletions: 1 });
  });
});
