import { parseDatePhrase, stripDatePhrase } from '../backend/search/datePhrase';
import { parseNlQuery } from '../backend/search/nlSearch';

describe('parseDatePhrase', () => {
  const NOW = new Date('2026-05-01T12:00:00Z');

  it('handles "last month"', () => {
    const r = parseDatePhrase('payment changes last month', NOW);
    expect(r.since).toBe('2026-04-01');
  });

  it('handles "in the last 30 days"', () => {
    const r = parseDatePhrase('bug fixes in the last 30 days', NOW);
    expect(r.since).toBe('2026-04-01');
  });

  it('handles "yesterday" with both since and until equal', () => {
    const r = parseDatePhrase('yesterday', NOW);
    expect(r.since).toBe('2026-04-30');
    expect(r.until).toBe('2026-04-30');
  });

  it('handles bare ISO dates', () => {
    const r = parseDatePhrase('something on 2026-03-15', NOW);
    expect(r.since).toBe('2026-03-15');
  });

  it('returns nothing for non-temporal queries', () => {
    expect(parseDatePhrase('login bug', NOW)).toEqual({});
  });
});

describe('stripDatePhrase', () => {
  it('removes date phrases cleanly', () => {
    expect(stripDatePhrase('login bug last month')).toBe('login bug');
    expect(stripDatePhrase('changes in the last 7 days by alice')).toBe('changes by alice');
  });
});

describe('parseNlQuery', () => {
  const NOW = new Date('2026-05-01T12:00:00Z');

  it('extracts author, date, and keywords', () => {
    const q = parseNlQuery('login bug last month by alice');
    expect(q.author).toBe('alice');
    expect(q.keywords).toEqual(expect.arrayContaining(['login', 'bug']));
    expect(q.expandedKeywords).toEqual(expect.arrayContaining(['auth']));
    // date phrase is stripped from raw keywords
    expect(q.keywords).not.toContain('last');
    expect(q.keywords).not.toContain('month');
  });

  it('preserves rawQuery exactly', () => {
    const q = parseNlQuery('  Where did we fix login?  ');
    expect(q.rawQuery).toBe('Where did we fix login?');
  });

  it('handles bare keyword queries', () => {
    const q = parseNlQuery('payments');
    expect(q.keywords).toEqual(['payments']);
    expect(q.expandedKeywords).toEqual(expect.arrayContaining(['payments', 'payment', 'billing']));
    expect(q.author).toBeUndefined();
    expect(q.since).toBeUndefined();
  });
  // Mark NOW as referenced so eslint doesn't complain
  void NOW;
});

describe('runNlSearch', () => {
  it('returns nothing for a stopword-only query instead of every commit', async () => {
    const { runNlSearch } = await import('../backend/search/nlSearch');
    const { makeRepo } = await import('./helpers/repo');
    const { GitService } = await import('../backend/gitService');
    const repo = makeRepo('ghui-nl-stop-');
    try {
      repo.commit('a.txt', 'a', 'something');
      const r = await runNlSearch(
        new GitService(repo.dir),
        { name: 'heuristic', isAi: false, score: async () => [], summarize: async () => '' },
        {
          query: 'the and of'
        }
      );
      expect(r.commits).toEqual([]);
      expect(r.total).toBe(0);
    } finally {
      repo.cleanup();
    }
  });
});
