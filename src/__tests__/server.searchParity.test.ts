import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { SqliteIndex } from '../backend/cache/sqliteIndex';
import { startServer, type BootResult } from '../backend/server';
import { makeRepo, withTempHomeAsync, type TestRepo } from './helpers/repo';

/**
 * Journey: the same NL query must return the same commits, order and totals whether the SQLite
 * index supplies candidates or git does — on every page, and in the export.
 */
const maybe = SqliteIndex.isAvailable() ? describe : describe.skip;

maybe('NL search parity: indexed vs git', () => {
  jest.setTimeout(60_000);

  const commitAs = (repo: TestRepo, file: string, msg: string, author: string, date: string) => {
    writeFileSync(path.join(repo.dir, file), msg);
    repo.git(['add', '-A']);
    process.env.GIT_COMMITTER_DATE = date; // git --since filters on committer date
    try {
      repo.git([
        'commit',
        '-q',
        `--author=${author} <${author.toLowerCase()}@example.com>`,
        `--date=${date}`,
        '-m',
        msg
      ]);
    } finally {
      delete process.env.GIT_COMMITTER_DATE;
    }
    return repo.git(['rev-parse', 'HEAD']).trim();
  };

  const open = async (cwd: string) => {
    const boot: BootResult = await startServer(0, '127.0.0.1', { cwd });
    return { boot, origin: `http://127.0.0.1:${(boot.server.address() as AddressInfo).port}` };
  };

  const get = async (origin: string, route: string) => {
    const res = await fetch(`${origin}${route}`);
    return { res, body: (await res.json()) as any };
  };

  it('returns identical candidates, ranking, pages and exports', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo('ghui-parity-');
      const copy = mkdtempSync(path.join(os.tmpdir(), 'ghui-parity-copy-'));
      const servers: BootResult[] = [];
      try {
        const c1 = commitAs(repo, 'a.txt', 'feat: add login flow', 'Alice', '2024-01-10T12:00:00Z');
        commitAs(repo, 'b.txt', 'fix: payment rounding bug', 'Bob', '2024-02-10T12:00:00Z');
        const c3 = commitAs(
          repo,
          'c.txt',
          'docs: update login docs',
          'Alice',
          '2024-03-10T12:00:00Z'
        );
        repo.git(['checkout', '-q', '-b', 'exp']);
        const side = commitAs(
          repo,
          'd.txt',
          'feat: login experiment',
          'Alice',
          '2024-03-20T12:00:00Z'
        );
        repo.git(['checkout', '-q', 'main']);
        const c4 = commitAs(repo, 'e.txt', 'chore: login cleanup', 'Carol', '2024-04-10T12:00:00Z');
        repo.git(['tag', '-a', 'v1', '-m', 'release', c4]);

        // Same hashes, different path → separate index database.
        cpSync(repo.dir, copy, { recursive: true });
        const git = await open(repo.dir); // never indexed: the git path
        const indexed = await open(copy);
        servers.push(git.boot, indexed.boot);

        const built = await fetch(`${indexed.origin}/api/index/build?wait=true`, {
          method: 'POST'
        });
        expect(built.status).toBe(200);
        const status = (await get(indexed.origin, '/api/index/status')).body;
        expect(status.total).toBe(5); // all refs are indexed...
        expect((await get(git.origin, '/api/index/status')).body.total).toBe(0);

        const hashesOf = (b: { commits: Array<{ hash: string }> }) => b.commits.map((c) => c.hash);
        const queries: Array<[string, string[]]> = [
          ['q=login', [c1, c3, c4]], // ...but HEAD scope hides the `exp` commit on both paths
          ['q=login+by+Alice', [c1, c3]], // author parsed from the sentence
          ['q=login&author=Carol', [c4]],
          ['q=login&since=2024-03-01', [c3, c4]],
          ['q=login&until=2024-02-01', [c1]]
        ];
        for (const [query, expected] of queries) {
          const a = (await get(git.origin, `/api/search?${query}`)).body;
          const b = (await get(indexed.origin, `/api/search?${query}`)).body;
          expect(hashesOf(a).sort()).toEqual([...expected].sort());
          expect(hashesOf(b)).toEqual(hashesOf(a)); // same order, not just same set
          expect(b.total).toBe(a.total);
          expect(b.availableTotal).toBe(a.availableTotal);
          expect(b.parsedQuery).toEqual(a.parsedQuery);
          expect(hashesOf(b)).not.toContain(side);
        }

        // Branch/tag enrichment survives the index path.
        const tagged = (await get(indexed.origin, '/api/search?q=cleanup')).body.commits[0];
        expect(tagged.tags).toContain('v1');
        expect(tagged.branches).toContain('main');

        // Every page is a slice of one ranking, on both paths.
        for (const { origin } of [git, indexed]) {
          const full = (await get(origin, '/api/search?q=login&pageSize=10')).body;
          const seen: string[] = [];
          for (let page = 1; page <= 3; page++) {
            const p = (await get(origin, `/api/search?q=login&pageSize=1&page=${page}`)).body;
            expect(p.total).toBe(3);
            expect(p.hasNext).toBe(page < 3);
            seen.push(...hashesOf(p));
          }
          expect(seen).toEqual(hashesOf(full));
        }

        // Export carries the NL results and reports the real total.
        for (const { origin } of [git, indexed]) {
          const res = await fetch(
            `${origin}/api/export/commits?format=json&searchMode=nl&search=login`
          );
          const rows = (await res.json()) as Array<{ hash: string }>;
          const ranked = (await get(origin, '/api/search?q=login&pageSize=10')).body;
          expect(rows.map((r) => r.hash)).toEqual(hashesOf(ranked));
          expect(res.headers.get('x-total-commits')).toBe('3');
          expect(res.headers.get('x-export-truncated')).toBe('false');
        }
      } finally {
        for (const s of servers) await s.close();
        rmSync(copy, { recursive: true, force: true });
        repo.cleanup();
      }
    });
  });
});
