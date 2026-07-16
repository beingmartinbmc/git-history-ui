import { SqliteIndex } from '../backend/cache/sqliteIndex';
import { withTempHomeAsync, makeRepo } from './helpers/repo';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

const fakeLog = (
  rows: Array<{
    hash: string;
    short: string;
    author: string;
    email: string;
    date: string;
    parents: string;
    subject: string;
    body: string;
  }>
): string =>
  rows
    .map((r) =>
      [r.hash, r.short, r.author, r.email, r.date, r.parents, r.subject, r.body].join(FIELD_SEP)
    )
    .join(RECORD_SEP) + RECORD_SEP;

const sampleRows = [
  {
    hash: 'a'.repeat(40),
    short: 'aaaaaaa',
    author: 'Alice',
    email: 'alice@example.com',
    date: '2026-01-31T23:45:00Z',
    parents: '',
    subject: 'feat: implement login flow',
    body: 'full login implementation with tests'
  },
  {
    hash: 'b'.repeat(40),
    short: 'bbbbbbb',
    author: 'Bob',
    email: 'bob@example.com',
    date: '2026-02-01T14:00:00Z',
    parents: 'a'.repeat(40),
    subject: 'fix: payment rounding issue',
    body: 'corrected float precision in checkout'
  },
  {
    hash: 'c'.repeat(40),
    short: 'ccccccc',
    author: 'Alice',
    email: 'alice@example.com',
    date: '2026-03-10T09:00:00Z',
    parents: 'b'.repeat(40),
    subject: 'chore: cleanup utils',
    body: ''
  }
];

