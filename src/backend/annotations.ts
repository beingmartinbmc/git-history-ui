import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
  private resetJournalOnNextWrite = false;

  constructor(repoCwd: string) {
    const id = crypto.createHash('sha256').update(path.resolve(repoCwd)).digest('hex').slice(0, 16);
    this.file = path.join(ROOT_DIR, id, 'annotations.json');
    this.journal = path.join(ROOT_DIR, id, 'annotations.jsonl');
  }

  async list(hash: string): Promise<AnnotationComment[]> {
    const data = await this.load();
    return [...(data.byHash[hash] ?? [])];
  }

  async add(hash: string, input: { author: string; body: string }): Promise<AnnotationComment> {
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
    let replayJournal = true;
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as FileShape;
      if (parsed?.version === 1 && parsed.byHash) {
        data = parsed;
      } else {
        replayJournal = false;
        this.resetJournalOnNextWrite = true;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      replayJournal = code === 'ENOENT';
      if (!replayJournal) this.resetJournalOnNextWrite = true;
    }
    if (replayJournal) {
      try {
        const raw = await fs.promises.readFile(this.journal, 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          this.applyJournal(data, JSON.parse(line) as JournalEntry);
        }
      } catch {
        /* missing or corrupt -> default */
      }
    }
    this.cache = data;
    this.cacheSignature = signature;
    return data;
  }

  private async append(entry: JournalEntry, data: FileShape): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.journal), { recursive: true });
    if (this.resetJournalOnNextWrite) {
      await fs.promises.writeFile(this.journal, `${JSON.stringify(entry)}\n`, 'utf8');
      this.resetJournalOnNextWrite = false;
    } else {
      await fs.promises.appendFile(this.journal, `${JSON.stringify(entry)}\n`, 'utf8');
    }
    if (!(await this.isValidSnapshotFile())) {
      await this.saveSnapshot(data);
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
    if (entry.op === 'add') {
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
    return prev.then(fn).finally(() => release());
  }
}
