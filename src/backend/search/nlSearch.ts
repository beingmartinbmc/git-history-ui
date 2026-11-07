import { expandKeywords, tokenize } from '../llm/heuristicProvider';
import type { LlmService } from '../llm/types';
import type { Commit, GitService, PaginatedCommits } from '../gitService';
import { parseDatePhrase, stripDatePhrase } from './datePhrase';
import { ResultCache } from '../cache/resultCache';

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

/** Candidate source that replaces `git log --grep` (the SQLite index). Must scope to HEAD. */
export interface NlCandidateIndex {
  candidates(
    terms: string[],
    filters: { author?: string; since?: string; until?: string },
    limit: number
  ): Promise<{ commits: Commit[]; total: number }>;
}

/** The full ranked candidate list, cached so every page slices the same ranking. */
export interface NlRanking {
  ranked: Commit[];
  availableTotal: number;
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
  /** Retrieve candidates here instead of `git log` (only valid without branch/file scope). */
  index?: NlCandidateIndex;
  /** Keeps ranking (and any paid LLM call) stable across pages of one query. */
  rankCache?: ResultCache<NlRanking>;
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

  // Candidates are pulled and ranked once per query; pages are slices of that ranking.
  const rank = async (signal?: AbortSignal): Promise<NlRanking> => {
    const filters = {
      author: parsed.author ?? options.author,
      since: parsed.since ?? options.since,
      until: parsed.until ?? options.until
    };
    let candidates: { commits: Commit[]; total: number };
    if (options.index) {
      const found = await options.index.candidates(top, filters, candidateCap);
      candidates = { commits: await gitService.attachRefs(found.commits), total: found.total };
    } else {
      // We deliberately ignore pagination here so we can re-rank.
      const page1 = await gitService.getCommits(
        {
          ...filters,
          branch: options.branch,
          file: options.file,
          search: grep,
          page: 1,
          pageSize: candidateCap
        },
        { signal }
      );
      candidates = { commits: page1.commits, total: page1.total };
    }

    const scored = await llm.score(
      options.query,
      candidates.commits.map((c) => ({ id: c.hash, text: textForScoring(c) })),
      { signal }
    );

    // Map back to commits, sort by score (desc).
    const byHash = new Map(candidates.commits.map((c) => [c.hash, c]));
    const ranked = scored
      .map((s) => ({ score: s.score, commit: byHash.get(s.id) }))
      .filter((r): r is { score: number; commit: Commit } => !!r.commit)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.commit);
    return { ranked, availableTotal: candidates.total };
  };

  // A shared (cached) computation must not die with one client's abort.
  const { ranked, availableTotal } = options.rankCache
    ? await options.rankCache.getOrCompute(
        ResultCache.key({
          q: options.query,
          author: options.author,
          since: options.since,
          until: options.until,
          branch: options.branch,
          file: options.file,
          cap: candidateCap,
          llm: llm.name
        }),
        () => rank()
      )
    : await rank(options.signal);

  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const slice = ranked.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    commits: slice,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    truncated: availableTotal > total,
    availableTotal,
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
