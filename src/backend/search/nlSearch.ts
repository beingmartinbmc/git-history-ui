import { expandKeywords, tokenize } from '../llm/heuristicProvider';
import type { LlmService } from '../llm/types';
import type { Commit, GitService, PaginatedCommits } from '../gitService';
import { parseDatePhrase, stripDatePhrase } from './datePhrase';

export interface NlInterpretation {
  rawQuery: string;
  keywords: string[];
  expandedKeywords: string[];
  author?: string;
  since?: string;
  until?: string;
}

export interface NlSearchResult extends PaginatedCommits {
  /** True when more commits matched than the ranked candidate window holds. */
  truncated: boolean;
  /** Commits matching the filters in git, before the candidate cap. */
  availableTotal: number;
  parsedQuery: NlInterpretation;
  usedLlm: boolean;
  llmProvider: 'heuristic' | 'anthropic' | 'openai';
}

const AUTHOR_PHRASE = /\bby\s+@?([a-zA-Z][\w.-]*)\b/i;

/**
 * Parse a free-form NL query into structured filter components plus a
 * cleaned keyword list. Pure function — no I/O.
 */
export function parseNlQuery(query: string): NlInterpretation {
  const raw = (query || '').trim();
  const dateRange = parseDatePhrase(raw);
  const authorMatch = raw.match(AUTHOR_PHRASE);
  const author = authorMatch ? authorMatch[1] : undefined;

  let cleaned = stripDatePhrase(raw);
  if (author) cleaned = cleaned.replace(AUTHOR_PHRASE, ' ').replace(/\s+/g, ' ').trim();

  const keywords = tokenize(cleaned);
  const expandedKeywords = expandKeywords(cleaned);

  return {
    rawQuery: raw,
    keywords,
    expandedKeywords,
    author,
    since: dateRange.since,
    until: dateRange.until
  };
}

export interface NlSearchOptions {
  query: string;
  author?: string;
  since?: string;
  until?: string;
  branch?: string;
  file?: string;
  page?: number;
  pageSize?: number;
  /** Cap on candidates pulled from git for LLM rerank. */
  candidateCap?: number;
  signal?: AbortSignal;
}

/**
 * NL search pipeline:
 *   1. Parse query into structured filters (date/author/keywords).
 *   2. Pull candidates via existing git-log filtering (uses author/since/until/regex on keywords).
 *   3. Score with LlmService (heuristic by default, optional AI rerank).
 *   4. Sort by score, paginate.
 */
export async function runNlSearch(
  gitService: GitService,
  llm: LlmService,
  options: NlSearchOptions
): Promise<NlSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(500, options.pageSize ?? 25));
  const candidateCap = Math.max(pageSize, Math.min(1000, options.candidateCap ?? 200));

  const parsed = parseNlQuery(options.query);

  // Build a search regex for git log --grep: union of expanded keywords (with word-ish boundaries).
  // Limit length to keep arg list sane.
  const top = parsed.expandedKeywords.slice(0, 12);
  const grep = top.length > 0 ? top.map(escapeForGrep).join('|') : undefined;

  // Stopwords only ("the and of") carry no signal: don't fall through to "match everything".
  if (top.length === 0 && !parsed.author && !parsed.since && !parsed.until) {
    return {
      commits: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
      hasNext: false,
      hasPrevious: page > 1,
      truncated: false,
      availableTotal: 0,
      parsedQuery: parsed,
      usedLlm: llm.isAi,
      llmProvider: llm.name
    };
  }

  // Pull candidate set. We deliberately ignore pagination here so we can re-rank.
  const candidatesPage = await gitService.getCommits(
    {
      author: parsed.author ?? options.author,
      since: parsed.since ?? options.since,
      until: parsed.until ?? options.until,
      branch: options.branch,
      file: options.file,
      search: grep,
      page: 1,
      pageSize: candidateCap
    },
    { signal: options.signal }
  );

  const scored = await llm.score(
    options.query,
    candidatesPage.commits.map((c) => ({
      id: c.hash,
      text: textForScoring(c)
    })),
    { signal: options.signal }
  );

  // Map back to commits, sort by score (desc).
  const byHash = new Map(candidatesPage.commits.map((c) => [c.hash, c]));
  const ranked = scored
    .map((s) => ({ score: s.score, commit: byHash.get(s.id) }))
    .filter((r): r is { score: number; commit: Commit } => !!r.commit)
    .sort((a, b) => b.score - a.score);

  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const slice = ranked.slice(start, start + pageSize).map((r) => r.commit);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    commits: slice,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    truncated: candidatesPage.total > total,
    availableTotal: candidatesPage.total,
    parsedQuery: parsed,
    usedLlm: llm.isAi,
    llmProvider: llm.name
  };
}

function textForScoring(c: Commit): string {
  return `${c.subject}\n${c.body}\n${c.author}\n${c.branches.join(' ')}\n${c.tags.join(' ')}`;
}

function escapeForGrep(token: string): string {
  // Escape POSIX BRE/ERE metacharacters (git --grep is ERE with --regexp-ignore-case).
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
