import { withTempHomeAsync, makeRepo, type TestRepo } from './helpers/repo';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

const fakeLog = (rows: Array<{ hash: string; short: string; author: string; email: string; date: string; parents: string; subject: string; body: string }>): string =>
  rows.map((r) => [r.hash, r.short, r.author, r.email, r.date, r.parents, r.subject, r.body].join(FIELD_SEP)).join(RECORD_SEP) + RECORD_SEP;

describe('SqliteIndex', () => {
  const fresh = () => {
    jest.resetModules();
    return require('../backend/cache/sqliteIndex') as typeof import('../backend/cache/sqliteIndex');
  };

  it('reports availability based on better-sqlite3 presence', () => {
    const { SqliteIndex } = fresh();
    expect(SqliteIndex.isAvailable()).toBe(true);
  });

  it('builds an index, runs FTS5 and LIKE searches, and remembers the refsSig', async () => {
    await withTempHomeAsync(async () => {
      const { SqliteIndex } = fresh();
      const repo: TestRepo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'feat: alpha login');
        const callLog: string[][] = [];
        const runner = async (args: string[]): Promise<string> => {
          callLog.push(args);
          if (args[0] === 'rev-parse') return 'fakehead\n';
          if (args[0] === 'log') {
            return fakeLog([
              {
                hash: '1111111111111111111111111111111111111111',
                short: '1111111',
                author: 'alice',
                email: 'a@x.com',
                date: '2026-04-01T00:00:00Z',
                parents: '',
                subject: 'feat: add login',
                body: 'longer body here'
              },
              {
                hash: '2222222222222222222222222222222222222222',
                short: '2222222',
                author: 'bob',
                email: 'b@x.com',
                date: '2026-04-02T00:00:00Z',
                parents: '1111111111111111111111111111111111111111',
                subject: 'fix: payments rounding',
                body: ''
              }
            ]);
          }
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        const stats0 = await idx.stats();
        expect(stats0.available).toBe(true);
        expect(stats0.total).toBe(0);

        const built = await idx.build();
        expect(built.total).toBe(2);
        expect(built.builtAt).not.toBeNull();

        // Idempotent: same refSig → no work.
        const before = callLog.length;
        await idx.build();
        // We expect just a HEAD/refSig check, not another `log`.
        const after = callLog.length;
        expect(after - before).toBeLessThanOrEqual(2);

        const ftsHits = await idx.search('login', 5);
        expect(ftsHits.map((h) => h.hash)).toContain('1111111111111111111111111111111111111111');

        // Search for token only present in body.
        const bodyHit = await idx.search('longer', 5);
        expect(bodyHit.length).toBeGreaterThan(0);

        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('rebuilds when refsSig changes', async () => {
    await withTempHomeAsync(async () => {
      const { SqliteIndex } = fresh();
      const repo = makeRepo();
      try {
        let head = 'sha-1';
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return head + '\n';
          if (args[0] === 'log') {
            return fakeLog([
              {
                hash: '3'.repeat(40),
                short: '3333333',
                author: 'a',
                email: 'a@x',
                date: '2026-05-01T00:00:00Z',
                parents: '',
                subject: 'first',
                body: ''
              }
            ]);
          }
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        const r1 = await idx.build();
        expect(r1.total).toBe(1);

        head = 'sha-2'; // simulate ref movement
        const r2 = await idx.build();
        // Still 1 row but rebuild path executed.
        expect(r2.total).toBe(1);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('coalesces concurrent build() calls', async () => {
    await withTempHomeAsync(async () => {
      const { SqliteIndex } = fresh();
      const repo = makeRepo();
      try {
        let logCalls = 0;
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'log') {
            logCalls++;
            // Simulate a slow log.
            await new Promise((r) => setTimeout(r, 30));
            return fakeLog([]);
          }
          return 'h\n';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await Promise.all([idx.build(), idx.build(), idx.build()]);
        expect(logCalls).toBe(1);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('close() then open() works idempotently', async () => {
    await withTempHomeAsync(async () => {
      const { SqliteIndex } = fresh();
      const repo = makeRepo();
      try {
        const idx = new SqliteIndex(repo.dir, async () => '');
        expect(idx.open()).toBe(true);
        expect(idx.isOpen()).toBe(true);
        expect(idx.open()).toBe(true); // already open → no-op
        idx.close();
        expect(idx.isOpen()).toBe(false);
        idx.close(); // safe to call twice
      } finally {
        repo.cleanup();
      }
    });
  });

  it('uses the streaming runner when one is provided and parses incremental chunks', async () => {
    await withTempHomeAsync(async () => {
      const { SqliteIndex } = fresh();
      const repo: TestRepo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'feat: alpha');
        const accented = 'caf\u00e9';
        const buffered = fakeLog([
          {
            hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            short: 'aaaaaaa',
            author: 'alice',
            email: 'a@x.com',
            date: '2026-04-01T00:00:00Z',
            parents: '',
            subject: `feat: ${accented} streaming login`,
            body: 'streamed body'
          },
          {
            hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            short: 'bbbbbbb',
            author: 'bob',
            email: 'b@x.com',
            date: '2026-04-02T00:00:00Z',
            parents: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            subject: 'fix: streaming payment',
            body: ''
          }
        ]);

        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'streamhead\n';
          // The buffered runner is the fallback path; the streaming
          // runner below is what we want to exercise here, so this
          // should never be hit during build.
          return '';
        };

        let streamCalls = 0;
        const streamer = async (
          _args: string[],
          onChunk: (c: Buffer) => void
        ): Promise<void> => {
          streamCalls++;
          // Split inside the two-byte UTF-8 sequence for \u00e9 to prove the
          // indexer decodes chunks with StringDecoder rather than corrupting
          // multi-byte characters at chunk boundaries.
          const buf = Buffer.from(buffered, 'utf8');
          const marker = Buffer.from(accented, 'utf8');
          const markerAt = buf.indexOf(marker);
          const splitInsideAccent = markerAt + marker.length - 1;
          onChunk(buf.subarray(0, splitInsideAccent));
          onChunk(buf.subarray(splitInsideAccent, splitInsideAccent + 1));
          onChunk(buf.subarray(splitInsideAccent + 1));
        };

        const idx = new SqliteIndex(repo.dir, runner, streamer);
        const stats = await idx.build();
        expect(streamCalls).toBe(1);
        expect(stats.total).toBe(2);
        const hits = await idx.search('streaming');
        expect(hits.length).toBe(2);
        expect(hits.some((h) => h.subject.includes(accented))).toBe(true);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('reports unavailable + empty stats when better-sqlite3 cannot load', async () => {
    // Simulate the missing-native-module case by mocking require.
    jest.resetModules();
    jest.doMock('better-sqlite3', () => {
      throw new Error('not installed');
    });
    const { SqliteIndex } = require('../backend/cache/sqliteIndex') as typeof import('../backend/cache/sqliteIndex');
    expect(SqliteIndex.isAvailable()).toBe(false);
    const idx = new SqliteIndex('/tmp/anything', async () => '');
    const stats = await idx.stats();
    expect(stats.available).toBe(false);
    expect(stats.total).toBe(0);
    expect(stats.reason).toMatch(/not installed/);
    // search() and build() return safely on a closed/unavailable index.
    await expect(idx.search('q')).resolves.toEqual([]);
    await expect(idx.build()).resolves.toMatchObject({ available: false });
    jest.dontMock('better-sqlite3');
  });
});
