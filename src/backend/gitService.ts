import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  subject: string;
  body: string;
  parents: string[];
  branches: string[];
  tags: string[];
  isMerge: boolean;
}

export interface DiffFile {
  file: string;
  oldFile?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'binary';
  additions: number;
  deletions: number;
  changes: string;
}

export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  date: string;
  content: string;
}

export interface GitOptions {
  file?: string;
  since?: string;
  until?: string;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCommits {
  commits: Commit[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface RefIndex {
  branchesByCommit: Map<string, string[]>;
  tagsByCommit: Map<string, string[]>;
  builtAt: number;
}

interface CountCacheEntry {
  total: number;
  expiresAt: number;
}

const FIELD_SEP = "\x1f"; // Unit Separator (NUL is rejected by Node argv)
const RECORD_SEP = '\x1e';
const LOG_FORMAT = ['%H', '%h', '%an', '%ae', '%aI', '%P', '%s', '%b'].join(FIELD_SEP);

const REF_INDEX_TTL_MS = 5_000;
const COUNT_CACHE_TTL_MS = 10_000;

export class NotARepositoryError extends Error {
  constructor() {
    super('Not a git repository');
    this.name = 'NotARepositoryError';
  }
}

export class GitService {
  private repoPath: string;
  private refIndexCache: RefIndex | null = null;
  private countCache = new Map<string, CountCacheEntry>();
  private repoCheckResult: boolean | null = null;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  async verifyRepository(): Promise<boolean> {
    if (this.repoCheckResult !== null) return this.repoCheckResult;
    try {
      await this.git(['rev-parse', '--is-inside-work-tree']);
      this.repoCheckResult = true;
    } catch {
      this.repoCheckResult = false;
    }
    return this.repoCheckResult;
  }

  private async getRefIndex(): Promise<RefIndex> {
    const now = Date.now();
    if (this.refIndexCache && now - this.refIndexCache.builtAt < REF_INDEX_TTL_MS) {
      return this.refIndexCache;
    }

    const branchesByCommit = new Map<string, string[]>();
    const tagsByCommit = new Map<string, string[]>();

    const out = await this.git([
      'for-each-ref',
      '--format=%(objectname)\t%(refname:short)\t%(refname)',
      'refs/heads',
      'refs/tags',
      'refs/remotes'
    ]);

    for (const line of out.split('\n')) {
      if (!line) continue;
      const [hash, short, full] = line.split('\t');
      if (!hash || !short) continue;
      if (full && full.startsWith('refs/tags/')) {
        push(tagsByCommit, hash, short);
      } else {
        push(branchesByCommit, hash, short);
      }
    }

    this.refIndexCache = { branchesByCommit, tagsByCommit, builtAt: now };
    return this.refIndexCache;

    function push(map: Map<string, string[]>, key: string, value: string) {
      const list = map.get(key);
      if (list) list.push(value);
      else map.set(key, [value]);
    }
  }

  async getCommits(options: GitOptions = {}): Promise<PaginatedCommits> {
    if (!(await this.verifyRepository())) {
      throw new NotARepositoryError();
    }

    const page = Math.max(1, options.page || 1);
    const pageSize = clamp(options.pageSize || 25, 1, 500);
    const skip = (page - 1) * pageSize;

    const filterArgs = this.buildFilterArgs(options);
    const cacheKey = filterArgs.join(' ');

    const total = await this.getTotalCount(cacheKey, filterArgs);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const args = [
      'log',
      `--max-count=${pageSize}`,
      `--skip=${skip}`,
      `--pretty=format:${LOG_FORMAT}${RECORD_SEP}`,
      ...filterArgs
    ];

    const out = await this.git(args, { maxBuffer: 64 * 1024 * 1024 });
    const refs = await this.getRefIndex();
    const commits = this.parseLog(out, refs);

    return {
      commits,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    };
  }

  private async getTotalCount(cacheKey: string, filterArgs: string[]): Promise<number> {
    const now = Date.now();
    const cached = this.countCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.total;

    // Insert HEAD before the pathspec separator so that --author/--since/--grep
    // apply to the count. Otherwise rev-list would only honour pathspec filters.
    const sepIdx = filterArgs.indexOf('--');
    const revArgs =
      sepIdx >= 0
        ? [...filterArgs.slice(0, sepIdx), 'HEAD', ...filterArgs.slice(sepIdx)]
        : [...filterArgs, 'HEAD'];

    let total = 0;
    try {
      const out = await this.git(['rev-list', '--count', ...revArgs]);
      total = parseInt(out.trim(), 10) || 0;
    } catch {
      const fallback = await this.git(['log', '--oneline', ...filterArgs]).catch(() => '');
      total = fallback ? fallback.split('\n').filter(Boolean).length : 0;
    }

    this.countCache.set(cacheKey, { total, expiresAt: now + COUNT_CACHE_TTL_MS });
    return total;
  }

  private buildFilterArgs(options: GitOptions): string[] {
    const args: string[] = [];
    if (options.author) args.push(`--author=${options.author}`);
    if (options.since) args.push(`--since=${options.since}`);
    if (options.until) args.push(`--until=${options.until}`);
    if (options.search) args.push(`--grep=${options.search}`, '--regexp-ignore-case');
    if (options.file) args.push('--', options.file);
    return args;
  }

  private parseLog(raw: string, refs: RefIndex): Commit[] {
    if (!raw) return [];
    const commits: Commit[] = [];

    for (const record of raw.split(RECORD_SEP)) {
      const trimmed = record.trim();
      if (!trimmed) continue;
      const fields = trimmed.split(FIELD_SEP);
      if (fields.length < 8) continue;

      const [hash, shortHash, author, authorEmail, date, parentsStr, subject, ...rest] = fields;
      const body = rest.join(FIELD_SEP);
      const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];
      const branches = refs.branchesByCommit.get(hash) ?? [];
      const tags = refs.tagsByCommit.get(hash) ?? [];

      commits.push({
        hash,
        shortHash,
        author,
        authorEmail,
        date,
        subject,
        body,
        message: body ? `${subject}\n\n${body}` : subject,
        parents,
        branches,
        tags,
        isMerge: parents.length > 1
      });
    }

    return commits;
  }

  async getCommit(hash: string): Promise<Commit> {
    if (!isPlausibleHash(hash)) throw new Error('Invalid commit hash');

    const out = await this.git([
      'log',
      '--max-count=1',
      `--pretty=format:${LOG_FORMAT}${RECORD_SEP}`,
      hash
    ]);

    const refs = await this.getRefIndex();
    const commits = this.parseLog(out, refs);
    if (commits.length === 0) throw new Error('Commit not found');
    return commits[0];
  }

  async getAuthors(): Promise<string[]> {
    const out = await this.git(['log', '--all', '--pretty=format:%an']);
    const seen = new Set<string>();
    for (const line of out.split('\n')) {
      const v = line.trim();
      if (v) seen.add(v);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }

  async getDiff(hash: string): Promise<DiffFile[]> {
    if (!isPlausibleHash(hash)) throw new Error('Invalid commit hash');

    const parentsOut = await this.git(['log', '-1', '--pretty=format:%P', hash]);
    const parents = parentsOut.trim().split(/\s+/).filter(Boolean);

    let raw: string;
    if (parents.length === 0) {
      raw = await this.git(['diff-tree', '--root', '-p', '-M', '--no-color', hash]);
    } else {
      raw = await this.git(['diff', '-M', '--no-color', `${hash}^1`, hash]);
    }

    return parseUnifiedDiff(raw);
  }

  async getRangeDiff(from: string, to: string): Promise<DiffFile[]> {
    if (!isPlausibleHash(from) || !isPlausibleHash(to)) {
      throw new Error('Invalid commit hash');
    }
    const raw = await this.git(['diff', '-M', '--no-color', from, to], {
      maxBuffer: 64 * 1024 * 1024
    });
    return parseUnifiedDiff(raw);
  }

  /** Resolve any ref (branch/tag/HEAD) to its commit at or before `atIso`. */
  async revAt(ref: string, atIso: string): Promise<string | null> {
    if (!isSafeRef(ref)) throw new Error('Invalid ref');
    if (!isIsoLikeDate(atIso)) throw new Error('Invalid date');
    try {
      const out = await this.git([
        'rev-list',
        '-1',
        `--before=${atIso}`,
        ref
      ]);
      const hash = out.trim();
      return hash || null;
    } catch {
      return null;
    }
  }

  /** Origin URL of the first remote (typically `origin`). */
  async getRemoteUrl(name: string = 'origin'): Promise<string> {
    const out = await this.git(['remote', 'get-url', name]);
    return out.trim();
  }

  async getFileStats(filePath: string): Promise<{
    file: string;
    firstSeen: string;
    lastTouched: string;
    totalCommits: number;
    contributors: string[];
  }> {
    if (filePath.includes('\0')) throw new Error('Invalid path');
    const out = await this.git([
      'log',
      '--follow',
      '--pretty=format:%aI%x1f%an',
      '--',
      filePath
    ]);
    const dates: string[] = [];
    const authors = new Set<string>();
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [date, author] = trimmed.split('\x1f');
      if (date) dates.push(date);
      if (author) authors.add(author);
    }
    dates.sort();
    return {
      file: filePath,
      firstSeen: dates[0] ?? '',
      lastTouched: dates[dates.length - 1] ?? '',
      totalCommits: dates.length,
      contributors: Array.from(authors).sort((a, b) => a.localeCompare(b))
    };
  }

  /** Read the contents of a file at a specific commit. */
  async getFileAtCommit(hash: string, filePath: string): Promise<string> {
    if (!isPlausibleHash(hash)) throw new Error('Invalid commit hash');
    if (filePath.includes('\0')) throw new Error('Invalid path');
    return this.git(['show', `${hash}:${filePath}`], { maxBuffer: 16 * 1024 * 1024 });
  }

  /** Pass-through git runner for trusted callers (e.g., SqliteIndex builder). */
  async runRaw(args: string[], opts: { maxBuffer?: number } = {}): Promise<string> {
    return this.git(args, opts);
  }

  /**
   * Stream commits one at a time via async iteration. Used by the SSE
   * endpoint to feed huge repos to the UI progressively without buffering
   * the entire `git log` output in memory.
   */
  async *streamCommits(
    options: GitOptions = {},
    batchSize = 200
  ): AsyncGenerator<Commit, void, void> {
    if (!(await this.verifyRepository())) {
      throw new NotARepositoryError();
    }
    const refs = await this.getRefIndex();
    const filterArgs = this.buildFilterArgs(options);
    let skip = 0;
    while (true) {
      const args = [
        'log',
        `--max-count=${batchSize}`,
        `--skip=${skip}`,
        `--pretty=format:${LOG_FORMAT}${RECORD_SEP}`,
        ...filterArgs
      ];
      const out = await this.git(args, { maxBuffer: 64 * 1024 * 1024 });
      const commits = this.parseLog(out, refs);
      if (commits.length === 0) return;
      for (const c of commits) yield c;
      if (commits.length < batchSize) return;
      skip += commits.length;
    }
  }

  async getBlame(filePath: string): Promise<BlameLine[]> {
    if (filePath.includes('\0')) throw new Error('Invalid path');
    const raw = await this.git(['blame', '--porcelain', '--', filePath]);
    return parsePorcelainBlame(raw);
  }

  async getTags(): Promise<string[]> {
    const out = await this.git(['tag', '--list']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  async getBranches(): Promise<string[]> {
    const out = await this.git([
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads',
      'refs/remotes'
    ]);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  private async git(args: string[], opts: { maxBuffer?: number } = {}): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.repoPath,
        maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_PAGER: 'cat',
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C'
        },
        encoding: 'utf8'
      });
      return stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      const msg = e.stderr?.toString().trim() || e.message;
      throw new Error(`git ${args[0]} failed: ${msg}`);
    }
  }
}

