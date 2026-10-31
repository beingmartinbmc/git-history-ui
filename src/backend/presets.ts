import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface PresetFilters {
  file?: string;
  since?: string;
  until?: string;
  author?: string;
  search?: string;
  searchMode?: 'classic' | 'nl';
  port?: number;
}

interface PresetsFile {
  version: 1;
  presets: Record<string, PresetFilters>;
}

const FILE = path.join(os.homedir(), '.git-history-ui', 'presets.json');

// Read-modify-write cycles must not interleave, or concurrent saves lose updates.
// ponytail: serializes within this process only; cross-process writers can still
// lose an update (the file itself stays valid thanks to tmp + rename).
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
}

export class PresetsStore {
  async list(): Promise<Record<string, PresetFilters>> {
    return (await this.load()).presets;
  }

  async get(name: string): Promise<PresetFilters | null> {
    const data = await this.load();
    return Object.prototype.hasOwnProperty.call(data.presets, name) ? data.presets[name] : null;
  }

  async save(name: string, filters: PresetFilters): Promise<void> {
    if (!isSafeName(name)) throw new Error(`Invalid preset name: ${name}`);
    const clean = sanitizeFilters(filters);
    await serialized(async () => {
      const data = await this.load();
      data.presets[name] = clean;
      await this.write(data);
    });
  }

  async delete(name: string): Promise<boolean> {
    return serialized(async () => {
      const data = await this.load();
      if (!Object.prototype.hasOwnProperty.call(data.presets, name)) return false;
      delete data.presets[name];
      await this.write(data);
      return true;
    });
  }

  async path(): Promise<string> {
    return FILE;
  }

  private async load(): Promise<PresetsFile> {
    try {
      const raw = await fs.promises.readFile(FILE, 'utf8');
      const parsed = JSON.parse(raw) as PresetsFile;
      if (parsed?.version === 1 && parsed.presets) return parsed;
    } catch {
      /* missing or corrupt → defaults */
    }
    return { version: 1, presets: {} };
  }

  private async write(data: PresetsFile): Promise<void> {
    await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}-${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmp, FILE);
    } catch (err) {
      await fs.promises.unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}

function isSafeName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,40}$/.test(name);
}

const TEXT_KEYS = ['file', 'since', 'until', 'author', 'search'] as const;

/** Whitelist known keys and types; unknown keys are dropped, bad values rejected. */
function sanitizeFilters(input: unknown): PresetFilters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid preset: body must be an object');
  }
  const src = input as Record<string, unknown>;
  const out: PresetFilters = {};
  for (const key of TEXT_KEYS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > 500) throw new Error(`Invalid preset: ${key}`);
    out[key] = v;
  }
  if (src.searchMode !== undefined && src.searchMode !== null) {
    if (src.searchMode !== 'classic' && src.searchMode !== 'nl') {
      throw new Error('Invalid preset: searchMode');
    }
    out.searchMode = src.searchMode;
  }
  if (src.port !== undefined && src.port !== null) {
    if (!Number.isInteger(src.port) || (src.port as number) < 1 || (src.port as number) > 65535) {
      throw new Error('Invalid preset: port');
    }
    out.port = src.port as number;
  }
  return out;
}
