import type { GitService } from './gitService';

/**
 * Breakage Analysis — heuristic, SZZ-lite "what likely broke this file".
 *
 * Inputs: a file path. Outputs:
 *   - the recent commits that touched the file (with churn);
 *   - which of those look like fix/revert/hotfix commits;
 *   - "suspect" commits scored by how strongly they correlate with the
 *     fixes that followed them (immediately preceding a fix, large
 *     churn, fix landed within a week, etc.);
 *   - co-changed files (files commonly modified alongside the fix
 *     commits that touched this file);
 *   - a coarse risk score / one-line summary for the UI.
 *
 * The scoring is intentionally local and explainable — every suspect
 * carries a `reasons[]` array so the UI can show *why* a commit is
 * flagged. We do not try to do real SZZ blame because it requires
 * line-level history and is far slower; this heuristic catches the most
 * common "regression introduced by the previous touch" pattern with
 * essentially zero extra git roundtrips.
 */

export interface BreakageCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  isFix: boolean;
  isRevert: boolean;
  additions: number;
  deletions: number;
  churn: number;
}

export interface BreakageFixRef {
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
}

export interface BreakageSuspect {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  churn: number;
  score: number;
  reasons: string[];
  linkedFixes: BreakageFixRef[];
}

export interface CoChangedFile {
  file: string;
  count: number;
}

export interface BreakageAnalysis {
  file: string;
  totalCommits: number;
  fixCount: number;
  riskScore: number;
  summary: string;
  commits: BreakageCommit[];
  fixCommits: BreakageCommit[];
  suspects: BreakageSuspect[];
  coChangedFiles: CoChangedFile[];
}

const FIX_RE =
  /\b(fix(?:e[ds])?|fixing|bug(?:fix)?|hotfix|patch(?:es)?|regression|crash(?:es|ed)?|panic|broken|breaks?|hang|deadlock|null\s*pointer|npe|leak|race(?:\s*condition)?|segfault|oops|undefined\s+behavior)\b/i;
const REVERT_RE = /\brevert\b/i;

const COMMITS_LIMIT = 200;
const SUSPECT_LIMIT = 10;
const COCHANGE_LIMIT = 10;
const SUSPECT_LOOKBACK = 6;
const COCHANGE_FIX_PROBE_LIMIT = 15;
const COCHANGE_SUSPECT_PROBE_LIMIT = 5;
const COCHANGE_DIFF_CONCURRENCY = 4;
const DIFF_CACHE_TTL_MS = 60_000;
const diffCache = new Map<string, { files: string[]; expiresAt: number }>();

