import { runNlSearch } from '../backend/search/nlSearch';
import { HeuristicProvider } from '../backend/llm/heuristicProvider';
import type { GitService, Commit, PaginatedCommits } from '../backend/gitService';
import type { LlmService } from '../backend/llm/types';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: over.hash ?? 'h',
    author: over.author ?? 'alice',
    authorEmail: 'a@x.com',
    date: over.date ?? '2026-05-01T00:00:00Z',
    message: over.subject ?? 's',
    subject: over.subject ?? 's',
    body: over.body ?? '',
    parents: [],
    branches: over.branches ?? [],
    tags: over.tags ?? [],
    isMerge: false,
    ...over
  };
}

function fakeGit(commits: Commit[], spy?: (q: unknown) => void): GitService {
  return {
    getCommits: async (q: unknown): Promise<PaginatedCommits> => {
      spy?.(q);
      return {
        commits,
        total: commits.length,
        page: 1,
        pageSize: commits.length || 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };
    }
  } as unknown as GitService;
}

describe('runNlSearch', () => {
  it('routes parsed filters into git getCommits', async () => {
    let received: any = null;
    const svc = fakeGit(
      [commit({ hash: 'a', subject: 'fix login bug', author: 'alice' })],
      (q) => (received = q)
    );
    const llm = new HeuristicProvider();
    const r = await runNlSearch(svc, llm, { query: 'login bug last week by alice' });
    expect(received.author).toBe('alice');
    expect(typeof received.since).toBe('string');
    expect(received.search).toMatch(/login|bug|auth/); // expanded
    expect(r.parsedQuery.author).toBe('alice');
    expect(r.parsedQuery.keywords).toEqual(expect.arrayContaining(['login', 'bug']));
    expect(r.usedLlm).toBe(false);
    expect(r.llmProvider).toBe('heuristic');
  });

  it('paginates the re-ranked results', async () => {
    const commits = Array.from({ length: 30 }, (_, i) =>
      commit({ hash: 'h' + i, subject: i % 2 ? 'auth fix' : 'unrelated' })
    );
    const svc = fakeGit(commits);
    const llm = new HeuristicProvider();
    const page1 = await runNlSearch(svc, llm, { query: 'auth', page: 1, pageSize: 10 });
    expect(page1.commits).toHaveLength(10);
    expect(page1.totalPages).toBe(3);
    expect(page1.hasPrevious).toBe(false);
    const page3 = await runNlSearch(svc, llm, { query: 'auth', page: 3, pageSize: 10 });
    expect(page3.hasNext).toBe(false);
    expect(page3.hasPrevious).toBe(true);
  });

  it('clamps pageSize and page', async () => {
    const svc = fakeGit([commit({ hash: 'a' })]);
    const llm = new HeuristicProvider();
    const r = await runNlSearch(svc, llm, { query: 'x', page: -5, pageSize: 999999 });
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(500);
  });

  it('uses an AI provider when one is supplied (usedLlm flag)', async () => {
    const aiLlm: LlmService = {
      name: 'anthropic',
      isAi: true,
      score: async (_q, cs) => cs.map((c) => ({ id: c.id, score: 0.5 })),
      summarize: async () => ''
    };
    const svc = fakeGit([commit({ hash: 'a', subject: 'fix login bug' })]);
    const r = await runNlSearch(svc, aiLlm, { query: 'login' });
    expect(r.usedLlm).toBe(true);
    expect(r.llmProvider).toBe('anthropic');
  });

  it('handles an empty query without throwing', async () => {
    const svc = fakeGit([commit({ hash: 'a', subject: 'x' })]);
    const llm = new HeuristicProvider();
    const r = await runNlSearch(svc, llm, { query: '' });
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.parsedQuery.keywords).toEqual([]);
  });

  it('escapes regex metacharacters in keywords passed to git --grep', async () => {
    let received: any = null;
    const svc = fakeGit([commit({ hash: 'a' })], (q) => (received = q));
    await runNlSearch(svc, new HeuristicProvider(), {
      query: 'foo.bar (baz) [x]'
    });
    expect(received.search).not.toContain('(baz)');
    expect(received.search).toContain('foo\\.bar');
  });
});
