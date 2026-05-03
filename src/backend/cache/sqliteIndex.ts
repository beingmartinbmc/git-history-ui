import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { StringDecoder } from 'string_decoder';
import type { Commit } from '../gitService';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';
export const SQLITE_LOG_FORMAT = ['%H', '%h', '%an', '%ae', '%aI', '%P', '%s', '%b'].join(
  FIELD_SEP
);

const ROOT_DIR = path.join(os.homedir(), '.git-history-ui');

/**
 * Optional SQLite-backed commit index. Falls back gracefully if
 * `better-sqlite3` is not installed (declared as an optional dependency).
 *
 * Schema:
 *   commits(hash PK, short, author, email, date, parents, subject, body)
 *   commits_fts(subject, body) virtual using FTS5 (when available)
 *
 * Invalidated when the repo's HEAD ref or the refs/ directory mtime changes.
 *
 * Git invocation is delegated to a caller-provided runner so this module
 * doesn't need to import `child_process` directly. (The hot-loop driver
 * is inside `GitService`.)
 */
export interface IndexStats {
  available: boolean;
  total: number;
  builtAt: string | null;
  reason?: string;
}

interface SqliteDB {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}
interface SqliteStatement {
  run(...args: unknown[]): { changes: number; lastInsertRowid: number };
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}
type SqliteCtor = new (file: string) => SqliteDB;

let _Sqlite: SqliteCtor | null | undefined;
function loadSqlite(): SqliteCtor | null {
  if (_Sqlite !== undefined) return _Sqlite;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('better-sqlite3');
    _Sqlite = (mod?.default ?? mod) as SqliteCtor;
  } catch {
    _Sqlite = null;
  }
  return _Sqlite;
}

export type GitRunner = (args: string[]) => Promise<string>;
export type GitStreamRunner = (
  args: string[],
  onChunk: (chunk: Buffer) => void,
  opts?: { signal?: AbortSignal }
) => Promise<void>;

export class SqliteIndex {
  private dbFile: string;
  private repoCwd: string;
  private db: SqliteDB | null = null;
  private buildPromise: Promise<void> | null = null;
  private streamGit: GitStreamRunner | null;

  constructor(
    repoCwd: string,
    private runGit: GitRunner,
    streamGit?: GitStreamRunner
  ) {
    this.repoCwd = repoCwd;
    this.streamGit = streamGit ?? null;
    const id = crypto.createHash('sha256').update(path.resolve(repoCwd)).digest('hex').slice(0, 16);
    this.dbFile = path.join(ROOT_DIR, `${id}.db`);
  }

