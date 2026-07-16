import { normalizeDateFilter } from '../backend/dateFilter';

describe('normalizeDateFilter', () => {
  it('expands date-only values to inclusive day boundaries', () => {
    expect(normalizeDateFilter('2026-04-30', 'since')).toBe('2026-04-30T00:00:00');
    expect(normalizeDateFilter('2026-04-30', 'until')).toBe('2026-04-30T23:59:59.999');
  });

  it('preserves explicit timestamps and relative Git dates', () => {
    expect(normalizeDateFilter('2026-04-30T12:30:00Z', 'until')).toBe('2026-04-30T12:30:00Z');
    expect(normalizeDateFilter('2 weeks ago', 'since')).toBe('2 weeks ago');
  });
});
