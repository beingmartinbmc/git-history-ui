import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isPlausibleHash } from './gitService';

const LOCKFILE_STALE_MS = 30_000;
const COMPACT_EVERY = 100;

export interface AnnotationComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommitAnnotations {
  hash: string;
  comments: AnnotationComment[];
}

interface FileShape {
  version: 1;
  byHash: Record<string, AnnotationComment[]>;
}

type JournalEntry =
  | { op: 'add'; hash: string; comment: AnnotationComment }
  | { op: 'remove'; hash: string; id: string };

const ROOT_DIR = path.join(os.homedir(), '.git-history-ui');

/**
 * Local-first annotations store. Per-repo JSON file under
 * ~/.git-history-ui/<repo-hash>/annotations.json.
 *
 * Local-only: nothing is synced unless the user opts into a share server later.
 */
export class AnnotationsStore {
  private file: string;
  private journal: string;
  private mu: Promise<void> = Promise.resolve();
  private cache: FileShape | null = null;
  private cacheSignature = '';
  private journalEntries = 0;

  constructor(repoCwd: string) {
    const id = crypto.createHash('sha256').update(path.resolve(repoCwd)).digest('hex').slice(0, 16);
    this.file = path.join(ROOT_DIR, id, 'annotations.json');
    this.journal = path.join(ROOT_DIR, id, 'annotations.jsonl');
  }

  async list(hash: string): Promise<AnnotationComment[]> {
    assertHash(hash);
    const data = await this.load();
    return [...(data.byHash[hash] ?? [])];
  }

  async add(hash: string, input: { author: string; body: string }): Promise<AnnotationComment> {
    assertHash(hash);
    let result!: AnnotationComment;
    await this.withLock(async () => {
      const data = await this.load();
      const comment: AnnotationComment = {
        id: crypto.randomUUID(),
        author: input.author || 'anonymous',
        body: input.body,
        createdAt: new Date().toISOString()
      };
      const list = data.byHash[hash] ?? [];
      list.push(comment);
      data.byHash[hash] = list;
      await this.append({ op: 'add', hash, comment }, data);
      result = comment;
    });
    return result;
  }

  async remove(hash: string, id: string): Promise<boolean> {
    assertHash(hash);
    let removed = false;
    await this.withLock(async () => {
      const data = await this.load();
      const list = data.byHash[hash] ?? [];
      const idx = list.findIndex((c) => c.id === id);
      if (idx === -1) return;
      list.splice(idx, 1);
      data.byHash[hash] = list;
      await this.append({ op: 'remove', hash, id }, data);
      removed = true;
    });
    return removed;
  }

  private async load(): Promise<FileShape> {
    const signature = await this.storageSignature();
    if (this.cache && signature === this.cacheSignature) return this.cache;
    let data: FileShape = { version: 1, byHash: {} };
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.file, 'utf8')) as FileShape;
      if (parsed?.version === 1 && parsed.byHash && typeof parsed.byHash === 'object') {
        data = parsed;
      }
    } catch {
      /* missing or corrupt snapshot: the journal below is the complete log */
    }
    // Replay is idempotent, so it is always safe on top of a (possibly stale) snapshot.
    let entries = 0;
    try {
      const raw = await fs.promises.readFile(this.journal, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          this.applyJournal(data, JSON.parse(line) as JournalEntry);
          entries++;
        } catch {
          /* skip a torn or corrupt line instead of dropping the rest */
        }
      }
    } catch {
      /* no journal yet */
    }
    this.journalEntries = entries;
    this.cache = data;
    this.cacheSignature = signature;
    return data;
  }

  private async append(entry: JournalEntry, data: FileShape): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.journal), { recursive: true });
    await fs.promises.appendFile(this.journal, `${JSON.stringify(entry)}\n`, 'utf8');
    this.journalEntries++;
    const compact = this.journalEntries >= COMPACT_EVERY;
    if (compact || !(await this.isValidSnapshotFile())) {
      await this.saveSnapshot(data);
      if (compact) {
        // Snapshot is durable (tmp + rename) before the journal is emptied.
        await fs.promises.writeFile(this.journal, '', 'utf8');
        this.journalEntries = 0;
      }
    }
    this.cacheSignature = await this.storageSignature();
  }

  private async saveSnapshot(data: FileShape): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, this.file);
  }

  private async isValidSnapshotFile(): Promise<boolean> {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as FileShape;
      return parsed?.version === 1 && !!parsed.byHash;
    } catch {
      return false;
    }
  }

  private async storageSignature(): Promise<string> {
    const [file, journal] = await Promise.all([
      fs.promises.stat(this.file).catch(() => null),
      fs.promises.stat(this.journal).catch(() => null)
    ]);
    return `${file?.mtimeMs ?? 0}:${file?.size ?? 0}|${journal?.mtimeMs ?? 0}:${journal?.size ?? 0}`;
  }

  private applyJournal(data: FileShape, entry: JournalEntry): void {
    // Hashes are used as object keys; reject anything (e.g. __proto__) that isn't a hash.
    if (!isPlausibleHash(entry?.hash)) throw new Error('invalid journal entry');
    if (entry.op === 'add') {
      if (typeof entry.comment?.id !== 'string') throw new Error('invalid journal entry');
      const list = data.byHash[entry.hash] ?? [];
      if (!list.some((c) => c.id === entry.comment.id)) list.push(entry.comment);
      data.byHash[entry.hash] = list;
      return;
    }
    const list = data.byHash[entry.hash] ?? [];
    data.byHash[entry.hash] = list.filter((c) => c.id !== entry.id);
  }

  private withLock(fn: () => Promise<void>): Promise<void> {
    const prev = this.mu;
    let release!: () => void;
    this.mu = new Promise<void>((resolve) => {
      release = resolve;
    });
    return prev
      .then(() => this.acquireFileLock())
      .then(async () => {
        try {
          await fn();
        } finally {
          await this.releaseFileLock();
          release();
        }
      })
      .catch((err) => {
        release();
        throw err;
      });
  }

  private get lockPath(): string {
    return `${this.journal}.lock`;
  }

  private async acquireFileLock(retries = 10): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await fs.promises.mkdir(path.dirname(this.lockPath), { recursive: true });
        const fd = await fs.promises.open(
          this.lockPath,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        );
        await fd.write(`${process.pid}\n${Date.now()}\n`);
        await fd.close();
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        // ponytail: break stale locks from crashed processes
        try {
          const raw = await fs.promises.readFile(this.lockPath, 'utf8');
          const ts = parseInt(raw.split('\n')[1] ?? '0', 10);
          if (Date.now() - ts > LOCKFILE_STALE_MS) {
            await fs.promises.unlink(this.lockPath).catch(() => {});
            continue;
          }
        } catch (readErr) {
          // ENOENT = lock was just released by its holder; retry acquire
          if ((readErr as NodeJS.ErrnoException).code === 'ENOENT') continue;
          // Other read error: lock file exists but unreadable — wait and retry
        }
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
      }
    }
    throw new Error('annotations: could not acquire file lock');
  }

  private async releaseFileLock(): Promise<void> {
    await fs.promises.unlink(this.lockPath).catch(() => {});
  }
}

function assertHash(hash: string): void {
  if (!isPlausibleHash(hash)) throw new Error('Invalid commit hash');
}
