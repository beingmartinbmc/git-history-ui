import type { LlmService, ScoreCandidate, ScoredCandidate } from './types';

/**
 * Synonyms expand a single query token into a set of related tokens.
 * Designed for software engineering vocabulary: bug fixes, features,
 * common subsystems. Keep entries lower-case.
 */
const SYNONYMS: Record<string, string[]> = {
  fix: ['fix', 'bug', 'hotfix', 'patch', 'repair', 'correct', 'resolve'],
  bug: ['bug', 'fix', 'hotfix', 'issue', 'defect', 'regression'],
  feat: ['feat', 'feature', 'add', 'implement', 'introduce', 'new'],
  add: ['add', 'feat', 'feature', 'implement', 'introduce'],
  remove: ['remove', 'delete', 'drop', 'deprecate', 'kill'],
  refactor: ['refactor', 'cleanup', 'restructure', 'rework', 'simplify'],
  perf: ['perf', 'performance', 'optimize', 'speed', 'fast', 'cache'],
  docs: ['docs', 'doc', 'documentation', 'readme', 'comment', 'comments'],
  test: ['test', 'tests', 'spec', 'unit', 'integration', 'e2e'],
  ci: ['ci', 'pipeline', 'workflow', 'github-actions', 'jenkins', 'travis'],
  build: ['build', 'compile', 'webpack', 'vite', 'rollup', 'esbuild'],
  deps: ['deps', 'dependencies', 'upgrade', 'bump', 'update', 'package'],
  auth: [
    'auth',
    'authentication',
    'login',
    'logout',
    'signin',
    'signout',
    'oauth',
    'jwt',
    'session',
    'token'
  ],
  login: ['login', 'logon', 'signin', 'sign-in', 'auth', 'authentication'],
  payment: ['payment', 'payments', 'pay', 'billing', 'invoice', 'charge', 'stripe', 'checkout'],
  ui: ['ui', 'frontend', 'view', 'component', 'css', 'style', 'theme'],
  api: ['api', 'endpoint', 'route', 'rest', 'graphql', 'rpc', 'service'],
  db: ['db', 'database', 'sql', 'migration', 'schema', 'query', 'postgres', 'mysql', 'mongo'],
  security: ['security', 'cve', 'vuln', 'vulnerability', 'audit', 'xss', 'csrf', 'sqli'],
  release: ['release', 'tag', 'version', 'publish', 'changelog']
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'was',
  'be',
  'i',
  'we',
  'our',
  'my',
  'me',
  'it',
  'this',
  'that',
  'these',
  'those',
  'where',
  'when',
  'what',
  'which',
  'who',
  'how',
  'did',
  'do',
  'does',
  'has',
  'have',
  'had',
  'last',
  'changes',
  'change',
  'commit',
  'commits',
  'related'
]);

// Reverse synonym map built once: every member token maps to all its bucket-mates.
const REVERSE_SYNONYMS: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const [key, members] of Object.entries(SYNONYMS)) {
    const all = new Set<string>([key, ...members]);
    for (const m of all) {
      const cur = map.get(m);
      if (cur) for (const a of all) cur.add(a);
      else map.set(m, new Set(all));
    }
  }
  return map;
})();

export function expandKeywords(query: string): string[] {
  const tokens = tokenize(query);
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    const syn = REVERSE_SYNONYMS.get(t);
    if (syn) for (const s of syn) out.add(s);
  }
  return Array.from(out);
}

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-/.]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Heuristic relevance scorer based on token overlap with synonym expansion
 * and a small TF-IDF-ish weighting (rare tokens count more).
 */
export class HeuristicProvider implements LlmService {
  readonly name = 'heuristic' as const;
  readonly isAi = false;

  async score(query: string, candidates: ScoreCandidate[]): Promise<ScoredCandidate[]> {
    const queryTokens = expandKeywords(query);
    if (queryTokens.length === 0) {
      return candidates.map((c) => ({ id: c.id, score: 0 }));
    }

    // Document frequency for IDF weighting.
    const docFreq = new Map<string, number>();
    const docTokens: string[][] = candidates.map((c) => {
      const toks = tokenize(c.text);
      const seen = new Set(toks);
      for (const t of seen) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
      return toks;
    });
    const N = Math.max(1, candidates.length);

    return candidates.map((c, i) => {
      const tokens = docTokens[i];
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      let raw = 0;
      let matched = 0;
      for (const qt of queryTokens) {
        const f = tf.get(qt);
        if (!f) continue;
        matched++;
        const idf = Math.log(1 + N / (1 + (docFreq.get(qt) ?? 0)));
        raw += (1 + Math.log(f)) * idf;
      }
      const coverage = matched / queryTokens.length;
      const length = Math.max(1, tokens.length);
      const norm = raw / Math.sqrt(length);
      return { id: c.id, score: Math.min(1, 0.55 * coverage + 0.45 * Math.tanh(norm)) };
    });
  }

  async summarize(text: string, _opts?: { hint?: string; maxTokens?: number }): Promise<string> {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';
    // Heuristic summary: first non-empty paragraph, truncated.
    const para = trimmed.split(/\n\n+/).find((p) => p.trim().length > 0) ?? trimmed;
    const oneLine = para.replace(/\s+/g, ' ').trim();
    return oneLine.length > 280 ? oneLine.substring(0, 277) + '...' : oneLine;
  }
}
