import { parseDatePhrase, stripDatePhrase } from '../backend/search/datePhrase';

const NOW = new Date('2026-05-15T12:00:00Z'); // Friday

describe('parseDatePhrase', () => {
  it('parses "in the last N <unit>"', () => {
    expect(parseDatePhrase('bugs in the last 30 days', NOW).since).toBe('2026-04-15');
    expect(parseDatePhrase('past 2 weeks', NOW).since).toBe('2026-05-01');
    expect(parseDatePhrase('last 3 months', NOW).since).toBe('2026-02-15');
    expect(parseDatePhrase('last 1 year', NOW).since).toBe('2025-05-15');
  });

  it('parses "last week / month / year"', () => {
    expect(parseDatePhrase('login bug last week', NOW).since).toBe('2026-05-08');
    expect(parseDatePhrase('payments last month', NOW).since).toBe('2026-04-15');
    expect(parseDatePhrase('refactors last year', NOW).since).toBe('2025-05-15');
  });

  it('parses "this week / this month"', () => {
    const week = parseDatePhrase('this week', NOW);
    expect(week.since).toBe('2026-05-10');
    expect(parseDatePhrase('this month', NOW).since).toBe('2026-05-01');
  });

  it('parses "yesterday" with both since and until on the same day', () => {
    const r = parseDatePhrase('yesterday', NOW);
    expect(r.since).toBe('2026-05-14');
    expect(r.until).toBe('2026-05-14');
  });

  it('parses "today"', () => {
    expect(parseDatePhrase('today', NOW).since).toBe('2026-05-15');
  });

  it('parses "since <weekday>" relative to the current day', () => {
    // NOW is Friday → "since friday" rewinds a full week.
    expect(parseDatePhrase('since friday', NOW).since).toBe('2026-05-08');
    // "since wednesday" → 2 days back.
    expect(parseDatePhrase('since wednesday', NOW).since).toBe('2026-05-13');
  });

  it('parses "since <iso>" and bare ISO dates', () => {
    expect(parseDatePhrase('since 2026-01-01', NOW).since).toBe('2026-01-01');
    expect(parseDatePhrase('regression since 2026/2/3', NOW).since).toBe('2026-02-03');
    expect(parseDatePhrase('failures around 2026-04-22', NOW).since).toBe('2026-04-22');
  });

  it('returns an empty range when no phrase matches', () => {
    expect(parseDatePhrase('login bug', NOW)).toEqual({});
    expect(parseDatePhrase('', NOW)).toEqual({});
  });
});

describe('stripDatePhrase', () => {
  it('removes recognized date phrases and collapses whitespace', () => {
    expect(stripDatePhrase('login bug last month please')).toBe('login bug please');
    expect(stripDatePhrase('payments yesterday')).toBe('payments');
    expect(stripDatePhrase('issue since 2026-01-01 reopened')).toBe('issue reopened');
    expect(stripDatePhrase('flaky test in the last 7 days')).toBe('flaky test');
    expect(stripDatePhrase('since friday hotfix')).toBe('hotfix');
  });

  it('is a no-op when nothing matches', () => {
    expect(stripDatePhrase('plain query')).toBe('plain query');
  });
});
