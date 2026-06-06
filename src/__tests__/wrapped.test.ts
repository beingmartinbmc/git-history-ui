import { aggregateWrapped } from '../backend/wrapped';
import type { Commit, DiffFile } from '../backend/gitService';

const commit = (overrides: Partial<Commit>): Commit => ({
  hash: 'h',
  shortHash: 'h',
  author: 'Alice',
  authorEmail: 'alice@example.com',
  date: '2026-01-01T12:00:00Z',
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

describe('aggregateWrapped', () => {
  it('totals commits, authors, lines and files', () => {
    const churn: Record<string, DiffFile[]> = {
      a: [diff('src/a.ts', 10, 2)],
      b: [diff('src/a.ts', 1, 1), diff('src/b.ts', 5, 0)]
    };
    const commits = [
      commit({ hash: 'a', author: 'Alice', authorEmail: 'a@x' }),
      commit({ hash: 'b', author: 'Bob', authorEmail: 'b@x' })
    ];
    const s = aggregateWrapped(commits, (h) => churn[h] ?? [], '2026', '2026-01-01', '2026-12-31');
    expect(s.totalCommits).toBe(2);
    expect(s.totalAuthors).toBe(2);
    expect(s.totalAdditions).toBe(16);
    expect(s.totalDeletions).toBe(3);
    expect(s.totalFilesTouched).toBe(2);
  });

  it('ranks contributors by commit count', () => {
    const commits = [
      commit({ hash: '1', author: 'Alice', authorEmail: 'a@x' }),
      commit({ hash: '2', author: 'Alice', authorEmail: 'a@x' }),
      commit({ hash: '3', author: 'Bob', authorEmail: 'b@x' })
    ];
    const s = aggregateWrapped(commits, () => [], '2026', null, null);
    expect(s.topContributors[0]).toMatchObject({ author: 'Alice', commits: 2 });
    expect(s.topContributors[1]).toMatchObject({ author: 'Bob', commits: 1 });
  });

  it('identifies the biggest commit by churn', () => {
    const churn: Record<string, DiffFile[]> = {
      small: [diff('a.ts', 1, 1)],
      big: [diff('b.ts', 100, 50)]
    };
    const commits = [
      commit({ hash: 'small', subject: 'tiny' }),
      commit({ hash: 'big', subject: 'huge refactor' })
    ];
    const s = aggregateWrapped(commits, (h) => churn[h] ?? [], '2026', null, null);
    expect(s.superlatives.biggestCommit?.hash).toBe('big');
    expect(s.superlatives.biggestCommit?.churn).toBe(150);
  });

  it('computes night-owl and weekend percentages', () => {
    const commits = [
      // 2026-01-03 is a Saturday; 23:00 UTC counts as night owl + weekend
      commit({ hash: '1', date: '2026-01-03T23:00:00Z' }),
      // 2026-01-05 is a Monday; 12:00 is neither
      commit({ hash: '2', date: '2026-01-05T12:00:00Z' })
    ];
    const s = aggregateWrapped(commits, () => [], '2026', null, null);
    expect(s.nightOwlPercent).toBe(50);
    expect(s.weekendWarriorPercent).toBe(50);
  });

  it('finds the busiest day and longest streak', () => {
    const commits = [
      commit({ hash: '1', date: '2026-02-01T10:00:00Z' }),
      commit({ hash: '2', date: '2026-02-02T10:00:00Z' }),
      commit({ hash: '3', date: '2026-02-02T11:00:00Z' }),
      commit({ hash: '4', date: '2026-02-03T10:00:00Z' }),
      // gap, then an isolated day
      commit({ hash: '5', date: '2026-02-10T10:00:00Z' })
    ];
    const s = aggregateWrapped(commits, () => [], '2026', null, null);
    expect(s.superlatives.busiestDay).toEqual({ date: '2026-02-02', commits: 2 });
    expect(s.superlatives.longestStreakDays).toBe(3);
  });

  it('extracts top words from subjects ignoring stop words', () => {
    const commits = [
      commit({ hash: '1', subject: 'fix login bug in checkout' }),
      commit({ hash: '2', subject: 'add checkout retry' }),
      commit({ hash: '3', subject: 'improve checkout latency' })
    ];
    const s = aggregateWrapped(commits, () => [], '2026', null, null);
    expect(s.topWords[0]).toEqual({ word: 'checkout', count: 3 });
    // stop words like "fix" and "add" must be excluded
    expect(s.topWords.find((w) => w.word === 'fix')).toBeUndefined();
    expect(s.topWords.find((w) => w.word === 'add')).toBeUndefined();
  });

  it('handles an empty repo window without throwing', () => {
    const s = aggregateWrapped([], () => [], '2026', null, null);
    expect(s.totalCommits).toBe(0);
    expect(s.nightOwlPercent).toBe(0);
    expect(s.superlatives.biggestCommit).toBeNull();
    expect(s.superlatives.longestStreakDays).toBe(0);
  });
});
