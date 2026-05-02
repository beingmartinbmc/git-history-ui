import fs from 'fs';
import path from 'path';
import { withTempHomeAsync } from './helpers/repo';

describe('AnnotationsStore', () => {
  const fresh = () => {
    jest.resetModules();
    return require('../backend/annotations') as typeof import('../backend/annotations');
  };

  it('returns [] for an unknown commit', async () => {
    await withTempHomeAsync(async () => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-x');
      await expect(store.list('abc')).resolves.toEqual([]);
    });
  });

  it('add → list → remove round-trip persists to disk', async () => {
    await withTempHomeAsync(async (home) => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-y');

      const c1 = await store.add('deadbeef', { author: 'alice', body: 'first note' });
      const c2 = await store.add('deadbeef', { author: 'bob', body: 'second note' });
      expect(c1.id).not.toBe(c2.id);

      const list = await store.list('deadbeef');
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({ author: 'alice', body: 'first note' });
      expect(list[1]).toMatchObject({ author: 'bob', body: 'second note' });

      // File must exist under the per-repo subdirectory.
      const dirEntries = fs.readdirSync(path.join(home, '.git-history-ui'));
      expect(dirEntries.length).toBe(1);
      const file = path.join(home, '.git-history-ui', dirEntries[0], 'annotations.json');
      expect(fs.existsSync(file)).toBe(true);

      const removed = await store.remove('deadbeef', c1.id);
      expect(removed).toBe(true);
      const after = await store.list('deadbeef');
      expect(after.map((c) => c.id)).toEqual([c2.id]);

      // Removing again returns false.
      await expect(store.remove('deadbeef', c1.id)).resolves.toBe(false);
      // Removing from an unknown commit returns false.
      await expect(store.remove('cafef00d', 'whatever')).resolves.toBe(false);
    });
  });

  it('defaults missing author to "anonymous"', async () => {
    await withTempHomeAsync(async () => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-z');
      const c = await store.add('feedface', { author: '', body: 'no author' });
      expect(c.author).toBe('anonymous');
    });
  });

  it('serializes concurrent writes without losing comments', async () => {
    await withTempHomeAsync(async () => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-concurrent');

      const writers = Array.from({ length: 25 }, (_, i) =>
        store.add('aaaaaaaa', { author: 'u' + i, body: 'body ' + i })
      );
      const created = await Promise.all(writers);
      expect(new Set(created.map((c) => c.id)).size).toBe(25);

      const all = await store.list('aaaaaaaa');
      expect(all).toHaveLength(25);
      expect(all.map((c) => c.body).sort()).toEqual(
        Array.from({ length: 25 }, (_, i) => 'body ' + i).sort()
      );
    });
  });

  it('falls back gracefully on a corrupt annotations file', async () => {
    await withTempHomeAsync(async (home) => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-corrupt');

      // Trigger directory creation by adding a comment first, then corrupt the file.
      const seed = await store.add('11111111', { author: 'a', body: 'b' });

      const dirEntries = fs.readdirSync(path.join(home, '.git-history-ui'));
      const file = path.join(home, '.git-history-ui', dirEntries[0], 'annotations.json');
      fs.writeFileSync(file, '<<< not json');

      // list() of an unknown hash is empty (corrupt → defaults).
      await expect(store.list('22222222')).resolves.toEqual([]);

      // Adding overrides the corrupt file with a valid one.
      await store.add('22222222', { author: 'c', body: 'd' });
      const after = await store.list('22222222');
      expect(after).toHaveLength(1);
      // The seed's data is gone (expected — corrupt file was discarded).
      void seed;
    });
  });

  it('ignores annotation files with the wrong version', async () => {
    await withTempHomeAsync(async (home) => {
      const { AnnotationsStore } = fresh();
      const store = new AnnotationsStore('/tmp/repo-bad-ver');

      // Pre-write a stub file with bad version BEFORE the store touches disk.
      // We don't know the per-repo hash, so just write into the right location
      // by triggering an add then overwriting.
      await store.add('1', { author: 'x', body: 'y' });
      const dirEntries = fs.readdirSync(path.join(home, '.git-history-ui'));
      const file = path.join(home, '.git-history-ui', dirEntries[0], 'annotations.json');
      fs.writeFileSync(file, JSON.stringify({ version: 99, byHash: { '1': [{ id: 'leak' }] } }));

      const list = await store.list('1');
      expect(list).toEqual([]);
    });
  });
});
