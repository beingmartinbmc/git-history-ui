import path from 'path';
import type { AddressInfo } from 'net';
import {
  checkoutId,
  forgetCheckout,
  listCheckouts,
  rememberCheckout
} from '../backend/checkoutRegistry';
import { startServer, type BootResult } from '../backend/server';
import { resolveRepoToLocal } from '../cli';
import { request } from './helpers/http';
import { makeRepo, withTempHome, withTempHomeAsync } from './helpers/repo';

describe('checkout registry', () => {
  it('remembers, lists newest first, hides vanished clones and forgets by id or path', () => {
    withTempHome(() => {
      const a = makeRepo('ghui-ck-a-');
      const b = makeRepo('ghui-ck-b-');
      try {
        rememberCheckout(a.dir);
        rememberCheckout(b.dir);
        expect(listCheckouts().map((c) => c.path)).toEqual([b.dir, a.dir]);
        rememberCheckout(a.dir); // re-opening moves it to the front without duplicating
        expect(listCheckouts().map((c) => c.path)).toEqual([a.dir, b.dir]);

        expect(forgetCheckout(checkoutId(b.dir))).toBe(true);
        expect(forgetCheckout(b.dir)).toBe(false);
        expect(listCheckouts().map((c) => c.path)).toEqual([a.dir]);
        expect(forgetCheckout(a.dir)).toBe(true); // by path
        expect(listCheckouts()).toEqual([]);

        rememberCheckout(a.dir);
        a.cleanup();
        expect(listCheckouts()).toEqual([]); // gone from disk
        expect(() => rememberCheckout(path.join(b.dir, 'nope'))).toThrow(/Not a git checkout/);
      } finally {
        b.cleanup();
        a.cleanup();
      }
    });
  });

  it('lets portable links find a clone in a custom location', () => {
    withTempHome(() => {
      const repo = makeRepo('ghui-ck-custom-');
      try {
        repo.git(['remote', 'add', 'origin', 'git@github-personal:acme/widget.git']);
        expect(resolveRepoToLocal('https://github.com/acme/widget')).toBeUndefined();
        rememberCheckout(repo.dir);
        expect(resolveRepoToLocal('https://github.com/acme/widget')).toBe(repo.dir);
        expect(resolveRepoToLocal('https://github.com/acme/other')).toBeUndefined();
      } finally {
        repo.cleanup();
      }
    });
  });
});

describe('repo switcher API', () => {
  it('lists ids without paths and opens a remembered clone on its own server', async () => {
    await withTempHomeAsync(async () => {
      const a = makeRepo('ghui-sw-a-');
      const b = makeRepo('ghui-sw-b-');
      const unlisted = makeRepo('ghui-sw-unlisted-');
      let parent: BootResult | undefined;
      let childUrl = '';
      try {
        a.commit('a.txt', 'a', 'feat: in repo A');
        b.commit('b.txt', 'b', 'feat: in repo B');
        unlisted.commit('u.txt', 'u', 'feat: never remembered');
        rememberCheckout(b.dir);

        parent = await startServer(0, '127.0.0.1', { cwd: a.dir, llm: { provider: 'heuristic' } });
        const origin = `http://127.0.0.1:${(parent.server.address() as AddressInfo).port}`;

        const list = await request({ url: `${origin}/api/checkouts` });
        expect(list.status).toBe(200);
        expect(list.body.current).toBe(checkoutId(a.dir));
        expect(list.body.checkouts.map((c: { id: string }) => c.id)).toEqual([
          checkoutId(a.dir), // the running repo is listed even if never remembered
          checkoutId(b.dir)
        ]);
        expect(list.body.checkouts[0].current).toBe(true);
        expect(JSON.stringify(list.body)).not.toContain(b.dir); // no filesystem paths leak

        const same = await request({
          url: `${origin}/api/checkouts/${checkoutId(a.dir)}/open`,
          method: 'POST'
        });
        expect(same.body.url).toBe(origin);

        const open = await request({
          url: `${origin}/api/checkouts/${checkoutId(b.dir)}/open`,
          method: 'POST'
        });
        expect(open.status).toBe(200);
        childUrl = open.body.url;
        expect(childUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        expect(childUrl).not.toBe(origin);
        const again = await request({
          url: `${origin}/api/checkouts/${checkoutId(b.dir)}/open`,
          method: 'POST'
        });
        expect(again.body.url).toBe(childUrl); // reused, not restarted

        const commits = await request({ url: `${childUrl}/api/commits` });
        expect(commits.body.commits.map((c: { subject: string }) => c.subject)).toEqual([
          'feat: in repo B'
        ]);

        // Only remembered clones can be opened: arbitrary ids and unlisted repos are refused.
        for (const id of [checkoutId(unlisted.dir), 'zzzzzzzzzzzz', '..%2F..']) {
          const r = await request({ url: `${origin}/api/checkouts/${id}/open`, method: 'POST' });
          expect(r.status).toBe(404);
        }

        await parent.close(); // children go down with their parent
        parent = undefined;
        await expect(fetch(`${childUrl}/api/commits`)).rejects.toThrow();
      } finally {
        await parent?.close();
        for (const r of [a, b, unlisted]) r.cleanup();
      }
    });
  });
});
