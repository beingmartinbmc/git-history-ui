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

const ROOT_DIR = path.join(os.homedir(), '.git-history-ui');

/**
 * Local-first annotations store. Per-repo JSON file under
 * ~/.git-history-ui/<repo-hash>/annotations.json.
 *
 * Local-only: nothing is synced unless the user opts into a share server later.
 */
export class AnnotationsStore {
  private file: string;
  private mu: Promise<void> = Promise.resolve();

  constructor(repoCwd: string) {
    const id = crypto.createHash('sha256').update(path.resolve(repoCwd)).digest('hex').slice(0, 16);
    this.file = path.join(ROOT_DIR, id, 'annotations.json');
  }

  async list(hash: string): Promise<AnnotationComment[]> {
    const data = await this.load();
    return data.byHash[hash] ?? [];
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
      await this.save(data);
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
      await this.save(data);
      removed = true;
    });
    return removed;
  }

  private async load(): Promise<FileShape> {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as FileShape;
      if (parsed?.version === 1 && parsed.byHash) return parsed;
    } catch {
      /* missing or corrupt -> default */
    }
    return { version: 1, byHash: {} };
  }

  private async save(data: FileShape): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, this.file);
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
