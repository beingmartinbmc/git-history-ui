const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Expand date-only filters so their boundary days are included in full. */
export function normalizeDateFilter(value: string, boundary: 'since' | 'until'): string {
  if (!DATE_ONLY.test(value)) return value;
  return `${value}T${boundary === 'since' ? '00:00:00' : '23:59:59.999'}`;
}
