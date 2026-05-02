import fs from 'fs';
import path from 'path';
import { withTempHomeAsync } from './helpers/repo';

describe('PresetsStore', () => {
  // Re-require with a fresh module registry so the module-level FILE constant
  // picks up the current $HOME we set before importing.
  const freshLoad = () => {
    jest.resetModules();
    return require('../backend/presets') as typeof import('../backend/presets');
  };

  it('starts empty when no file exists', async () => {
    await withTempHomeAsync(async () => {
      const { PresetsStore } = freshLoad();
      const store = new PresetsStore();
      await expect(store.list()).resolves.toEqual({});
      await expect(store.get('anything')).resolves.toBeNull();
    });
  });

  it('saves, lists, gets, and deletes presets atomically', async () => {
    await withTempHomeAsync(async (home) => {
      const { PresetsStore } = freshLoad();
      const store = new PresetsStore();

      await store.save('work', { since: '2026-01-01', author: 'alice' });
      await store.save('home', { file: 'README.md' });

      const all = await store.list();
      expect(Object.keys(all).sort()).toEqual(['home', 'work']);
      expect(all.work.author).toBe('alice');

      const fp = await store.path();
      expect(fp).toBe(path.join(home, '.git-history-ui', 'presets.json'));
      // Ensure file actually written and valid JSON.
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      expect(raw.version).toBe(1);

      await expect(store.get('work')).resolves.toMatchObject({ author: 'alice' });

      const ok = await store.delete('work');
      expect(ok).toBe(true);
      const after = await store.list();
      expect(Object.keys(after)).toEqual(['home']);

      // Deleting an unknown preset returns false without throwing.
      await expect(store.delete('nope')).resolves.toBe(false);
    });
  });

  it('rejects unsafe preset names', async () => {
    await withTempHomeAsync(async () => {
      const { PresetsStore } = freshLoad();
      const store = new PresetsStore();
      await expect(store.save('../escape', {})).rejects.toThrow(/Invalid preset name/);
      await expect(store.save('a'.repeat(60), {})).rejects.toThrow(/Invalid preset name/);
      await expect(store.save('with space', {})).rejects.toThrow(/Invalid preset name/);
    });
  });

  it('falls back to defaults when the file is corrupt', async () => {
    await withTempHomeAsync(async (home) => {
      const dir = path.join(home, '.git-history-ui');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'presets.json'), '{not json');

      const { PresetsStore } = freshLoad();
      const store = new PresetsStore();
      await expect(store.list()).resolves.toEqual({});

      await store.save('fresh', { port: 4242 });
      const all = await store.list();
      expect(all.fresh.port).toBe(4242);
    });
  });

  it('ignores files with the wrong version field', async () => {
    await withTempHomeAsync(async (home) => {
      const dir = path.join(home, '.git-history-ui');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'presets.json'),
        JSON.stringify({ version: 99, presets: { x: {} } })
      );

      const { PresetsStore } = freshLoad();
      const store = new PresetsStore();
      await expect(store.list()).resolves.toEqual({});
    });
  });
});
