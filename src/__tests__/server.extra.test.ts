import { AddressInfo } from 'net';
import { startServer } from '../backend/server';
import { fetchRaw, request, requestRaw } from './helpers/http';
import { makeRepo, type TestRepo } from './helpers/repo';
import { gitQueue, MAX_PENDING_GIT_JOBS } from '../backend/gitProcessQueue';

describe('HTTP server — full endpoint coverage', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let firstHash: string;
  let secondHash: string;

  beforeAll(async () => {
    repo = makeRepo('ghui-srv-extra-');
    firstHash = repo.commit('src/a.ts', "import './b';\nexport const a = 1;\n", 'feat: add a');
    secondHash = repo.commit('src/b.ts', 'export const b = 2;\n', 'fix: add b (#42)');
    repo.git(['tag', 'v1.0.0', secondHash]);
    repo.git(['branch', 'feature']);
    repo.git(['remote', 'add', 'origin', 'https://github.com/acme/x.git']);

    const result = await startServer(0, '127.0.0.1', {
      cwd: repo.dir,
      llm: { provider: 'heuristic' }
    });
    const addr = result.server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    repo.cleanup();
  });

  it('GET /api/commit/:hash returns the commit', async () => {
    const r = await request({ url: `${url}/api/commit/${firstHash}` });
    expect(r.status).toBe(200);
    expect(r.body.subject).toBe('feat: add a');
  });

  it('maps a saturated Git process queue to 503', async () => {
    const releases: Array<() => void> = [];
    const blocker = () => new Promise<void>((resolve) => releases.push(resolve));
    const active = Array.from({ length: 4 }, () => gitQueue.run(blocker));
    const pending = Array.from({ length: MAX_PENDING_GIT_JOBS }, () =>
      gitQueue.run(() => Promise.resolve())
    );
    try {
      const response = await request({ url: `${url}/api/commits` });
      expect(response.status).toBe(503);
      expect(response.body.error).toMatch(/queue is full/i);
    } finally {
      releases.forEach((release) => release());
      await Promise.all([...active, ...pending]);
    }
  });

  it('GET /api/diff/:hash returns parsed diff files', async () => {
    const r = await request({ url: `${url}/api/diff/${secondHash}` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body[0].file).toBe('src/b.ts');
  });

  it('GET /api/diff requires from & to', async () => {
    const r = await request({ url: `${url}/api/diff` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/from and to/);
  });

  it('GET /api/diff with range returns the diff', async () => {
    const r = await request({ url: `${url}/api/diff?from=${firstHash}&to=${secondHash}` });
    expect(r.status).toBe(200);
    expect(r.body[0].file).toBe('src/b.ts');
  });

  it('GET /api/search requires q', async () => {
    const r = await request({ url: `${url}/api/search` });
    expect(r.status).toBe(400);
  });

  it('GET /api/search returns parsedQuery + commits', async () => {
    const r = await request({ url: `${url}/api/search?q=add%20a` });
    expect(r.status).toBe(200);
    expect(r.body.parsedQuery).toBeTruthy();
    expect(typeof r.body.usedLlm).toBe('boolean');
  });

  it('GET /api/groups returns commit groups', async () => {
    const r = await request({ url: `${url}/api/groups` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    // squash-pattern (#42) should produce a PR group.
    const pr = r.body.find((g: any) => g.prNumber === 42);
    expect(pr).toBeTruthy();
  });

  it('GET /api/snapshot requires `at`', async () => {
    const r = await request({ url: `${url}/api/snapshot` });
    expect(r.status).toBe(400);
  });

  it('GET /api/snapshot returns refs at the moment', async () => {
    const r = await request({ url: `${url}/api/snapshot?at=2099-01-01` });
    expect(r.status).toBe(200);
    expect(r.body.ref).toMatch(/^[0-9a-f]+$/);
  });

  it('GET /api/file-stats requires file', async () => {
    const r = await request({ url: `${url}/api/file-stats` });
    expect(r.status).toBe(400);
  });

  it('GET /api/file-stats returns stats for a file', async () => {
    const r = await request({ url: `${url}/api/file-stats?file=src%2Fa.ts` });
    expect(r.status).toBe(200);
    expect(r.body.totalCommits).toBeGreaterThan(0);
  });

  it('GET /api/impact/:hash returns impact', async () => {
    const r = await request({ url: `${url}/api/impact/${firstHash}` });
    expect(r.status).toBe(200);
    expect(r.body.files).toContain('src/a.ts');
  });

  it('GET /api/breakage requires file', async () => {
    const r = await request({ url: `${url}/api/breakage` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/file/);
  });

  it('GET /api/breakage returns analysis for a file', async () => {
    const r = await request({ url: `${url}/api/breakage?file=src%2Fb.ts` });
    expect(r.status).toBe(200);
    expect(r.body.file).toBe('src/b.ts');
    expect(Array.isArray(r.body.commits)).toBe(true);
    expect(Array.isArray(r.body.fixCommits)).toBe(true);
    expect(Array.isArray(r.body.suspects)).toBe(true);
    expect(Array.isArray(r.body.coChangedFiles)).toBe(true);
    // The seeded "fix: add b (#42)" commit should be flagged.
    expect(r.body.fixCount).toBeGreaterThan(0);
    expect(typeof r.body.summary).toBe('string');
  });

  it('GET /api/insights returns aggregated insights', async () => {
    const r = await request({ url: `${url}/api/insights` });
    expect(r.status).toBe(200);
    expect(typeof r.body.totalCommits).toBe('number');
  });

  it('GET /api/blame requires file', async () => {
    const r = await request({ url: `${url}/api/blame` });
    expect(r.status).toBe(400);
  });

  it('GET /api/blame returns blame lines', async () => {
    const r = await request({ url: `${url}/api/blame?file=src%2Fa.ts` });
    expect(r.status).toBe(200);
    expect(r.body[0].author).toBe('Tester');
  });

  it('GET /api/tags / /api/branches / /api/authors return arrays', async () => {
    expect((await request({ url: `${url}/api/tags` })).body).toContain('v1.0.0');
    expect((await request({ url: `${url}/api/branches` })).body).toEqual(
      expect.arrayContaining(['main', 'feature'])
    );
    expect((await request({ url: `${url}/api/authors` })).body).toContain('Tester');
    expect((await request({ url: `${url}/api/authors/details` })).body).toContainEqual({
      name: 'Tester',
      email: 'tester@example.com'
    });
  });

  it('GET /api/index/stats returns availability + counts', async () => {
    const r = await request({ url: `${url}/api/index/stats` });
    expect(r.status).toBe(200);
    expect(typeof r.body.available).toBe('boolean');
  });

  it('POST /api/index/build starts the background index and wait=true waits for completion', async () => {
    const started = await request({ url: `${url}/api/index/build`, method: 'POST', body: {} });
    expect([200, 202]).toContain(started.status);
    expect(typeof started.body.running).toBe('boolean');
    expect(started.body.progress).toBeTruthy();

    const waited = await request({
      url: `${url}/api/index/build?wait=true`,
      method: 'POST',
      body: {}
    });
    expect(waited.status).toBe(200);
    expect(waited.body.running).toBe(false);
    expect(waited.body.progress.phase).toMatch(/done|idle|cancelled|error/);
  });

  it('falls back to Git immediately when the SQLite index is stale', async () => {
    const localRepo = makeRepo('ghui-srv-stale-');
    localRepo.commit('src/old.ts', 'export const old = true;\n', 'feat: old searchable');
    const local = await startServer(0, '127.0.0.1', {
      cwd: localRepo.dir,
      llm: { provider: 'heuristic' }
    });
    const localUrl = `http://127.0.0.1:${(local.server.address() as AddressInfo).port}`;
    try {
      const built = await request({
        url: `${localUrl}/api/index/build?wait=true`,
        method: 'POST',
        body: {}
      });
      if (!built.body.available) return;

      const hash = localRepo.commit(
        'src/fresh.ts',
        'export const fresh = true;\n',
        'feat: stale fallback needle'
      );
      const result = await request({
        url: `${localUrl}/api/search?q=stale%20fallback%20needle`
      });

      expect(result.status).toBe(200);
      expect(result.body.commits.map((commit: { hash: string }) => commit.hash)).toContain(hash);

      const rebuilt = await request({
        url: `${localUrl}/api/index/build?wait=true`,
        method: 'POST',
        body: {}
      });
      expect(rebuilt.body.progress.phase).toBe('done');
    } finally {
      await local.close();
      localRepo.cleanup();
    }
  });

  it('GET /api/index/status and cancel expose progress state', async () => {
    const status = await request({ url: `${url}/api/index/status` });
    expect(status.status).toBe(200);
    expect(status.body.progress).toHaveProperty('phase');

    const cancel = await request({ url: `${url}/api/index/cancel`, method: 'POST', body: {} });
    expect(cancel.status).toBe(200);
    expect(cancel.body.running).toBe(false);
  });

  it('POST /api/index/rebuild requests a forced rebuild', async () => {
    const r = await request({ url: `${url}/api/index/rebuild`, method: 'POST', body: {} });
    expect(r.status).toBe(202);
    expect(r.body.progress).toHaveProperty('phase');
    await request({ url: `${url}/api/index/cancel`, method: 'POST', body: {} });
  });

  it('GET /api/commits/stream emits commit + done events', async () => {
    const raw = await fetchRaw(`${url}/api/commits/stream`, { 'Accept-Encoding': 'gzip' });
    expect(raw.headers['content-type']).toContain('text/event-stream');
    expect(raw.headers['content-encoding']).toBeUndefined();
    expect(raw.data).toContain('event: commit');
    expect(raw.data).toContain('event: done');
  });

  it('GET /api/commits/stream is bounded by requested pageSize and reports total', async () => {
    const raw = await fetchRaw(`${url}/api/commits/stream?pageSize=1`);
    const commitEvents = raw.data.match(/event: commit/g) ?? [];
    expect(commitEvents).toHaveLength(1);
    expect(raw.data).toContain('"total":2');
    expect(raw.data).toContain('"pageSize":1');
    expect(raw.data).toContain('"hasNext":true');
  });

  it('GET /api/commits/stream clamps oversized pageSize', async () => {
    const raw = await fetchRaw(`${url}/api/commits/stream?pageSize=999999`);
    expect(raw.data).toContain('"pageSize":500');
  });

  it('GET /api/commits/stream returns exact totals for pages past the end', async () => {
    const raw = await fetchRaw(`${url}/api/commits/stream?page=999&pageSize=1`);
    const commitEvents = raw.data.match(/event: commit/g) ?? [];
    expect(commitEvents).toHaveLength(0);
    expect(raw.data).toContain('"total":2');
    expect(raw.data).toContain('"totalPages":2');
    expect(raw.data).toContain('"hasNext":false');
  });

  it('annotations CRUD: POST → GET → DELETE', async () => {
    const created = await request({
      url: `${url}/api/annotations/${secondHash}`,
      method: 'POST',
      body: { author: 'alice', body: 'looks good' }
    });
    expect(created.status).toBe(201);
    const list = await request({ url: `${url}/api/annotations/${secondHash}` });
    expect(list.status).toBe(200);
    expect(list.body[0].body).toBe('looks good');
    const del = await request({
      url: `${url}/api/annotations/${secondHash}/${created.body.id}`,
      method: 'DELETE'
    });
    expect(del.status).toBe(204);
    const after = await request({ url: `${url}/api/annotations/${secondHash}` });
    expect(after.body).toEqual([]);
  });

  it('annotations: empty body → 400; oversize body → 413; author is bounded', async () => {
    const r1 = await request({
      url: `${url}/api/annotations/${secondHash}`,
      method: 'POST',
      body: { author: 'a', body: '' }
    });
    expect(r1.status).toBe(400);
    const r2 = await request({
      url: `${url}/api/annotations/${secondHash}`,
      method: 'POST',
      body: { author: 'a', body: 'x'.repeat(6000) }
    });
    expect(r2.status).toBe(413);

    const r3 = await request({
      url: `${url}/api/annotations/${secondHash}`,
      method: 'POST',
      body: { author: `alice\n${'x'.repeat(200)}`, body: 'bounded author' }
    });
    expect(r3.status).toBe(201);
    expect(r3.body.author).not.toContain('\n');
    expect(r3.body.author.length).toBeLessThanOrEqual(80);
  });

  it('annotations DELETE for unknown id → 404', async () => {
    const r = await request({
      url: `${url}/api/annotations/${secondHash}/does-not-exist`,
      method: 'DELETE'
    });
    expect(r.status).toBe(404);
  });

  it('summarize-diff requires text + AI provider', async () => {
    const r1 = await request({
      url: `${url}/api/summarize-diff`,
      method: 'POST',
      body: {}
    });
    expect(r1.status).toBe(400);

    const r2 = await request({
      url: `${url}/api/summarize-diff`,
      method: 'POST',
      body: { text: 'some diff' }
    });
    expect(r2.status).toBe(503);
  });

  it('skips the AI rate limiter in heuristic mode', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 25 }, async () => {
        const response = await request({
          url: `${url}/api/summarize-diff`,
          method: 'POST',
          body: { text: 'some diff' }
        });
        return response.status;
      })
    );
    expect(statuses).not.toContain(429);
    expect(new Set(statuses)).toEqual(new Set([503]));
  });

  it('explain-commit requires AI provider', async () => {
    const r = await request({
      url: `${url}/api/explain-commit/${secondHash}`,
      method: 'POST',
      body: {}
    });
    expect(r.status).toBe(503);
  });

  it('POST /api/share returns an allowlisted portable deep link', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: { view: 'history', commit: firstHash, empty: '', null: null } }
    });
    expect(r.status).toBe(201);
    expect(r.body.url).toContain(`commit=${firstHash}`);
    expect(r.body.url).toContain('repo=https%3A%2F%2Fgithub.com%2Facme%2Fx');
    expect(r.body.url).not.toContain('empty=');
    expect(r.body.url).not.toContain('null=');
    expect(r.body.mode).toBe('portable');
  });

  it('POST /api/share never reflects server or Host headers', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      headers: { Host: 'evil.example' },
      body: { viewState: { view: 'history', commit: firstHash } }
    });
    expect(r.status).toBe(201);
    expect(r.body.url).not.toContain(url);
    expect(r.body.url).not.toContain('evil.example');
  });

  it('POST /api/share rejects missing or non-flat viewState', async () => {
    const missing = await request({ url: `${url}/api/share`, method: 'POST', body: {} });
    expect(missing.status).toBe(400);

    const array = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: ['abc'] }
    });
    expect(array.status).toBe(400);

    const nested = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: { filters: { author: 'alice' } } }
    });
    expect(nested.status).toBe(400);
  });

  it('invalid hash errors are surfaced as 400 JSON', async () => {
    const r = await request({ url: `${url}/api/commit/zzzz` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  it('malformed JSON is surfaced as a 400 instead of a 500', async () => {
    const r = await requestRaw({
      url: `${url}/api/share`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"viewState":'
    });
    expect(r.status).toBe(400);
  });
});

describe('HTTP server — empty repo path', () => {
  it('rejects startup outside a Git repository', async () => {
    const dir = require('fs').mkdtempSync(
      require('path').join(require('os').tmpdir(), 'ghui-no-repo-')
    );
    try {
      await expect(startServer(0, '127.0.0.1', { cwd: dir })).rejects.toThrow(
        'Not a git repository'
      );
    } finally {
      require('fs').rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('HTTP server — remote authentication', () => {
  it('fails closed for a non-loopback bind without a token', async () => {
    const repo = makeRepo('ghui-auth-bind-');
    repo.commit('a.txt', 'a', 'init');
    try {
      await expect(startServer(0, '0.0.0.0', { cwd: repo.dir })).rejects.toThrow(
        /token is required/
      );
    } finally {
      repo.cleanup();
    }
  });

  it('authenticates remote UI and API traffic without accepting query tokens', async () => {
    const repo = makeRepo('ghui-auth-');
    repo.commit('a.txt', 'a', 'init');
    const result = await startServer(0, '127.0.0.1', { cwd: repo.dir, authToken: 'secret' });
    const addr = result.server.address() as AddressInfo;
    const authUrl = `http://127.0.0.1:${addr.port}`;
    try {
      const unauthorized = await request({
        url: `${authUrl}/api/health`,
        headers: { 'X-Forwarded-For': '203.0.113.10' }
      });
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers['www-authenticate']).toContain('Basic');

      const queryToken = await request({
        url: `${authUrl}/api/health?token=secret`,
        headers: { 'X-Forwarded-For': '203.0.113.10' }
      });
      expect(queryToken.status).toBe(401);

      const wrongToken = await request({
        url: `${authUrl}/api/health`,
        headers: { 'X-Forwarded-For': '203.0.113.10', Authorization: 'Bearer wrong' }
      });
      expect(wrongToken.status).toBe(401);

      const bearer = await request({
        url: `${authUrl}/api/health`,
        headers: { 'X-Forwarded-For': '203.0.113.10', Authorization: 'Bearer secret' }
      });
      expect(bearer.status).toBe(200);

      const header = await request({
        url: `${authUrl}/api/health`,
        headers: { 'X-Forwarded-For': '203.0.113.10', 'X-Git-History-Token': 'secret' }
      });
      expect(header.status).toBe(200);

      const remoteUi = await request({
        url: authUrl,
        headers: { 'X-Forwarded-For': '203.0.113.10' }
      });
      expect(remoteUi.status).toBe(401);

      const basic = Buffer.from('ignored:secret').toString('base64');
      const authorizedUi = await request({
        url: authUrl,
        headers: { 'X-Forwarded-For': '203.0.113.10', Authorization: `Basic ${basic}` }
      });
      expect(authorizedUi.status).not.toBe(401);
    } finally {
      await result.close();
      repo.cleanup();
    }
  });
});

describe('HTTP server — CORS', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    repo = makeRepo('ghui-cors-');
    repo.commit('a.txt', 'a', 'init');
    const result = await startServer(0, '127.0.0.1', { cwd: repo.dir });
    url = `http://127.0.0.1:${(result.server.address() as AddressInfo).port}`;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    repo.cleanup();
  });

  it('allows localhost origins and rejects others', async () => {
    const allowed = await request({
      url: `${url}/api/health`,
      headers: { Origin: 'http://localhost:4200' }
    });
    expect(allowed.status).toBe(200);

    const blocked = await request({
      url: `${url}/api/health`,
      headers: { Origin: 'https://evil.example.com' }
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('CORS not allowed');
  });

  it('neutralizes spreadsheet formulas in exported author, email, and subject cells', async () => {
    const localRepo = makeRepo('ghui-csv-formula-');
    localRepo.commit('safe.txt', 'safe', 'safe base');
    localRepo.git([
      'commit',
      '--allow-empty',
      '--author',
      '=CMD <+formula@example.com>',
      '-m',
      '@SUM(A1:A2)'
    ]);
    const local = await startServer(0, '127.0.0.1', {
      cwd: localRepo.dir,
      llm: { provider: 'heuristic' }
    });
    const localUrl = `http://127.0.0.1:${(local.server.address() as AddressInfo).port}`;
    try {
      const csv = await fetchRaw(`${localUrl}/api/export/commits?format=csv`);
      expect(csv.data).toContain("'=CMD");
      expect(csv.data).toContain("'+formula@example.com");
      expect(csv.data).toContain("'@SUM(A1:A2)");
    } finally {
      await local.close();
      localRepo.cleanup();
    }
  });
});

describe('HTTP server — AI endpoints (with stub provider)', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let hash: string;
  let lastSummarySignal: AbortSignal | undefined;

  beforeAll(async () => {
    repo = makeRepo('ghui-ai-');
    hash = repo.commit('src/x.ts', 'export const x = 1;\n', 'feat: x');

    const stubLlm = {
      name: 'anthropic' as const,
      isAi: true,
      score: async () => [],
      summarize: async (
        text: string,
        opts?: { hint?: string; maxTokens?: number; signal?: AbortSignal }
      ) => {
        lastSummarySignal = opts?.signal;
        return `STUB(${(opts?.hint ?? '').slice(0, 16)}): ${text.length} chars`;
      }
    };

    const result = await startServer(0, '127.0.0.1', { cwd: repo.dir, llmService: stubLlm });
    url = `http://127.0.0.1:${(result.server.address() as AddressInfo).port}`;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    repo.cleanup();
  });

  it('summarize-diff returns the stub summary + provider name', async () => {
    const r = await request({
      url: `${url}/api/summarize-diff`,
      method: 'POST',
      body: { text: 'a sample diff' }
    });
    expect(r.status).toBe(200);
    expect(r.body.provider).toBe('anthropic');
    expect(r.body.summary).toContain('STUB');
    expect(lastSummarySignal).toBeDefined();
  });

  it('explain-commit fetches the commit + diff and returns a summary', async () => {
    const r = await request({
      url: `${url}/api/explain-commit/${hash}`,
      method: 'POST',
      body: {}
    });
    expect(r.status).toBe(200);
    expect(r.body.summary).toContain('STUB');
    expect(lastSummarySignal).toBeDefined();
  });

  it('rate limits AI-backed endpoints without waiting for a timer window', async () => {
    let status = 200;
    for (let i = 0; i < 30 && status !== 429; i++) {
      status = (
        await request({
          url: `${url}/api/summarize-diff`,
          method: 'POST',
          body: { text: `diff ${i}` }
        })
      ).status;
    }
    expect(status).toBe(429);
  });
});
