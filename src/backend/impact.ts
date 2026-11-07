import path from 'path';
import type { GitService } from './gitService';

export interface CommitImpact {
  hash: string;
  files: string[];
  modules: string[];
  /** What the changed files import (`from` imports `to`). */
  dependencyRipple: Array<{ from: string; to: string }>;
  /** What imports the changed files: unchanged files that could break (`from` imports `to`). */
  dependents: Array<{ from: string; to: string }>;
  relatedCommits: Array<{ hash: string; subject: string; date: string }>;
}

const IMPORT_RE =
  /(?:(?:import|export)\s.*?from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"\n]+)['"]/g;
const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const RELATED_LIMIT = 10;
const RIPPLE_FILE_LIMIT = 10;
const DEPENDENT_FILE_LIMIT = 100;
const DEPENDENT_LIMIT = 50;

export async function getCommitImpact(
  gitService: GitService,
  hash: string,
  opts: { signal?: AbortSignal } = {}
): Promise<CommitImpact> {
  const { files: diff } = await gitService.getDiffMeta(hash, opts);
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

  const dependents = await findDependents(gitService, hash, files, opts);

  // Related commits: commits that have touched any of the files modified here.
  const relatedHashes = new Map<string, { subject: string; date: string }>();
  const related = await gitService.getCommitsForFiles(files.slice(0, 5), 30, opts).catch(() => []);
  for (const c of related) {
    if (c.hash === hash) continue;
    if (!relatedHashes.has(c.hash)) {
      relatedHashes.set(c.hash, { subject: c.subject, date: c.date });
    }
  }
  const relatedCommits = Array.from(relatedHashes.entries())
    .map(([h, info]) => ({ hash: h, ...info }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, RELATED_LIMIT);

  return { hash, files, modules, dependencyRipple, dependents, relatedCommits };
}

/** Module identity for import matching: no extension, and `dir/index.ts` is just `dir`. */
function moduleKey(file: string): string {
  const ext = path.posix.extname(file);
  const bare = SUPPORTED_EXTS.has(ext) ? file.slice(0, -ext.length) : file;
  return path.posix.basename(bare) === 'index' ? path.posix.dirname(bare) : bare;
}

/**
 * Files at `hash` that import a changed file. One `git grep` narrows candidates to relative
 * imports naming a changed module; each candidate's imports are then resolved exactly.
 * ponytail: relative imports only (no tsconfig paths / package self-imports), first
 * RIPPLE_FILE_LIMIT changed files, first DEPENDENT_FILE_LIMIT candidates.
 */
async function findDependents(
  gitService: GitService,
  hash: string,
  files: string[],
  opts: { signal?: AbortSignal }
): Promise<CommitImpact['dependents']> {
  const changed = new Map<string, string>();
  const names = new Set<string>();
  for (const file of files
    .filter((f) => SUPPORTED_EXTS.has(path.extname(f)))
    .slice(0, RIPPLE_FILE_LIMIT)) {
    const key = moduleKey(file);
    changed.set(key, file);
    const name = path.posix.basename(key);
    names.add(name);
    if (key !== file.slice(0, -path.posix.extname(file).length)) names.add(`${name}/index`);
  }
  if (changed.size === 0) return [];

  const escaped = [...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = `['"]\\.[^'"]*/(${escaped.join('|')})(\\.[a-z]+)?['"]`;
  let listed: string;
  try {
    listed = await gitService.runRaw(
      [
        'grep',
        '-l',
        '-z',
        '-I',
        '-E',
        '-e',
        pattern,
        hash,
        '--',
        ...[...SUPPORTED_EXTS].map((e) => `*${e}`)
      ],
      { ...opts, maxBuffer: 8 * 1024 * 1024 }
    );
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
  const candidates = listed
    .split('\0')
    .map((l) => l.slice(hash.length + 1)) // output is "<hash>:<path>"
    .filter((f) => f && !files.includes(f))
    .slice(0, DEPENDENT_FILE_LIMIT);

  const dependents: CommitImpact['dependents'] = [];
  const seen = new Set<string>();
  for (const from of candidates) {
    const content = await gitService.getFileAtCommit(hash, from, opts).catch(() => '');
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(content)) !== null) {
      if (!m[1].startsWith('.')) continue;
      const to = changed.get(
        moduleKey(path.posix.normalize(path.posix.join(path.posix.dirname(from), m[1])))
      );
      if (!to || seen.has(`${from}\0${to}`)) continue;
      seen.add(`${from}\0${to}`);
      dependents.push({ from, to });
      if (dependents.length >= DEPENDENT_LIMIT) return dependents;
    }
  }
  return dependents;
}

function detectModule(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  // src/backend/foo.ts -> "src/backend"; frontend/src/app/components/x/y.ts -> "frontend/src/app/components/x"
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}
