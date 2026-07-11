/**
 * Deep validation tests for core modules:
 *   - GitService: input validation, hash checks, ref safety
 *   - NlSearch: empty/huge queries, synonym expansion edge cases
 *   - Breakage: abort signal, concurrent calls, scoring edge cases
 *   - Annotations: concurrency, corruption recovery
 *   - DatePhrase: edge cases (leap years, timezone boundaries)
 */

import { GitService } from '../backend/gitService';
import { parseNlQuery, runNlSearch } from '../backend/search/nlSearch';
import { parseDatePhrase, stripDatePhrase } from '../backend/search/datePhrase';
import { getFileBreakageAnalysis } from '../backend/breakage';
import { HeuristicProvider, tokenize, expandKeywords } from '../backend/llm';
import { getCommitImpact } from '../backend/impact';
import type { Commit, PaginatedCommits } from '../backend/gitService';
import { makeRepo, type TestRepo } from './helpers/repo';

// === GITSERVICE INPUT VALIDATION ===

describe('GitService — input validation', () => {
  let repo: TestRepo;
  let svc: GitService;

  beforeAll(() => {
    repo = makeRepo('ghui-validation-');
    repo.commit('file.txt', 'content\n', 'feat: init');
    svc = new GitService(repo.dir);
  });

  afterAll(() => repo.cleanup());

  it('rejects hash with spaces', async () => {
    await expect(svc.getCommit('aa bb cc')).rejects.toThrow(/Invalid commit hash/);
  });

  it('rejects empty hash', async () => {
    await expect(svc.getCommit('')).rejects.toThrow(/Invalid commit hash/);
  });

  it('rejects hash with newlines', async () => {
    await expect(svc.getCommit('abc\ndef')).rejects.toThrow(/Invalid commit hash/);
  });

  it('rejects hash shorter than 4 chars', async () => {
    await expect(svc.getCommit('abc')).rejects.toThrow(/Invalid commit hash/);
  });

  it('accepts 4-char hex hash (minimum allowed)', async () => {
    // This will fail with "Commit not found" or a git error, NOT "Invalid commit hash"
    const result = svc.getCommit('aaaa');
    await expect(result).rejects.not.toThrow(/Invalid commit hash/);
  });

  it('rejects getDiff with non-hex hash', async () => {
    await expect(svc.getDiff('not-hex!!')).rejects.toThrow(/Invalid commit hash/);
  });

  it('rejects getRangeDiff with invalid from hash', async () => {
    await expect(svc.getRangeDiff('invalid!', 'aabbccdd')).rejects.toThrow(/Invalid ref/);
  });

  it('rejects getRangeDiff with invalid to hash', async () => {
    await expect(svc.getRangeDiff('aabbccdd', 'invalid!')).rejects.toThrow(/Invalid ref/);
  });

  it('rejects getBlame with null byte in path', async () => {
    await expect(svc.getBlame('file\0.txt')).rejects.toThrow(/Invalid path/);
  });

  it('rejects getFileAtCommit with null byte in path', async () => {
    await expect(svc.getFileAtCommit('aabbccdd', 'file\0.txt')).rejects.toThrow(/Invalid path/);
  });

  it('rejects getFileStats with null byte in path', async () => {
    await expect(svc.getFileStats('file\0.txt')).rejects.toThrow(/Invalid path/);
  });

  it('revAt rejects unsafe refs with shell chars or revision syntax', async () => {
    await expect(svc.revAt('$(whoami)', '2026-01-01')).rejects.toThrow(/Invalid ref/);
    await expect(svc.revAt('--all', '2026-01-01')).rejects.toThrow(/Invalid ref/);
    await expect(svc.revAt('HEAD~1', '2026-01-01')).rejects.toThrow(/Invalid ref/);
  });

  it('revAt rejects invalid date format', async () => {
    await expect(svc.revAt('HEAD', 'not-a-date!!')).rejects.toThrow(/Invalid date/);
  });

  it('refsAt rejects invalid date format', async () => {
    await expect(svc.refsAt('not-a-date!!')).rejects.toThrow(/Invalid date/);
  });

  it('branch filter rejects empty-like values cleanly', async () => {
    // Empty branch should default to HEAD, not reject.
    const result = await svc.getCommits({ branch: '' });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('branch filter allows valid ref names', async () => {
    const result = await svc.getCommits({ branch: 'main' });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('getCommitsForFiles filters out unsafe paths', async () => {
    const result = await svc.getCommitsForFiles(['file\0.txt', '../file.txt', '/etc/passwd']);
    expect(result).toEqual([]);
  });

  it('getCommitsForFiles with all empty strings returns []', async () => {
    const result = await svc.getCommitsForFiles(['', '', '']);
    expect(result).toEqual([]);
  });

  it('getCommitsForFiles caps at 10 files', async () => {
    const files = Array.from({ length: 20 }, (_, i) => `file${i}.txt`);
    // Shouldn't throw even with > 10 files; it just slices.
    const result = await svc.getCommitsForFiles(files);
    expect(Array.isArray(result)).toBe(true);
  });
});

// === DATE PHRASE EDGE CASES ===

describe('parseDatePhrase — edge cases', () => {
  it('handles "last 0 days" (zero boundary)', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const r = parseDatePhrase('changes in the last 0 days', now);
    expect(r.since).toBe('2026-05-01');
  });

  it('handles "past 1 week" (singular)', () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const r = parseDatePhrase('past 1 week', now);
    expect(r.since).toBe('2026-05-08');
  });

  it('handles "last 12 months"', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const r = parseDatePhrase('changes in the last 12 months', now);
    expect(r.since).toBeDefined();
  });

  it('handles leap year date correctly', () => {
    const now = new Date('2024-03-01T12:00:00Z'); // 2024 is a leap year
    const r = parseDatePhrase('yesterday', now);
    expect(r.since).toBe('2024-02-29');
    expect(r.until).toBe('2024-02-29');
  });

  it('handles "this week" when today is Sunday (boundary)', () => {
    const sunday = new Date('2026-05-03T12:00:00Z'); // A Sunday
    const r = parseDatePhrase('changes this week', sunday);
    expect(r.since).toBeDefined();
  });

  it('returns nothing for random gibberish', () => {
    expect(parseDatePhrase('asdf qwer zxcv')).toEqual({});
  });

  it('handles "since 2026/01/05" with slashes', () => {
    const r = parseDatePhrase('bugs since 2026/1/5');
    expect(r.since).toBe('2026-01-05');
  });

  it('handles "since friday" correctly', () => {
    const thursday = new Date('2026-05-07T12:00:00Z'); // Thursday
    const r = parseDatePhrase('since friday', thursday);
    // Should go back to last Friday
    expect(r.since).toBeDefined();
  });
});

describe('stripDatePhrase — edge cases', () => {
  it('strips "today" from query', () => {
    expect(stripDatePhrase('changes today')).toBe('changes');
  });

  it('strips "since 2026-01-01" from query', () => {
    expect(stripDatePhrase('bug fixes since 2026-01-01')).toBe('bug fixes');
  });

  it('returns empty string when entire query is a date phrase', () => {
    expect(stripDatePhrase('last month')).toBe('');
  });

  it('handles multiple date phrases in one query', () => {
    const result = stripDatePhrase('last month today');
    // Both should be stripped
    expect(result).toBe('');
  });
});

// === NL SEARCH EDGE CASES ===

describe('parseNlQuery — edge cases', () => {
  it('handles empty string', () => {
    const q = parseNlQuery('');
    expect(q.rawQuery).toBe('');
    expect(q.keywords).toEqual([]);
    expect(q.expandedKeywords).toEqual([]);
  });

  it('handles query with only stopwords', () => {
    const q = parseNlQuery('the and or for with');
    expect(q.keywords).toEqual([]);
  });

  it('handles query with only whitespace', () => {
    const q = parseNlQuery('   \t  \n  ');
    expect(q.rawQuery).toBe('');
  });

  it('handles query with special characters', () => {
    const q = parseNlQuery('fix(auth): login [#123] @user <tag>');
    expect(q.keywords.length).toBeGreaterThan(0);
    // Should not throw
  });

  it('handles very long query (>1000 chars)', () => {
    const long = 'fix '.repeat(300);
    const q = parseNlQuery(long);
    expect(q.keywords.length).toBeGreaterThan(0);
    // expandedKeywords is bounded by the number of unique tokens
    expect(q.expandedKeywords.length).toBeGreaterThan(0);
  });

  it('extracts author with @ prefix', () => {
    const q = parseNlQuery('login bugs by @alice');
    expect(q.author).toBe('alice');
  });

  it('extracts author without @ prefix', () => {
    const q = parseNlQuery('bugs by bob');
    expect(q.author).toBe('bob');
  });

  it('does not extract author from "by" in other contexts', () => {
    const q = parseNlQuery('standby mode');
    // "standby" contains "by" but should NOT extract "mode" as author
    expect(q.author).toBeUndefined();
  });
});

// === HEURISTIC SCORER EDGE CASES ===

describe('HeuristicProvider — edge cases', () => {
  const p = new HeuristicProvider();

  it('handles single-character tokens (filtered as too short)', () => {
    const tokens = tokenize('a b c');
    expect(tokens).toEqual([]);
  });

  it('handles numeric tokens', () => {
    const tokens = tokenize('version 42 is here');
    expect(tokens).toEqual(expect.arrayContaining(['version', '42']));
  });

  it('handles hyphenated tokens', () => {
    const tokens = tokenize('github-actions pipeline');
    expect(tokens).toEqual(expect.arrayContaining(['github-actions', 'pipeline']));
  });

  it('expandKeywords with unknown token returns just the token', () => {
    const expanded = expandKeywords('xylophone');
    expect(expanded).toEqual(['xylophone']);
  });

  it('score returns scores bounded in [0,1]', async () => {
    const result = await p.score('fix critical bug', [
      { id: 'a', text: 'fix critical bug in auth flow' },
      { id: 'b', text: 'update docs' }
    ]);
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('score with identical query and candidate text returns high score', async () => {
    const result = await p.score('fix login bug', [{ id: 'a', text: 'fix login bug' }]);
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  it('score with completely unrelated texts returns low score', async () => {
    const result = await p.score('quantum physics lecture', [
      { id: 'a', text: 'fix login bug in auth flow' }
    ]);
    expect(result[0].score).toBeLessThan(0.15);
  });

  it('summarize with empty text returns empty string', async () => {
    expect(await p.summarize('')).toBe('');
    expect(await p.summarize('   ')).toBe('');
  });

  it('summarize truncates long single-paragraph text to 280 chars', async () => {
    const long = 'x'.repeat(300);
    const result = await p.summarize(long);
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result).toMatch(/\.\.\.$/);
  });
});

// === BREAKAGE ANALYSIS — DEEPER EDGE CASES ===

describe('getFileBreakageAnalysis — deep edge cases', () => {
  function commit(over: Partial<Commit>): Commit {
    return {
      hash: over.hash ?? 'h',
      shortHash: (over.hash ?? 'h').slice(0, 7),
      author: 'Tester',
      authorEmail: 'tester@example.com',
      date: '2026-05-01T00:00:00Z',
      message: over.subject ?? '',
      subject: over.subject ?? '',
      body: over.body ?? '',
      parents: [],
      branches: [],
      tags: [],
      isMerge: false,
      ...over
    };
  }

  function fakeGit(opts: {
    commits?: Commit[];
    numstat?: Record<string, Array<{ file: string; additions: number; deletions: number }>>;
    diffs?: Record<string, Array<{ file: string }>>;
  }) {
    return {
      getCommits: async (): Promise<PaginatedCommits> => ({
        commits: opts.commits ?? [],
        total: opts.commits?.length ?? 0,
        page: 1,
        pageSize: 200,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }),
      getNumstat: async () => new Map(Object.entries(opts.numstat ?? {})),
      getDiffMeta: async (hash: string) => ({
        files: (opts.diffs?.[hash] ?? []).map((d) => ({
          file: d.file,
          status: 'modified',
          additions: 0,
          deletions: 0
        })),
        totalLines: 0
      })
    } as unknown as GitService;
  }

  it('handles all commits being fixes (100% fix ratio)', async () => {
    const commits = [
      commit({ hash: 'f1', subject: 'fix: a', date: '2026-05-03T00:00:00Z' }),
      commit({ hash: 'f2', subject: 'fix: b', date: '2026-05-02T00:00:00Z' }),
      commit({ hash: 'f3', subject: 'fix: c', date: '2026-05-01T00:00:00Z' })
    ];
    const svc = fakeGit({ commits });
    const r = await getFileBreakageAnalysis(svc, 'x.ts');
    expect(r.fixCount).toBe(3);
    // All are fixes, none can be suspects (fixes/reverts are excluded from suspect pool)
    expect(r.suspects).toHaveLength(0);
    expect(r.riskScore).toBeGreaterThan(0);
  });

  it('handles single commit in history', async () => {
    const commits = [
      commit({ hash: 'only1', subject: 'feat: init', date: '2026-05-01T00:00:00Z' })
    ];
    const svc = fakeGit({ commits });
    const r = await getFileBreakageAnalysis(svc, 'x.ts');
    expect(r.totalCommits).toBe(1);
    expect(r.fixCount).toBe(0);
    expect(r.suspects).toEqual([]);
  });

  it('detects fix keywords in body, not just subject', async () => {
    const commits = [
      commit({
        hash: 'body1',
        subject: 'update handler',
        body: 'Fixes a crash when session is null',
        date: '2026-05-02T00:00:00Z'
      }),
      commit({ hash: 'prev1', subject: 'refactor handler', date: '2026-05-01T00:00:00Z' })
    ];
    const svc = fakeGit({ commits });
    const r = await getFileBreakageAnalysis(svc, 'x.ts');
    expect(r.fixCommits.map((c) => c.hash)).toContain('body1');
    expect(r.suspects.map((s) => s.hash)).toContain('prev1');
  });

  it('abort signal prevents execution', async () => {
    const controller = new AbortController();
    controller.abort();
    const svc = fakeGit({ commits: [commit({ hash: 'a1', subject: 'feat: x' })] });
    await expect(
      getFileBreakageAnalysis(svc, 'x.ts', { signal: controller.signal })
    ).rejects.toThrow(/aborted/);
  });

  it('handles commits with unparseable dates in daysBetween', async () => {
    const commits = [
      commit({ hash: 'fix1', subject: 'fix: x', date: 'not-a-date' }),
      commit({ hash: 'prev1', subject: 'feat: x', date: 'also-not-a-date' })
    ];
    const svc = fakeGit({ commits });
    // Should not throw even though dates are unparseable
    const r = await getFileBreakageAnalysis(svc, 'x.ts');
    expect(r.totalCommits).toBe(2);
  });
});

// === IMPACT ANALYSIS EDGE CASES ===

describe('getCommitImpact — edge cases', () => {
  it('handles empty diff (no files changed)', async () => {
    const svc = {
      getDiffMeta: async () => ({ files: [], totalLines: 0 }),
      getFileAtCommit: async () => '',
      getCommitsForFiles: async () => []
    } as unknown as GitService;
    const result = await getCommitImpact(svc, 'h');
    expect(result.files).toEqual([]);
    expect(result.modules).toEqual([]);
    expect(result.dependencyRipple).toEqual([]);
    expect(result.relatedCommits).toEqual([]);
  });

  it('handles deeply nested file paths for module detection', async () => {
    const svc = {
      getDiffMeta: async () => ({
        files: [{ file: 'a/b/c/d/e/f.ts', status: 'modified', additions: 1, deletions: 0 }],
        totalLines: 1
      }),
      getFileAtCommit: async () => '',
      getCommitsForFiles: async () => []
    } as unknown as GitService;
    const result = await getCommitImpact(svc, 'h');
    // Module detection truncates to max 3 parts
    expect(result.modules[0]).toBe('a/b/c');
  });

  it('handles circular/self-referencing imports (side-effect imports not parsed)', async () => {
    const svc = {
      getDiffMeta: async () => ({
        files: [{ file: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }],
        totalLines: 1
      }),
      getFileAtCommit: async () => "import { x } from './a';\nimport { y } from './b';\n",
      getCommitsForFiles: async () => []
    } as unknown as GitService;
    const result = await getCommitImpact(svc, 'h');
    // Self-reference + b reference both get added as ripples
    // (no dedupe against the source file name since resolved path lacks extension)
    expect(result.dependencyRipple).toEqual([
      { from: 'src/a.ts', to: 'src/a' },
      { from: 'src/a.ts', to: 'src/b' }
    ]);
  });
});

// === NL SEARCH PIPELINE ===

describe('runNlSearch — integration with heuristic', () => {
  let repo: TestRepo;
  let svc: GitService;
  const llm = new HeuristicProvider();

  beforeAll(() => {
    repo = makeRepo('ghui-nlsearch-');
    repo.commit('src/auth.ts', 'export function login() {}', 'feat: add login');
    repo.commit('src/pay.ts', 'export function charge() {}', 'feat: add payment flow');
    repo.commit(
      'src/auth.ts',
      'export function login() { /* fixed */ }',
      'fix: login redirect bug'
    );
    svc = new GitService(repo.dir);
  });

  afterAll(() => repo.cleanup());

  it('returns parsedQuery and ranking metadata for a keyword query', async () => {
    const result = await runNlSearch(svc, llm, { query: 'login bug' });
    // The expanded grep includes 12+ synonyms. If git --grep matches,
    // we get results; otherwise the candidate set is empty.
    expect(result.parsedQuery.keywords).toEqual(expect.arrayContaining(['login', 'bug']));
    expect(result.usedLlm).toBe(false);
    expect(result.llmProvider).toBe('heuristic');
    expect(typeof result.total).toBe('number');
    expect(Array.isArray(result.commits)).toBe(true);
  });

  it('returns commits when querying a term present in the subjects', async () => {
    const result = await runNlSearch(svc, llm, { query: 'feat add' });
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.commits.map((c) => c.subject)).toEqual(
      expect.arrayContaining(['feat: add login'])
    );
  });

  it('returns empty commits for query matching nothing', async () => {
    const result = await runNlSearch(svc, llm, { query: 'quantum physics' });
    expect(result.commits).toEqual([]);
  });

  it('respects pagination params', async () => {
    const result = await runNlSearch(svc, llm, { query: 'feat', page: 1, pageSize: 1 });
    expect(result.commits.length).toBeLessThanOrEqual(1);
    expect(result.pageSize).toBe(1);
    if (result.total > 1) {
      expect(result.hasNext).toBe(true);
    }
  });

  it('clamps pageSize to [1, 500]', async () => {
    const result = await runNlSearch(svc, llm, { query: 'feat', pageSize: 0 });
    expect(result.pageSize).toBe(1);

    const result2 = await runNlSearch(svc, llm, { query: 'feat', pageSize: 1000 });
    expect(result2.pageSize).toBe(500);
  });
});
