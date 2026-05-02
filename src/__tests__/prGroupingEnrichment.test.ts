import { buildCommitGroups } from '../backend/grouping/prGrouping';
import type { GitService, Commit } from '../backend/gitService';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: (over.hash ?? 'h').slice(0, 7),
    author: 'alice',
    authorEmail: 'a@x.com',
    date: '2026-05-01T00:00:00Z',
    message: '',
    subject: '',
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
    ...over
  };
}

const ok = (json: unknown): Response =>
  ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) } as unknown as Response);

const fail = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}), text: async () => '' } as unknown as Response);

function fakeGit(commits: Commit[], remote: string | null = null): GitService {
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
    getRemoteUrl: async () => {
      if (!remote) throw new Error('no remote');
      return remote;
    }
  } as unknown as GitService;
}

describe('buildCommitGroups — GitHub enrichment', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hydrates merge-commit groups with PR title/labels and overrides default title', async () => {
    const commits = [
      commit({
        hash: 'm1',
        subject: 'Merge pull request #42 from feature/login',
        isMerge: true,
        parents: ['p1', 'fb']
      }),
      commit({ hash: 'fb', subject: 'feat: add login form', parents: ['p1'] })
    ];
    const svc = fakeGit(commits, 'https://github.com/acme/widgets.git');
    global.fetch = jest.fn(async (url: any) => {
      expect(String(url)).toContain('/repos/acme/widgets/pulls/42');
      return ok({
        number: 42,
        title: 'Add OAuth login flow',
        user: { login: 'alice' },
        html_url: 'https://github.com/acme/widgets/pull/42',
        labels: [{ name: 'feature' }, { name: 'auth' }, { /* nameless */ }],
        merged_at: '2026-05-01T00:00:00Z',
        state: 'closed'
      });
    }) as unknown as typeof fetch;

    const groups = await buildCommitGroups(svc, { githubToken: 'ghp_x' });
    const pr = groups.find((g) => g.prNumber === 42);
    expect(pr?.pr?.title).toBe('Add OAuth login flow');
    expect(pr?.pr?.state).toBe('merged');
    expect(pr?.pr?.labels).toEqual(['feature', 'auth']);
    expect(pr?.title).toBe('Add OAuth login flow');
  });

  it('survives 401/network failures by leaving the group unenriched', async () => {
    const commits = [
      commit({ hash: 's1', subject: 'feat: payments cleanup (#7)' })
    ];
    const svc = fakeGit(commits, 'https://github.com/acme/widgets');
    global.fetch = jest.fn(async () => fail(401)) as unknown as typeof fetch;

    const groups = await buildCommitGroups(svc, { githubToken: 'bad' });
    const pr = groups.find((g) => g.prNumber === 7);
    expect(pr).toBeDefined();
    expect(pr?.pr).toBeUndefined();
  });

  it('skips enrichment when the remote is not GitHub', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = fakeGit(
      [commit({ hash: 's', subject: 'feat: bare (#1)' })],
      'https://gitlab.com/acme/widgets.git'
    );
    await buildCommitGroups(svc, { githubToken: 'tok' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips enrichment when there is no remote', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = fakeGit([commit({ hash: 's', subject: 'feat: bare (#1)' })], null);
    await buildCommitGroups(svc, { githubToken: 'tok' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles a missing PR user (defaults author to "unknown")', async () => {
    const commits = [commit({ hash: 'a', subject: 'feat: anon-author (#3)' })];
    const svc = fakeGit(commits, 'https://github.com/x/y.git');
    global.fetch = jest.fn(async () =>
      ok({ number: 3, title: 't', html_url: 'u', labels: null, state: 'open' })
    ) as unknown as typeof fetch;
    const groups = await buildCommitGroups(svc, { githubToken: 't' });
    const pr = groups.find((g) => g.prNumber === 3);
    expect(pr?.pr?.author).toBe('unknown');
    expect(pr?.pr?.labels).toEqual([]);
  });

  it('treats network thrown errors as "no PR info"', async () => {
    const commits = [commit({ hash: 'a', subject: 'feat: net-fail (#11)' })];
    const svc = fakeGit(commits, 'https://github.com/x/y.git');
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const groups = await buildCommitGroups(svc, { githubToken: 't' });
    const pr = groups.find((g) => g.prNumber === 11);
    expect(pr?.pr).toBeUndefined();
  });
});