describe('SqliteIndex — search, searchCount, filters and invalidate (static import)', () => {
  if (!SqliteIndex.isAvailable()) {
    it('requires better-sqlite3 on the primary Ubuntu Node 20 CI lane', () => {
      const primaryCiLane =
        process.env.CI === 'true' &&
        process.platform === 'linux' &&
        process.versions.node.startsWith('20.');
      if (primaryCiLane) {
        throw new Error('better-sqlite3 must be available on the primary Ubuntu Node 20 CI lane');
      }
    });
    return;
  }

  it('search with author filter returns matching commits', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'head1\n';
          if (args[0] === 'log') return fakeLog(sampleRows);
          if (args[0] === 'for-each-ref') return '';
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();

        const hits = await idx.search('login', 50, { author: 'Alice' });
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].author).toBe('Alice');

        const noHits = await idx.search('login', 50, { author: 'Carol' });
        expect(noHits.length).toBe(0);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('search with since/until filters narrows results', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'head1\n';
          if (args[0] === 'log') return fakeLog(sampleRows);
          if (args[0] === 'for-each-ref') return '';
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();

        const hits = await idx.search('', 50, { since: '2026-02-01' });
        expect(hits.every((h) => h.date >= '2026-02-01')).toBe(true);

        const jan = await idx.search('', 50, { until: '2026-01-31' });
        expect(jan.map((h) => h.hash)).toEqual(['a'.repeat(40)]);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('searchCount returns accurate total with filters', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'head1\n';
          if (args[0] === 'log') return fakeLog(sampleRows);
          if (args[0] === 'for-each-ref') return '';
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();

        const totalAll = await idx.searchCount('login');
        expect(totalAll).toBe(1);

        const totalFiltered = await idx.searchCount('login', { author: 'Bob' });
        expect(totalFiltered).toBe(0);

        const totalAlice = await idx.searchCount('login', { author: 'Alice' });
        expect(totalAlice).toBe(1);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('search with offset/limit for pagination', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'head1\n';
          if (args[0] === 'log') return fakeLog(sampleRows);
          if (args[0] === 'for-each-ref') return '';
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();

        const all = await idx.search('', 50, {}, 0);
        expect(all.length).toBe(3);

        const page1 = await idx.search('', 1, {}, 0);
        expect(page1.length).toBe(1);

        const page2 = await idx.search('', 1, {}, 1);
        expect(page2.length).toBe(1);
        expect(page2[0].hash).not.toBe(page1[0].hash);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('invalidate forces rebuild on next build call', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        let buildCount = 0;
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'samehead\n';
          if (args[0] === 'for-each-ref') return '';
          if (args[0] === 'log') {
            buildCount++;
            return fakeLog(sampleRows);
          }
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();
        expect(buildCount).toBe(1);

        await idx.build();
        expect(buildCount).toBe(1);

        idx.invalidate();
        await idx.build();
        expect(buildCount).toBe(2);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('getProgress reports progress phases', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'h\n';
          if (args[0] === 'for-each-ref') return '';
          if (args[0] === 'log') return fakeLog(sampleRows);
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);

        const before = idx.getProgress();
        expect(before.phase).toBe('idle');

        await idx.build();
        const after = idx.getProgress();
        expect(after.phase).toBe('done');
        expect(after.indexed).toBe(3);
        expect(after.message).toContain('ready');
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('search returns rowToCommit with proper fields', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'h\n';
          if (args[0] === 'for-each-ref') return '';
          if (args[0] === 'log') return fakeLog(sampleRows);
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await idx.build();

        const hits = await idx.search('payment', 5);
        expect(hits.length).toBe(1);
        const hit = hits[0];
        expect(hit.hash).toBe('b'.repeat(40));
        expect(hit.shortHash).toBe('bbbbbbb');
        expect(hit.author).toBe('Bob');
        expect(hit.authorEmail).toBe('bob@example.com');
        expect(hit.date).toBe('2026-02-01T14:00:00Z');
        expect(hit.subject).toBe('fix: payment rounding issue');
        expect(hit.parents).toEqual(['a'.repeat(40)]);
        expect(hit.isMerge).toBe(false);
        expect(hit.body).toContain('float precision');
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('build handles abort signal by marking progress as cancelled', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const controller = new AbortController();
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'h\n';
          if (args[0] === 'for-each-ref') return '';
          if (args[0] === 'log') {
            controller.abort();
            throw new Error('aborted');
          }
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        await expect(idx.build({ signal: controller.signal })).rejects.toThrow();
        const progress = idx.getProgress();
        expect(progress.phase).toBe('cancelled');
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('stats returns total and builtAt after build', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'h\n';
          if (args[0] === 'for-each-ref') return '';
          if (args[0] === 'log') return fakeLog(sampleRows);
          return '';
        };
        const idx = new SqliteIndex(repo.dir, runner);
        const statsBefore = await idx.stats();
        expect(statsBefore.available).toBe(true);
        expect(statsBefore.total).toBe(0);

        await idx.build();
        const statsAfter = await idx.stats();
        expect(statsAfter.total).toBe(3);
        expect(statsAfter.builtAt).not.toBeNull();
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('open and close and isOpen work correctly', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        const idx = new SqliteIndex(repo.dir, async () => '');
        expect(idx.open()).toBe(true);
        expect(idx.isOpen()).toBe(true);
        idx.close();
        expect(idx.isOpen()).toBe(false);
        // Can reopen
        expect(idx.open()).toBe(true);
        expect(idx.isOpen()).toBe(true);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });

  it('uses streaming runner with multi-byte UTF-8 split across chunks', async () => {
    await withTempHomeAsync(async () => {
      const repo = makeRepo();
      try {
        repo.commit('a.txt', 'a', 'init');
        const accented = 'caf\u00e9';
        const buffered = fakeLog([
          {
            hash: 'x'.repeat(40),
            short: 'xxxxxxx',
            author: 'alice',
            email: 'a@x.com',
            date: '2026-04-01T00:00:00Z',
            parents: '',
            subject: `feat: ${accented} streaming`,
            body: 'body'
          }
        ]);

        const runner = async (args: string[]): Promise<string> => {
          if (args[0] === 'rev-parse') return 'streamhead\n';
          if (args[0] === 'for-each-ref') return '';
          return '';
        };

        let streamCalls = 0;
        const streamer = async (_args: string[], onChunk: (c: Buffer) => void): Promise<void> => {
          streamCalls++;
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
        expect(stats.total).toBe(1);
        const hits = await idx.search('streaming');
        expect(hits.length).toBe(1);
        expect(hits[0].subject).toContain(accented);
        idx.close();
      } finally {
        repo.cleanup();
      }
    });
  });
});