  static isAvailable(): boolean {
    return loadSqlite() !== null;
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  /** Open the DB if available, creating it if needed. Returns false on failure. */
  open(): boolean {
    if (this.db) return true;
    const Ctor = loadSqlite();
    if (!Ctor) return false;
    try {
      fs.mkdirSync(path.dirname(this.dbFile), { recursive: true });
      this.db = new Ctor(this.dbFile);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
        CREATE TABLE IF NOT EXISTS commits (
          hash TEXT PRIMARY KEY,
          short TEXT,
          author TEXT,
          email TEXT,
          date TEXT,
          parents TEXT,
          subject TEXT,
          body TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_commits_date ON commits(date DESC);
        CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author);
      `);
      try {
        this.db.exec(
          "CREATE VIRTUAL TABLE IF NOT EXISTS commits_fts USING fts5(subject, body, content='commits', content_rowid='rowid');"
        );
      } catch {
        /* FTS5 unavailable — searches fall back to LIKE. */
      }
      return true;
    } catch {
      this.db = null;
      return false;
    }
  }

  async stats(): Promise<IndexStats> {
    if (!this.open()) {
      return { available: false, total: 0, builtAt: null, reason: 'better-sqlite3 not installed' };
    }
    const total = (this.db!.prepare('SELECT COUNT(*) as n FROM commits').get() as { n: number }).n;
    const builtAt =
      (
        this.db!.prepare("SELECT v FROM meta WHERE k = 'builtAt'").get() as
          | { v: string }
          | undefined
      )?.v ?? null;
    return { available: true, total, builtAt };
  }

  /** Synchronously build the index from `git log --all`. Idempotent. */
  async build(opts: { signal?: AbortSignal } = {}): Promise<IndexStats> {
    if (!this.open()) return this.stats();
    if (this.buildPromise) {
      await this.buildPromise;
      return this.stats();
    }
    this.buildPromise = this.doBuild(opts);
    try {
      await this.buildPromise;
    } finally {
      this.buildPromise = null;
    }
    return this.stats();
  }

  private async doBuild(opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (!this.db) return;
    const sig = await this.refSignature();
    const stored = (
      this.db.prepare("SELECT v FROM meta WHERE k='refsSig'").get() as { v: string } | undefined
    )?.v;
    if (stored === sig) return;
    const head = await this.currentHead();
    const storedHead =
      (
        this.db.prepare("SELECT v FROM meta WHERE k='indexedHead'").get() as
          | { v: string }
          | undefined
      )?.v ?? '';
    const canIncrement = !!storedHead && !!head && (await this.isAncestor(storedHead, head));

    const args = [
      'log',
      '--all',
      ...(canIncrement ? ['--not', storedHead] : []),
      `--pretty=format:${SQLITE_LOG_FORMAT}${RECORD_SEP}`
    ];

    this.db.exec('BEGIN');
    try {
      if (!canIncrement) {
        this.db.exec('DELETE FROM commits');
        try {
          this.db.exec('DELETE FROM commits_fts');
        } catch {
          /* no fts */
        }
      }
      const ins = this.db.prepare(
        'INSERT OR REPLACE INTO commits(hash,short,author,email,date,parents,subject,body) VALUES (?,?,?,?,?,?,?,?)'
      );
      const insFts = (() => {
        try {
          return this.db!.prepare(
            'INSERT INTO commits_fts(rowid,subject,body) VALUES ((SELECT rowid FROM commits WHERE hash = ?), ?, ?)'
          );
        } catch {
          return null;
        }
      })();

      const ingest = (record: string) => {
        const trimmed = record.trim();
        if (!trimmed) return;
        const fields = trimmed.split(FIELD_SEP);
        if (fields.length < 8) return;
        const [hash, shortHash, author, email, date, parentsStr, subject, ...rest] = fields;
        const body = rest.join(FIELD_SEP);
        ins.run(hash, shortHash, author, email, date, parentsStr, subject, body);
        if (insFts) {
          try {
            insFts.run(hash, subject, body);
          } catch {
            /* ignore */
          }
        }
      };

      // Streaming path: incremental parse keeps memory bounded regardless
      // of repo size. Falls back to buffered runGit when no streamer was
      // injected (e.g. legacy callers, tests).
      if (this.streamGit) {
        let pending = '';
        const decoder = new StringDecoder('utf8');
        await this.streamGit(
          args,
          (chunk) => {
            pending += decoder.write(chunk);
            let idx: number;
            // Process every complete record as it arrives so we never hold
            // more than one record's worth of git output in memory.
            while ((idx = pending.indexOf(RECORD_SEP)) >= 0) {
              const record = pending.slice(0, idx);
              pending = pending.slice(idx + 1);
              ingest(record);
            }
          },
          { signal: opts.signal }
        );
        pending += decoder.end();
        if (pending.trim()) ingest(pending);
      } else {
        const out = await this.runGit(args);
        for (const record of out.split(RECORD_SEP)) ingest(record);
      }

      this.db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('refsSig', ?)").run(sig);
      this.db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('indexedHead', ?)").run(head);
      this.db
        .prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('builtAt', ?)")
        .run(new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Quick FTS5 / LIKE search returning hashes + subjects. */
  async search(query: string, limit = 50): Promise<Commit[]> {
    if (!this.open()) return [];
    const db = this.db!;
    let rows: Array<{
      hash: string;
      short: string;
      subject: string;
      body: string;
      date: string;
      author: string;
      email: string;
      parents: string;
    }> = [];
    try {
      rows = db
        .prepare(
          'SELECT c.hash, c.short, c.subject, c.body, c.date, c.author, c.email, c.parents FROM commits_fts f JOIN commits c ON c.rowid = f.rowid WHERE commits_fts MATCH ? LIMIT ?'
        )
        .all(query, limit) as typeof rows;
    } catch {
      const like = `%${query}%`;
      rows = db
        .prepare(
          'SELECT hash, short, subject, body, date, author, email, parents FROM commits WHERE subject LIKE ? OR body LIKE ? ORDER BY date DESC LIMIT ?'
        )
        .all(like, like, limit) as typeof rows;
    }
    return rows.map((r) => ({
      hash: r.hash,
      shortHash: r.short,
      authorEmail: r.email,
      subject: r.subject,
      body: r.body,
      message: r.body ? `${r.subject}\n\n${r.body}` : r.subject,
      date: r.date,
      author: r.author,
      parents: r.parents ? r.parents.split(' ').filter(Boolean) : [],
      branches: [],
      tags: [],
      isMerge: !!r.parents && r.parents.split(' ').filter(Boolean).length > 1
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async refSignature(): Promise<string> {
    const head = await this.currentHead();
    let refs = '';
    try {
      refs = await this.runGit([
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(creatordate:iso-strict)',
        'refs/heads',
        'refs/remotes',
        'refs/tags'
      ]);
    } catch {
      /* ignore */
    }
    return crypto
      .createHash('sha256')
      .update(head + '|' + refs)
      .digest('hex');
  }

  private async currentHead(): Promise<string> {
    return this.runGit(['rev-parse', 'HEAD'])
      .then((s) => s.trim())
      .catch(() => '');
  }

  private async isAncestor(base: string, head: string): Promise<boolean> {
    if (!/^[0-9a-fA-F]{4,40}$/.test(base) || !/^[0-9a-fA-F]{4,40}$/.test(head)) return false;
    return this.runGit(['merge-base', '--is-ancestor', base, head])
      .then(() => true)
      .catch(() => false);
  }
}
