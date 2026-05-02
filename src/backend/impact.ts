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
  hash: string
): Promise<CommitImpact> {
  const diff = await gitService.getDiff(hash);
  const files = diff.map((d) => d.file);
  const modules = Array.from(new Set(files.map(detectModule))).sort();

  // Cheap dependency ripple: parse `import`/`require` from the post-state of changed files.
  const dependencyRipple: CommitImpact['dependencyRipple'] = [];
  const sampled = files.filter((f) => SUPPORTED_EXTS.has(path.extname(f))).slice(0, RIPPLE_FILE_LIMIT);
  for (const file of sampled) {
    const content = await gitService.getFileAtCommit(hash, file).catch(() => '');
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
  for (const file of files.slice(0, 5)) {
    const page = await gitService
      .getCommits({ file, page: 1, pageSize: 8 })
      .catch(() => null);
    if (!page) continue;
    for (const c of page.commits) {
      if (c.hash === hash) continue;
      if (!relatedHashes.has(c.hash)) {
        relatedHashes.set(c.hash, { subject: c.subject, date: c.date });
      }
    }
  }
  const relatedCommits = Array.from(relatedHashes.entries())
    .map(([h, info]) => ({ hash: h, ...info }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RELATED_LIMIT);

  return { hash, files, modules, dependencyRipple, relatedCommits };
}

function detectModule(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  // src/backend/foo.ts -> "src/backend"; frontend/src/app/components/x/y.ts -> "frontend/src/app/components/x"
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}
