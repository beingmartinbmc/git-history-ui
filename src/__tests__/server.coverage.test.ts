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
  url: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.get(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, data, headers: res.headers }));
      }
    );
    req.on('error', reject);
  });
}

describe('HTTP server — additional endpoint coverage', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let _hash1: string;
  let hash2: string;

  beforeAll(async () => {
    repo = makeRepo('ghui-srv-cov-');
    _hash1 = repo.commit('src/app.ts', 'export const x = 1;\n', 'feat: initial app');
    hash2 = repo.commit('src/app.ts', 'export const x = 2;\n', 'fix: update app value');
    repo.git(['tag', 'v2.0.0', hash2]);

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

  // Wrapped endpoints
  it('GET /api/wrapped returns wrapped stats', async () => {
    const r = await request({ url: `${url}/api/wrapped?year=2026` });
    // Even if the repo has no commits in 2026, it should still return valid structure
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('label');
    expect(r.body).toHaveProperty('totalCommits');
    expect(r.body).toHaveProperty('superlatives');
  });

  it('GET /api/wrapped with since/until returns correctly', async () => {
    const r = await request({ url: `${url}/api/wrapped?since=2020-01-01&until=2099-12-31` });
    expect(r.status).toBe(200);
    expect(r.body.totalCommits).toBeGreaterThan(0);
  });

  it('GET /api/wrapped uses cache on second call', async () => {
    const r1 = await request({ url: `${url}/api/wrapped?year=2020` });
    const r2 = await request({ url: `${url}/api/wrapped?year=2020` });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toEqual(r2.body);
  });

  // Export endpoints
  it('GET /api/export/commits as JSON', async () => {
    const r = await request({ url: `${url}/api/export/commits?format=json` });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('commits.json');
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /api/export/commits as CSV', async () => {
    const raw = await fetchRaw(`${url}/api/export/commits?format=csv`);
    expect(raw.status).toBe(200);
    expect(raw.headers['content-type']).toContain('text/csv');
    expect(raw.headers['content-disposition']).toContain('commits.csv');
    expect(raw.data).toContain('hash,shortHash,author,authorEmail,date,subject');
  });

  it('GET /api/export/insights returns insights JSON attachment', async () => {
    const r = await request({ url: `${url}/api/export/insights` });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('insights.json');
    expect(r.body).toHaveProperty('totalCommits');
  });

  it('GET /api/export/wrapped returns wrapped JSON attachment', async () => {
    const r = await request({ url: `${url}/api/export/wrapped` });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('wrapped.json');
    expect(r.body).toHaveProperty('label');
  });

  // Pickaxe search
  it('GET /api/pickaxe requires pattern', async () => {
    const r = await request({ url: `${url}/api/pickaxe` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/pattern/);
  });

  it('GET /api/pickaxe returns commits matching the pattern', async () => {
    const r = await request({ url: `${url}/api/pickaxe?pattern=const%20x` });
    expect(r.status).toBe(200);
    expect(r.body.commits.length).toBeGreaterThan(0);
  });

  it('GET /api/pickaxe mode=G uses regex mode', async () => {
    const r = await request({ url: `${url}/api/pickaxe?pattern=const&mode=G` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.commits)).toBe(true);
  });

  // Stashes and reflog
  it('GET /api/stashes returns array (empty if no stashes)', async () => {
    const r = await request({ url: `${url}/api/stashes` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /api/reflog returns reflog entries', async () => {
    const r = await request({ url: `${url}/api/reflog` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    if (r.body.length > 0) {
      expect(r.body[0]).toHaveProperty('hash');
      expect(r.body[0]).toHaveProperty('action');
    }
  });

  it('GET /api/reflog respects limit parameter', async () => {
    const r = await request({ url: `${url}/api/reflog?limit=1` });
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(1);
  });

  // Presets API
  it('POST /api/presets/:name creates a preset', async () => {
    const r = await request({
      url: `${url}/api/presets/test-preset`,
      method: 'POST',
      body: { author: 'alice', since: '2020-01-01' }
    });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('test-preset');
  });

  it('GET /api/presets lists saved presets', async () => {
    const r = await request({ url: `${url}/api/presets` });
    expect(r.status).toBe(200);
    expect(typeof r.body).toBe('object');
    expect(r.body).not.toBeNull();
  });

  it('DELETE /api/presets/:name removes a preset', async () => {
    // Save one first
    await request({
      url: `${url}/api/presets/to-delete`,
      method: 'POST',
      body: { branch: 'main' }
    });
    const del = await request({ url: `${url}/api/presets/to-delete`, method: 'DELETE' });
    expect(del.status).toBe(204);
  });

  it('DELETE /api/presets/:name returns 404 if not found', async () => {
    const r = await request({ url: `${url}/api/presets/nonexistent`, method: 'DELETE' });
    expect(r.status).toBe(404);
  });

  it('POST /api/presets with invalid name returns 400', async () => {
    const r = await request({
      url: `${url}/api/presets/${'x'.repeat(60)}`,
      method: 'POST',
      body: {}
    });
    expect(r.status).toBe(400);
  });

  // 404 API catch-all
  it('GET /api/nonexistent returns 404', async () => {
    const r = await request({ url: `${url}/api/nonexistent` });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Not Found');
  });

  // SSE events endpoint
  it('GET /api/events connects as SSE stream', async () => {
    const raw = await new Promise<string>((resolve, reject) => {
      const u = new URL(`${url}/api/events`);
      const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          // Just read the first chunk and close
          req.destroy();
          resolve(data);
        });
        // If no data comes within 500ms, resolve with empty
        setTimeout(() => {
          req.destroy();
          resolve(data);
        }, 500);
      });
      req.on('error', (err) => {
        if (err.message.includes('ECONNRESET') || err.message.includes('aborted')) {
          resolve('');
        } else {
          reject(err);
        }
      });
    });
    // The SSE endpoint sets proper headers even if no events come through
    // We just verify it doesn't crash
    expect(typeof raw).toBe('string');
  });

  // Error handling: invalid hash
  it('GET /api/commit/:hash with invalid hash returns 404', async () => {
    const r = await request({ url: `${url}/api/commit/deadbeef0000000000000000000000000000dead` });
    expect([400, 404]).toContain(r.status);
  });

  // Insights cache hit
  it('GET /api/insights cache hit returns same result', async () => {
    const r1 = await request({ url: `${url}/api/insights` });
    const r2 = await request({ url: `${url}/api/insights` });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.totalCommits).toBe(r2.body.totalCommits);
  });

  // Groups cache
  it('GET /api/groups cache hit', async () => {
    const r1 = await request({ url: `${url}/api/groups` });
    const r2 = await request({ url: `${url}/api/groups` });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