export async function getFileBreakageAnalysis(
  gitService: GitService,
  file: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<BreakageAnalysis> {
  if (!file || file.includes('\0')) throw new Error('Invalid path');
  const limit = clamp(options.limit ?? COMMITS_LIMIT, 10, 1000);
  const { signal } = options;
  const checkAborted = () => {
    if (signal?.aborted) throw new Error('breakage analysis aborted');
  };
  checkAborted();

  const page = await gitService.getCommits({ file, page: 1, pageSize: limit }).catch(() => null);
  checkAborted();

  if (!page || page.commits.length === 0) {
    return emptyResult(file);
  }

  // Per-commit numstat for the same window, scoped to this file via the
  // pathspec git log accepts. Any commit not in the map gets 0 churn.
  const numstat = await gitService
    .getNumstat({ file }, limit, { signal })
    .catch(() => new Map<string, Array<{ file: string; additions: number; deletions: number }>>());
  checkAborted();

  const commits: BreakageCommit[] = page.commits.map((c) => {
    const stats = (numstat.get(c.hash) ?? []).reduce(
      (acc, n) => ({
        additions: acc.additions + n.additions,
        deletions: acc.deletions + n.deletions
      }),
      { additions: 0, deletions: 0 }
    );
    const isRevert = REVERT_RE.test(c.subject);
    const isFix = !isRevert && (FIX_RE.test(c.subject) || FIX_RE.test(c.body));
    return {
      hash: c.hash,
      shortHash: c.shortHash,
      author: c.author,
      date: c.date,
      subject: c.subject,
      isFix,
      isRevert,
      additions: stats.additions,
      deletions: stats.deletions,
      churn: stats.additions + stats.deletions
    };
  });

  // Defensive: ensure newest-first ordering for the suspect walk below.
  commits.sort((a, b) => b.date.localeCompare(a.date));
  const indexByHash = new Map<string, number>();
  commits.forEach((c, i) => indexByHash.set(c.hash, i));

  const fixCommits = commits.filter((c) => c.isFix || c.isRevert);

  // Suspect scoring: for each fix commit, walk a small window of older
  // commits (newer index in our newest-first array) and score them.
  type SuspectEntry = {
    info: BreakageCommit;
    score: number;
    reasons: Set<string>;
    fixes: Map<string, BreakageFixRef>;
  };
  const suspectsMap = new Map<string, SuspectEntry>();
  const ensure = (info: BreakageCommit): SuspectEntry => {
    let entry = suspectsMap.get(info.hash);
    if (!entry) {
      entry = { info, score: 0, reasons: new Set(), fixes: new Map() };
      suspectsMap.set(info.hash, entry);
    }
    return entry;
  };

  for (const fix of fixCommits) {
    const fixIdx = indexByHash.get(fix.hash);
    if (fixIdx === undefined) continue;
    const fixRef: BreakageFixRef = {
      hash: fix.hash,
      shortHash: fix.shortHash,
      subject: fix.subject,
      date: fix.date
    };
    let assignedDirect = false;
    for (let i = fixIdx + 1; i < commits.length && i - fixIdx <= SUSPECT_LOOKBACK; i++) {
      const candidate = commits[i];
      if (candidate.isFix || candidate.isRevert) continue;
      const entry = ensure(candidate);
      if (entry.fixes.has(fix.hash)) continue;
      entry.fixes.set(fix.hash, fixRef);
      if (!assignedDirect) {
        entry.score += 5;
        entry.reasons.add('immediately preceded a fix');
        assignedDirect = true;
      } else {
        entry.score += 2;
        entry.reasons.add('changed shortly before a fix');
      }
      if (candidate.churn >= 100) {
        entry.score += 2;
        entry.reasons.add('large change (>=100 lines)');
      } else if (candidate.churn >= 30) {
        entry.score += 1;
        entry.reasons.add('moderate change (>=30 lines)');
      }
      const days = daysBetween(candidate.date, fix.date);
      if (days >= 0 && days <= 7) {
        entry.score += 2;
        entry.reasons.add('fix landed within a week');
      }
    }
  }

  const suspects: BreakageSuspect[] = Array.from(suspectsMap.values())
    .sort((a, b) => b.score - a.score || b.info.date.localeCompare(a.info.date))
    .slice(0, SUSPECT_LIMIT)
    .map((s) => ({
      hash: s.info.hash,
      shortHash: s.info.shortHash,
      subject: s.info.subject,
      author: s.info.author,
      date: s.info.date,
      churn: s.info.churn,
      score: s.score,
      reasons: Array.from(s.reasons),
      linkedFixes: Array.from(s.fixes.values()).sort((a, b) => b.date.localeCompare(a.date))
    }));

  // Co-changed files: enumerate all files in the diffs of recent fix
  // commits + top suspects. Bounded so we stay responsive on huge repos.
  const cofreq = new Map<string, number>();
  const probeHashes = new Set<string>();
  for (const f of fixCommits.slice(0, COCHANGE_FIX_PROBE_LIMIT)) probeHashes.add(f.hash);
  for (const s of suspects.slice(0, COCHANGE_SUSPECT_PROBE_LIMIT)) probeHashes.add(s.hash);

  const cochangeDiffs = await runLimited(
    Array.from(probeHashes),
    COCHANGE_DIFF_CONCURRENCY,
    async (hash) => ({
      hash,
      files: await cachedDiffFiles(gitService, hash, options)
    })
  );
  for (const { files } of cochangeDiffs) {
    const seen = new Set<string>();
    for (const other of files) {
      if (!other || other === file || seen.has(other)) continue;
      seen.add(other);
      cofreq.set(other, (cofreq.get(other) ?? 0) + 1);
    }
  }
  const coChangedFiles: CoChangedFile[] = Array.from(cofreq.entries())
    .map(([f, count]) => ({ file: f, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, COCHANGE_LIMIT);

  const fixRatio = commits.length > 0 ? fixCommits.length / commits.length : 0;
  const riskScore = Math.min(
    100,
    Math.round(fixRatio * 60 + Math.min(commits.length, 50) * 0.4 + suspects.length * 1.5)
  );

  return {
    file,
    totalCommits: page.total ?? commits.length,
    fixCount: fixCommits.length,
    riskScore,
    summary: buildSummary(commits, fixCommits, suspects, riskScore),
    commits,
    fixCommits,
    suspects,
    coChangedFiles
  };
}

async function cachedDiffFiles(
  gitService: GitService,
  hash: string,
  options: { signal?: AbortSignal } = {}
): Promise<string[]> {
  const cached = diffCache.get(hash);
  if (cached && cached.expiresAt > Date.now()) return cached.files;
  if (options.signal?.aborted) throw new Error('breakage aborted');
  const files = await gitService
    .getDiff(hash, { signal: options.signal })
    .then((diff) => diff.map((d) => d.file))
    .catch(() => []);
  diffCache.set(hash, { files, expiresAt: Date.now() + DIFF_CACHE_TTL_MS });
  if (diffCache.size > 200) {
    const first = diffCache.keys().next().value;
    if (first) diffCache.delete(first);
  }
  return files;
}

async function runLimited<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function emptyResult(file: string): BreakageAnalysis {
  return {
    file,
    totalCommits: 0,
    fixCount: 0,
    riskScore: 0,
    summary: 'No commit history found for this file.',
    commits: [],
    fixCommits: [],
    suspects: [],
    coChangedFiles: []
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return -1;
  return Math.abs(tb - ta) / (1000 * 60 * 60 * 24);
}

function buildSummary(
  commits: BreakageCommit[],
  fixCommits: BreakageCommit[],
  suspects: BreakageSuspect[],
  riskScore: number
): string {
  if (commits.length === 0) return 'No commit history found.';
  const parts: string[] = [];
  parts.push(
    `${commits.length} recent commit${commits.length === 1 ? '' : 's'}, ` +
      `${fixCommits.length} look${fixCommits.length === 1 ? 's' : ''} like fixes/reverts.`
  );
  if (suspects.length > 0) {
    const top = suspects[0];
    parts.push(`Most likely culprit: ${top.shortHash} "${top.subject}" by ${top.author}.`);
  }
  parts.push(
    riskScore >= 60
      ? 'High breakage risk — fixes frequently follow recent changes.'
      : riskScore >= 30
        ? 'Moderate breakage risk — some fix activity in this file.'
        : 'Low breakage risk based on recent history.'
  );
  return parts.join(' ');
}
