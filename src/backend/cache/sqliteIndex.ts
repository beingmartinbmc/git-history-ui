import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Commit } from '../gitService';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';
export const SQLITE_LOG_FORMAT = ['%H', '%h', '%an', '%ae', '%aI', '%P', '%s', '%b'].join(FIELD_SEP);

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

export class SqliteIndex {
  private dbFile: string;
  private repoCwd: string;
  private db: SqliteDB | null = null;
  private buildPromise: Promise<void> | null = null;

  constructor(repoCwd: string, private runGit: GitRunner) {
    this.repoCwd = repoCwd;
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
      (this.db!.prepare("SELECT v FROM meta WHERE k = 'builtAt'").get() as { v: string } | undefined)?.v ?? null;
    return { available: true, total, builtAt };
  }

  /** Synchronously build the index from `git log --all`. Idempotent. */
  async build(): Promise<IndexStats> {
    if (!this.open()) return this.stats();
    if (this.buildPromise) {
      await this.buildPromise;
      return this.stats();
    }
    this.buildPromise = this.doBuild();
    try {
      await this.buildPromise;
    } finally {
      this.buildPromise = null;
    }
    return this.stats();
  }

  private async doBuild(): Promise<void> {
    if (!this.db) return;
    const sig = await this.refSignature();
    const stored = (this.db.prepare("SELECT v FROM meta WHERE k='refsSig'").get() as { v: string } | undefined)?.v;
    if (stored === sig) return;

    const out = await this.runGit([
      'log',
      '--all',
      `--pretty=format:${SQLITE_LOG_FORMAT}${RECORD_SEP}`
    ]);

    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM commits');
      try { this.db.exec('DELETE FROM commits_fts'); } catch { /* no fts */ }
      const ins = this.db.prepare(
        'INSERT OR REPLACE INTO commits(hash,short,author,email,date,parents,subject,body) VALUES (?,?,?,?,?,?,?,?)'
      );
      const insFts = (() => {
        try {
          return this.db!.prepare(
            "INSERT INTO commits_fts(rowid,subject,body) VALUES ((SELECT rowid FROM commits WHERE hash = ?), ?, ?)"
          );
        } catch {
          return null;
        }
      })();

      for (const record of out.split(RECORD_SEP)) {
        const trimmed = record.trim();
        if (!trimmed) continue;
        const fields = trimmed.split(FIELD_SEP);
        if (fields.length < 8) continue;
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
      }

      this.db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('refsSig', ?)").run(sig);
      this.db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('builtAt', ?)").run(new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Quick FTS5 / LIKE search returning hashes + subjects. */
  async search(
    query: string,
    limit = 50
  ): Promise<Array<Pick<Commit, 'hash' | 'shortHash' | 'subject' | 'date' | 'author'>>> {
    if (!this.open()) return [];
    const db = this.db!;
    let rows: Array<{ hash: string; short: string; subject: string; date: string; author: string }> = [];
    try {
      rows = db
        .prepare(
          'SELECT c.hash, c.short, c.subject, c.date, c.author FROM commits_fts f JOIN commits c ON c.rowid = f.rowid WHERE commits_fts MATCH ? LIMIT ?'
        )
        .all(query, limit) as typeof rows;
    } catch {
      const like = `%${query}%`;
      rows = db
        .prepare(
          'SELECT hash, short, subject, date, author FROM commits WHERE subject LIKE ? OR body LIKE ? ORDER BY date DESC LIMIT ?'
        )
        .all(like, like, limit) as typeof rows;
    }
    return rows.map((r) => ({
      hash: r.hash,
      shortHash: r.short,
      subject: r.subject,
      date: r.date,
      author: r.author
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async refSignature(): Promise<string> {
    const head = await this.runGit(['rev-parse', 'HEAD']).catch(() => '');
    let mtimes = '';
    try {
      const refsDir = path.join(this.repoCwd, '.git', 'refs');
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else mtimes += `${full}:${fs.statSync(full).mtimeMs};`;
        }
      };
      if (fs.existsSync(refsDir)) walk(refsDir);
    } catch {
      /* ignore */
    }
    return crypto.createHash('sha256').update(head + '|' + mtimes).digest('hex');
  }
}
