import path from 'path';
import type { GitService } from './gitService';

export interface CommitImpact {
  hash: string;
  files: string[];
  modules: string[];
  dependencyRipple: Array<{ from: string; to: string }>;
  relatedCommits: Array<{ hash: string; subject: string; date: string }>;
}

const IMPORT_RE = /(?:import\s.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"\n]+)['"]/g;
const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const RELATED_LIMIT = 10;
const RIPPLE_FILE_LIMIT = 10;

export async function getCommitImpact(
  gitService: GitService,
  hash: string,
  opts: { signal?: AbortSignal } = {}
): Promise<CommitImpact> {
  const diff = await gitService.getDiff(hash, opts);
  const files = diff.map((d) => d.file);
  const modules = Array.from(new Set(files.map(detectModule))).sort();

  // Cheap dependency ripple: parse `import`/`require` from the post-state of changed files.
  const dependencyRipple: CommitImpact['dependencyRipple'] = [];
  const sampled = files
    .filter((f) => SUPPORTED_EXTS.has(path.extname(f)))
    .slice(0, RIPPLE_FILE_LIMIT);
  const contents = await Promise.all(
    sampled.map((file) =>
      gitService
        .getFileAtCommit(hash, file, opts)
        .then((content) => ({ file, content }))
        .catch(() => ({ file, content: '' }))
    )
  );
  for (const { file, content } of contents) {
    if (!content) continue;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(content)) !== null) {
      const target = m[1];
      if (!target.startsWith('.')) continue; // ignore externals
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      dependencyRipple.push({ from: file, to: resolved });
    }
  }

  // Related commits: commits that have touched any of the files modified here.
  const relatedHashes = new Map<string, { subject: string; date: string }>();
  const related =
    typeof gitService.getCommitsForFiles === 'function'
      ? await gitService.getCommitsForFiles(files.slice(0, 5), 30, opts).catch(() => [])
      : await getRelatedViaLegacyCommits(gitService, files, opts);
  for (const c of related) {
    if (c.hash === hash) continue;
    if (!relatedHashes.has(c.hash)) {
      relatedHashes.set(c.hash, { subject: c.subject, date: c.date });
    }
  }
  const relatedCommits = Array.from(relatedHashes.entries())
    .map(([h, info]) => ({ hash: h, ...info }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RELATED_LIMIT);

  return { hash, files, modules, dependencyRipple, relatedCommits };
}

async function getRelatedViaLegacyCommits(
  gitService: GitService,
  files: string[],
  opts: { signal?: AbortSignal } = {}
): Promise<Awaited<ReturnType<GitService['getCommitsForFiles']>>> {
  const related: Awaited<ReturnType<GitService['getCommitsForFiles']>> = [];
  for (const file of files.slice(0, 5)) {
    if (opts.signal?.aborted) throw new Error('impact aborted');
    const page = await gitService
      .getCommits({ file, page: 1, pageSize: 8 }, opts)
      .catch(() => null);
    if (page) related.push(...page.commits);
  }
  return related;
}

function detectModule(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  // src/backend/foo.ts -> "src/backend"; frontend/src/app/components/x/y.ts -> "frontend/src/app/components/x"
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}
