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

export class PresetsStore {
  async list(): Promise<Record<string, PresetFilters>> {
    return (await this.load()).presets;
  }

  async get(name: string): Promise<PresetFilters | null> {
    const data = await this.load();
    return data.presets[name] ?? null;
  }

  async save(name: string, filters: PresetFilters): Promise<void> {
    if (!isSafeName(name)) throw new Error(`Invalid preset name: ${name}`);
    const data = await this.load();
    data.presets[name] = filters;
    await this.write(data);
  }

  async delete(name: string): Promise<boolean> {
    const data = await this.load();
    if (!(name in data.presets)) return false;
    delete data.presets[name];
    await this.write(data);
    return true;
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
    const tmp = `${FILE}.tmp-${process.pid}`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, FILE);
  }
}

function isSafeName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,40}$/.test(name);
}