function isPlausibleHash(hash: string): boolean {
  return typeof hash === 'string' && /^[0-9a-fA-F]{4,40}$/.test(hash);
}

function isSafeRef(ref: string): boolean {
  // Allow alphanumerics, slash, dot, dash, underscore, plus HEAD shorthand chars.
  return typeof ref === 'string' && /^[A-Za-z0-9_./@^~+-]{1,200}$/.test(ref);
}

function isIsoLikeDate(s: string): boolean {
  // Accept YYYY-MM-DD or full ISO-8601, plus a small set of git-friendly relative tokens.
  return typeof s === 'string' && /^[0-9T:Z+\-.\s]{4,40}$/.test(s);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  if (!raw) return files;

  let current: DiffFile | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.changes = currentLines.join('\n');
    files.push(current);
    current = null;
    currentLines = [];
  };

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      const a = match?.[1];
      const b = match?.[2];
      current = {
        file: b ?? a ?? '',
        oldFile: a !== b ? a : undefined,
        status: 'modified',
        additions: 0,
        deletions: 0,
        changes: ''
      };
      currentLines = [line];
    } else if (!current) {
      continue;
    } else if (line.startsWith('new file mode')) {
      current.status = 'added';
      currentLines.push(line);
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
      currentLines.push(line);
    } else if (line.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldFile = line.substring('rename from '.length);
      currentLines.push(line);
    } else if (line.startsWith('rename to ')) {
      current.file = line.substring('rename to '.length);
      currentLines.push(line);
    } else if (line.startsWith('copy from ')) {
      current.status = 'copied';
      current.oldFile = line.substring('copy from '.length);
      currentLines.push(line);
    } else if (line.startsWith('Binary files')) {
      current.status = 'binary';
      currentLines.push(line);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      currentLines.push(line);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return files;
}

function parsePorcelainBlame(raw: string): BlameLine[] {
  if (!raw) return [];
  const lines = raw.split('\n');
  const out: BlameLine[] = [];
  const meta = new Map<string, { author: string; epoch: number }>();

  let i = 0;
  let lineNumber = 0;
  while (i < lines.length) {
    const header = lines[i];
    if (!header) {
      i++;
      continue;
    }
    const m = header.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
    if (!m) {
      i++;
      continue;
    }

    const hash = m[1];
    lineNumber = parseInt(m[2], 10);
    i++;

    let author = meta.get(hash)?.author ?? '';
    let epoch = meta.get(hash)?.epoch ?? 0;

    while (i < lines.length && !lines[i].startsWith('\t')) {
      const h = lines[i];
      if (h.startsWith('author ')) author = h.substring(7);
      else if (h.startsWith('author-time ')) epoch = parseInt(h.substring(12), 10);
      i++;
    }
    meta.set(hash, { author, epoch });

    const content = i < lines.length && lines[i].startsWith('\t') ? lines[i].substring(1) : '';
    out.push({
      line: lineNumber,
      hash,
      author,
      date: epoch ? new Date(epoch * 1000).toISOString() : '',
      content
    });
    i++;
  }

  return out;
}
