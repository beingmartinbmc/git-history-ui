/**
 * Tiny dependency-free natural-language date phrase parser.
 * Returns ISO date strings (YYYY-MM-DD) for `since`/`until` slots.
 *
 * Handles the common phrases users actually type:
 *   - "last week" / "last month" / "last year"
 *   - "this week" / "this month"
 *   - "yesterday" / "today"
 *   - "in the last 30 days" / "past 2 weeks" / "last 3 months"
 *   - "since friday" / "since 2026-01-01"
 *   - bare ISO dates pass through
 */

export interface DateRange {
  since?: string;
  until?: string;
  matchedPhrase?: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function parseDatePhrase(query: string, now: Date = new Date()): DateRange {
  const text = ' ' + query.toLowerCase() + ' ';

  // "in the last N days/weeks/months/years" or "past N weeks" or "last 3 months"
  const recent = text.match(/\b(?:in\s+the\s+)?(?:last|past)\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (recent) {
    const n = parseInt(recent[1], 10);
    const unit = recent[2];
    const since = subtract(now, n, unit);
    return { since: iso(since), matchedPhrase: recent[0].trim() };
  }

  // "last week"
  if (/\blast\s+week\b/.test(text)) {
    return { since: iso(subtract(now, 7, 'day')), matchedPhrase: 'last week' };
  }
  // "last month"
  if (/\blast\s+month\b/.test(text)) {
    return { since: iso(subtract(now, 30, 'day')), matchedPhrase: 'last month' };
  }
  // "last year"
  if (/\blast\s+year\b/.test(text)) {
    return { since: iso(subtract(now, 365, 'day')), matchedPhrase: 'last year' };
  }
  // "this week"
  if (/\bthis\s+week\b/.test(text)) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return { since: iso(d), matchedPhrase: 'this week' };
  }
  // "this month"
  if (/\bthis\s+month\b/.test(text)) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { since: iso(d), matchedPhrase: 'this month' };
  }
  // "yesterday"
  if (/\byesterday\b/.test(text)) {
    const d = subtract(now, 1, 'day');
    return { since: iso(d), until: iso(d), matchedPhrase: 'yesterday' };
  }
  // "today"
  if (/\btoday\b/.test(text)) {
    return { since: iso(now), matchedPhrase: 'today' };
  }

  // "since <weekday>"
  const sinceWd = text.match(/\bsince\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (sinceWd) {
    const target = WEEKDAYS.indexOf(sinceWd[1]);
    const cur = now.getUTCDay();
    const diff = ((cur - target + 7) % 7) || 7;
    return { since: iso(subtract(now, diff, 'day')), matchedPhrase: sinceWd[0] };
  }

  // "since <iso-date>" or "since <yyyy/mm/dd>"
  const sinceIso = text.match(/\bsince\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
  if (sinceIso) {
    return { since: normalizeDate(sinceIso[1]), matchedPhrase: sinceIso[0] };
  }

  // bare iso date in query
  const bareIso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (bareIso) {
    return { since: bareIso[1], matchedPhrase: bareIso[1] };
  }

  return {};
}

function subtract(d: Date, n: number, unit: string): Date {
  const out = new Date(d);
  if (unit.startsWith('day')) out.setUTCDate(out.getUTCDate() - n);
  else if (unit.startsWith('week')) out.setUTCDate(out.getUTCDate() - 7 * n);
  else if (unit.startsWith('month')) out.setUTCMonth(out.getUTCMonth() - n);
  else if (unit.startsWith('year')) out.setUTCFullYear(out.getUTCFullYear() - n);
  return out;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeDate(s: string): string {
  return s.replace(/\//g, '-').split('-').map((p, i) => (i === 0 ? p : p.padStart(2, '0'))).join('-');
}

/** Strip date-related phrases from the query so they don't pollute keyword search. */
export function stripDatePhrase(query: string): string {
  const phrases = [
    /\b(?:in\s+the\s+)?(?:last|past)\s+\d+\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
    /\blast\s+(?:week|month|year)\b/gi,
    /\bthis\s+(?:week|month)\b/gi,
    /\b(?:yesterday|today)\b/gi,
    /\bsince\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    /\bsince\s+\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gi
  ];
  let out = query;
  for (const re of phrases) out = out.replace(re, ' ');
  return out.replace(/\s+/g, ' ').trim();
}
