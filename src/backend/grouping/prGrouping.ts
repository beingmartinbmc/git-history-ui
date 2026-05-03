import type { Commit, GitService } from '../gitService';

export interface CommitGroup {
  id: string;
  title: string;
  prNumber?: number;
  source: 'merge' | 'squash' | 'conventional' | 'standalone';
  scope?: string;
  type?: string;
  commits: string[];
  filesTouched: number;
  additions: number;
  deletions: number;
  firstDate: string;
  lastDate: string;
  authors: string[];
  pr?: PrInfo;
}

export interface PrInfo {
  number: number;
  title: string;
  author: string;
  url: string;
  labels: string[];
  state: 'open' | 'closed' | 'merged';
}

export interface GroupingOptions {
  since?: string;
  until?: string;
  author?: string;
  branch?: string;
  /** When set + remote is GitHub, fetch PR metadata. */
  githubToken?: string;
  /** Cap to keep result responsive on huge repos. */
  maxCommits?: number;
}

const MERGE_PR_RE = /^Merge pull request #(\d+) from (\S+)/;
const SQUASH_PR_RE = /\(#(\d+)\)\s*$/;
const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?(!?):\s*(.+)$/;
const PR_CACHE_TTL_MS = 10 * 60_000;
const PR_CONCURRENCY = 4;

interface PrCacheEntry {
  pr: PrInfo | null;
  etag?: string;
  expiresAt: number;
}

const prCache = new Map<string, PrCacheEntry>();

/**
 * Group commits by PR or feature using pure heuristics. Optionally enrich
 * with PR metadata if a GitHub token is provided and the remote is on GitHub.
 */
export async function buildCommitGroups(
  gitService: GitService,
  opts: GroupingOptions = {}
): Promise<CommitGroup[]> {
  const maxCommits = opts.maxCommits ?? 1000;
  const page = await gitService.getCommits({
    since: opts.since,
    until: opts.until,
    author: opts.author,
    branch: opts.branch,
    page: 1,
    pageSize: maxCommits
  });

  const commits = page.commits;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const groupedHashes = new Set<string>();
  const groups: CommitGroup[] = [];

  // Pass 1: GitHub-style merge commits.
  for (const c of commits) {
    if (!c.isMerge) continue;
    const m = c.subject.match(MERGE_PR_RE);
    if (!m) continue;
    const prNumber = parseInt(m[1], 10);
    // Walk the second-parent chain until we hit a commit already on the trunk.
    const chain = walkSecondParent(c, byHash);
    const memberHashes = [c.hash, ...chain.map((x) => x.hash)];
    for (const h of memberHashes) groupedHashes.add(h);
    const title = stripMerge(c.body) || stripMerge(c.subject) || `PR #${prNumber}`;
    groups.push(
      buildGroup(memberHashes, byHash, {
        id: `pr-${prNumber}`,
        title,
        prNumber,
        source: 'merge'
      })
    );
  }

  // Pass 2: squash-merge commits with trailing (#N).
  for (const c of commits) {
    if (groupedHashes.has(c.hash)) continue;
    const m = c.subject.match(SQUASH_PR_RE);
    if (!m) continue;
    const prNumber = parseInt(m[1], 10);
    groupedHashes.add(c.hash);
    groups.push(
      buildGroup([c.hash], byHash, {
        id: `pr-${prNumber}`,
        title: c.subject.replace(SQUASH_PR_RE, '').trim(),
        prNumber,
        source: 'squash'
      })
    );
  }

  // Pass 3: conventional commits — group by type+scope.
  const conventionalBuckets = new Map<string, string[]>();
  const conventionalMeta = new Map<string, { type: string; scope?: string; title: string }>();
  for (const c of commits) {
    if (groupedHashes.has(c.hash)) continue;
    const m = c.subject.match(CONVENTIONAL_RE);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const scope = m[2];
    const title = m[4];
    const key = `${type}:${scope ?? '_'}`;
    if (!conventionalBuckets.has(key)) {
      conventionalBuckets.set(key, []);
      conventionalMeta.set(key, { type, scope, title });
    }
    conventionalBuckets.get(key)!.push(c.hash);
    groupedHashes.add(c.hash);
  }
  for (const [key, hashes] of conventionalBuckets) {
    if (hashes.length < 2) {
      // Single-commit "groups" stay as standalones for clarity.
      groupedHashes.delete(hashes[0]);
      continue;
    }
    const meta = conventionalMeta.get(key)!;
    groups.push(
      buildGroup(hashes, byHash, {
        id: `conv-${key}`,
        title: `${meta.type}${meta.scope ? `(${meta.scope})` : ''}: ${hashes.length} commits`,
        source: 'conventional',
        type: meta.type,
        scope: meta.scope
      })
    );
  }

  // Pass 4: any remaining commits become standalone "groups" of one.
  for (const c of commits) {
    if (groupedHashes.has(c.hash)) continue;
    groups.push(
      buildGroup([c.hash], byHash, {
        id: `c-${c.shortHash}`,
        title: c.subject,
        source: 'standalone'
      })
    );
  }

  // Sort by lastDate desc.
  groups.sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  // Optional PR enrichment.
  if (opts.githubToken) {
    const remote = await gitService.getRemoteUrl().catch(() => null);
    const slug = remote ? parseGithubSlug(remote) : null;
    if (slug) {
      await enrichWithPrInfo(groups, slug, opts.githubToken);
    }
  }

  return groups;
}

function walkSecondParent(merge: Commit, byHash: Map<string, Commit>): Commit[] {
  // Heuristic: follow the second parent until we hit a commit reachable from the first parent.
  // Without a graph traversal we approximate: take up to 30 commits down second-parent, stopping
  // when a commit has fewer parents (root of feature branch) or we've seen a merge.
  const out: Commit[] = [];
  if (merge.parents.length < 2) return out;
  let cur = byHash.get(merge.parents[1]);
  let safety = 30;
  while (cur && safety-- > 0) {
    out.push(cur);
    if (cur.parents.length === 0 || cur.isMerge) break;
    cur = byHash.get(cur.parents[0]);
  }
  return out;
}

function stripMerge(text: string): string {
  return text
    .replace(/^Merge pull request #\d+ from \S+\s*/i, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function buildGroup(
  hashes: string[],
  byHash: Map<string, Commit>,
  meta: Pick<CommitGroup, 'id' | 'title' | 'source'> &
    Partial<Pick<CommitGroup, 'prNumber' | 'scope' | 'type'>>
): CommitGroup {
  const cs = hashes.map((h) => byHash.get(h)).filter((c): c is Commit => !!c);
  const dates = cs.map((c) => c.date).sort();
  const authors = Array.from(new Set(cs.map((c) => c.author)));
  // We don't have file/line counts at this layer (would need diff per commit).
  // Fill with zeros; the impact endpoint can fill these in client-side on demand.
  return {
    ...meta,
    commits: hashes,
    filesTouched: 0,
    additions: 0,
    deletions: 0,
    firstDate: dates[0] ?? '',
    lastDate: dates[dates.length - 1] ?? '',
    authors
  };
}

const GH_SLUG_RE = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/;
function parseGithubSlug(remote: string): { owner: string; repo: string } | null {
  const m = remote.match(GH_SLUG_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function enrichWithPrInfo(
  groups: CommitGroup[],
  slug: { owner: string; repo: string },
  token: string
): Promise<void> {
  const fetchOne = async (n: number): Promise<PrInfo | null> => {
    const key = `${slug.owner}/${slug.repo}#${n}`;
    const cached = prCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.pr;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'git-history-ui'
      };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      const resp = await fetch(
        `https://api.github.com/repos/${slug.owner}/${slug.repo}/pulls/${n}`,
        {
          headers
        }
      );
      if (resp.status === 304 && cached) {
        cached.expiresAt = Date.now() + PR_CACHE_TTL_MS;
        return cached.pr;
      }
      if (!resp.ok) {
        prCache.set(key, { pr: null, etag: cached?.etag, expiresAt: Date.now() + PR_CACHE_TTL_MS });
        return null;
      }
      const j = (await resp.json()) as any;
      const pr: PrInfo = {
        number: j.number,
        title: j.title,
        author: j.user?.login ?? 'unknown',
        url: j.html_url,
        labels: (j.labels ?? []).map((l: { name?: string }) => l.name ?? '').filter(Boolean),
        state: j.merged_at ? 'merged' : (j.state as PrInfo['state'])
      };
      prCache.set(key, {
        pr,
        etag: resp.headers?.get?.('etag') ?? cached?.etag ?? undefined,
        expiresAt: Date.now() + PR_CACHE_TTL_MS
      });
      return pr;
    } catch {
      prCache.set(key, {
        pr: cached?.pr ?? null,
        etag: cached?.etag,
        expiresAt: Date.now() + 60_000
      });
      return null;
    }
  };

  const queue = groups.filter((g) => typeof g.prNumber === 'number');
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(PR_CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const g = queue[cursor++];
        const info = await fetchOne(g.prNumber!);
        if (info) {
          g.pr = info;
          if (g.title === `PR #${g.prNumber}`) g.title = info.title;
        }
      }
    })
  );
}
