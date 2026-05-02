import { buildCommitGroups } from '../backend/grouping/prGrouping';
import type { Commit, GitService } from '../backend/gitService';

const commit = (overrides: Partial<Commit> & { hash: string; subject: string }): Commit => ({
  shortHash: overrides.hash.slice(0, 7),
  author: 'Alice',
  authorEmail: 'a@x',
  date: '2026-01-01T00:00:00Z',
  message: overrides.subject,
  body: '',
  parents: [],
  branches: [],
  tags: [],
  isMerge: false,
  ...overrides
});

function fakeGitService(commits: Commit[]): GitService {
  return {
    getCommits: jest.fn().mockResolvedValue({
      commits,
      total: commits.length,
      page: 1,
      pageSize: commits.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    }),
    getRemoteUrl: jest.fn().mockRejectedValue(new Error('no remote'))
  } as unknown as GitService;
}

describe('buildCommitGroups', () => {
  it('groups GitHub merge-pr commits with their second-parent chain', async () => {
    const merge = commit({
      hash: 'm1',
      subject: 'Merge pull request #42 from feat/auth',
      isMerge: true,
      parents: ['p1', 'f3']
    });
    const f3 = commit({ hash: 'f3', subject: 'fix flaky test', parents: ['f2'] });
    const f2 = commit({ hash: 'f2', subject: 'add unit tests', parents: ['f1'] });
    const f1 = commit({ hash: 'f1', subject: 'introduce auth service', parents: ['p1'] });
    const p1 = commit({ hash: 'p1', subject: 'previous trunk commit' });

    const groups = await buildCommitGroups(fakeGitService([merge, f3, f2, f1, p1]));
    const pr = groups.find((g) => g.prNumber === 42);
    expect(pr).toBeDefined();
    expect(pr!.source).toBe('merge');
    expect(pr!.commits).toEqual(expect.arrayContaining(['m1', 'f3', 'f2', 'f1']));
  });

  it('detects squash merges from "(#N)" suffix', async () => {
    const sq = commit({ hash: 'sq', subject: 'feat: cool new thing (#99)' });
    const groups = await buildCommitGroups(fakeGitService([sq]));
    const pr = groups.find((g) => g.prNumber === 99);
    expect(pr).toBeDefined();
    expect(pr!.source).toBe('squash');
  });

  it('groups conventional commits by type+scope', async () => {
    const c1 = commit({ hash: 'c1', subject: 'fix(auth): handle expired token' });
    const c2 = commit({ hash: 'c2', subject: 'fix(auth): clear cookies on logout' });
    const c3 = commit({ hash: 'c3', subject: 'docs: update README' });
    const groups = await buildCommitGroups(fakeGitService([c1, c2, c3]));
    const conv = groups.find((g) => g.id === 'conv-fix:auth');
    expect(conv).toBeDefined();
    expect(conv!.commits.length).toBe(2);
    // Single docs commit stays standalone
    const standalone = groups.find((g) => g.commits.includes('c3'));
    expect(standalone!.source).toBe('standalone');
  });
});
