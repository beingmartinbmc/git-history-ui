import http from 'http';
import { AddressInfo } from 'net';
import { startServer } from '../backend/server';
import { makeRepo, type TestRepo } from './helpers/repo';

interface Json {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

function request(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<Json> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...opts.headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: unknown = data;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            /* leave as string */
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

function fetchRaw(
  url: string
): Promise<{ status: number; data: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, data, headers: res.headers }));
      })
      .on('error', reject);
  });
}

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
  });

  it('GET /api/index/stats returns availability + counts', async () => {
    const r = await request({ url: `${url}/api/index/stats` });
    expect(r.status).toBe(200);
    expect(typeof r.body.available).toBe('boolean');
  });

  it('POST /api/index/build builds the index when sqlite is available', async () => {
    const r = await request({ url: `${url}/api/index/build`, method: 'POST', body: {} });
    expect(r.status).toBe(200);
  });

  it('GET /api/commits/stream emits commit + done events', async () => {
    const raw = await fetchRaw(`${url}/api/commits/stream`);
    expect(raw.headers['content-type']).toContain('text/event-stream');
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

  it('annotations: empty body → 400; oversize body → 413', async () => {
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

  it('explain-commit requires AI provider', async () => {
    const r = await request({
      url: `${url}/api/explain-commit/${secondHash}`,
      method: 'POST',
      body: {}
    });
    expect(r.status).toBe(503);
  });

  it('POST /api/share echoes a deep link with view-state in the query', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: { hash: 'abc', mode: 'split', empty: '', null: null } }
    });
    expect(r.status).toBe(201);
    expect(r.body.url).toContain('hash=abc');
    expect(r.body.url).toContain('mode=split');
    expect(r.body.url).not.toContain('empty=');
    expect(r.body.url).not.toContain('null=');
    expect(r.body.mode).toBe('local');
  });

  it('POST /api/share rejects missing viewState', async () => {
    const r = await request({ url: `${url}/api/share`, method: 'POST', body: {} });
    expect(r.status).toBe(400);
  });

  it('500 errors are logged and surfaced as JSON', async () => {
    // Pass an invalid hash to force getCommit to throw a generic Error
    // (not NotARepositoryError → goes through the 500 branch).
    const r = await request({ url: `${url}/api/commit/zzzz` });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });
});

describe('HTTP server — empty repo path', () => {
  it('returns 400 with NotARepositoryError when run outside a repo', async () => {
    const dir = require('fs').mkdtempSync(
      require('path').join(require('os').tmpdir(), 'ghui-no-repo-')
    );
    try {
      const result = await startServer(0, '127.0.0.1', { cwd: dir });
      const addr = result.server.address() as AddressInfo;
      const r = await request({ url: `http://127.0.0.1:${addr.port}/api/commits` });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/Not a git repository/);

      // Streaming endpoint hits the same NotARepositoryError, but inside the
      // async iterator → covers the SSE error branch.
      const sse = await fetchRaw(`http://127.0.0.1:${addr.port}/api/commits/stream`);
      expect(sse.data).toContain('event: error');

      await result.close();
    } finally {
      require('fs').rmSync(dir, { recursive: true, force: true });
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
    // The cors middleware errors on disallowed origins → 500 via the error handler.
    expect(blocked.status).toBe(500);
  });
});

describe('HTTP server — AI endpoints (with stub provider)', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let hash: string;

  beforeAll(async () => {
    repo = makeRepo('ghui-ai-');
    hash = repo.commit('src/x.ts', 'export const x = 1;\n', 'feat: x');

    const stubLlm = {
      name: 'anthropic' as const,
      isAi: true,
      score: async () => [],
      summarize: async (text: string, opts?: { hint?: string }) =>
        `STUB(${(opts?.hint ?? '').slice(0, 16)}): ${text.length} chars`
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
  });

  it('explain-commit fetches the commit + diff and returns a summary', async () => {
    const r = await request({
      url: `${url}/api/explain-commit/${hash}`,
      method: 'POST',
      body: {}
    });
    expect(r.status).toBe(200);
    expect(r.body.summary).toContain('STUB');
  });
});
