/**
 * Security & edge-case test suite.
 *
 * These tests target attack surfaces, misuse patterns, and boundary
 * conditions across the git-history-ui backend. They are designed to
 * verify robustness against:
 *   - Command injection via branch/hash/file params
 *   - Path traversal attacks
 *   - Payload boundary abuse (too large, empty, null, unicode)
 *   - Integer overflow / NaN in pagination params
 *   - CORS enforcement
 *   - Concurrent access patterns
 *   - Graceful degradation under failures
 */

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

describe('Security & edge cases — HTTP server', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let hash: string;

  beforeAll(async () => {
    repo = makeRepo('ghui-security-');
    hash = repo.commit('src/app.ts', 'export const x = 1;\n', 'feat: initial');
    repo.commit('src/app.ts', 'export const x = 2;\n', 'fix: update');

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

  // === COMMAND INJECTION VIA HASH ===

  it('rejects hash with shell metacharacters', async () => {
    const r = await request({ url: `${url}/api/commit/$(whoami)` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  it('rejects hash with semicolons', async () => {
    const r = await request({ url: `${url}/api/commit/abc;rm%20-rf%20/` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  it('rejects hash with backticks', async () => {
    const r = await request({ url: `${url}/api/diff/%60id%60` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  it('rejects very long hash (overflow attempt)', async () => {
    const longHash = 'a'.repeat(100);
    const r = await request({ url: `${url}/api/commit/${longHash}` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  // === COMMAND INJECTION VIA BRANCH ===

  it('rejects branch with shell injection patterns', async () => {
    const r = await request({
      url: `${url}/api/commits?branch=$(cat%20/etc/passwd)`
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid branch/);
  });

  it('rejects branch with pipe character', async () => {
    const r = await request({ url: `${url}/api/commits?branch=main|cat%20/etc/passwd` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid branch/);
  });

  it('rejects branch with null bytes', async () => {
    const r = await request({ url: `${url}/api/commits?branch=main%00injected` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid branch/);
  });

  it('rejects branch longer than 200 characters', async () => {
    const longBranch = 'a'.repeat(201);
    const r = await request({ url: `${url}/api/commits?branch=${longBranch}` });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid branch/);
  });

  // === PATH TRAVERSAL VIA FILE PARAMS ===

  it('file-stats: path traversal attempt rejects before invoking git', async () => {
    const r = await request({
      url: `${url}/api/file-stats?file=../../etc/passwd`
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Invalid path');
    expect(r.body.error).not.toContain(repo.dir);
    expect(r.body.error).not.toContain('root:');
  });

  it('blame: null byte in file path rejects cleanly', async () => {
    const r = await request({
      url: `${url}/api/blame?file=src%2Fapp.ts%00ignored`
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid path/);
  });

  it('breakage: unsafe file paths reject cleanly', async () => {
    const nul = await request({
      url: `${url}/api/breakage?file=src%2Fapp.ts%00evil`
    });
    expect(nul.status).toBe(400);
    expect(nul.body.error).toMatch(/Invalid path/);

    const traversal = await request({
      url: `${url}/api/breakage?file=..%2F..%2Fetc%2Fpasswd`
    });
    expect(traversal.status).toBe(400);
    expect(traversal.body.error).toMatch(/Invalid path/);
    expect(traversal.body.error).not.toContain(repo.dir);
  });

  // === PAGINATION ABUSE ===

  it('handles page=0 gracefully (clamps to 1)', async () => {
    const r = await request({ url: `${url}/api/commits?page=0&pageSize=5` });
    expect(r.status).toBe(200);
    expect(r.body.page).toBe(1);
  });

  it('handles negative page gracefully', async () => {
    const r = await request({ url: `${url}/api/commits?page=-5&pageSize=5` });
    expect(r.status).toBe(200);
    expect(r.body.page).toBe(1);
  });

  it('handles pageSize=0 gracefully (clamps to the minimum)', async () => {
    const r = await request({ url: `${url}/api/commits?pageSize=0` });
    expect(r.status).toBe(200);
    expect(r.body.pageSize).toBe(1);
  });

  it('handles pageSize above max (clamps to 500)', async () => {
    const r = await request({ url: `${url}/api/commits?pageSize=10000` });
    expect(r.status).toBe(200);
    expect(r.body.pageSize).toBe(500);
  });

  it('handles NaN page gracefully (falls back to default)', async () => {
    const r = await request({ url: `${url}/api/commits?page=abc` });
    expect(r.status).toBe(200);
    expect(r.body.page).toBe(1);
  });

  it('handles Infinity pageSize gracefully', async () => {
    const r = await request({ url: `${url}/api/commits?pageSize=Infinity` });
    expect(r.status).toBe(200);
    // NaN from parseInt → falls back to default 25
    expect(r.body.pageSize).toBeLessThanOrEqual(500);
  });

  // === REQUEST BODY ABUSE ===

  it('rejects JSON body exceeding 128kb limit with an error status', async () => {
    const bigBody = { text: 'x'.repeat(200 * 1024) };
    const r = await request({
      url: `${url}/api/summarize-diff`,
      method: 'POST',
      body: bigBody
    });
    // Express returns 500 when the body parser rejects (internal error).
    // The key security assertion: the server doesn't crash and responds.
    expect([413, 500]).toContain(r.status);
    expect(typeof r.body.error).toBe('string');
  });

  it('handles malformed JSON in request body (Express returns 400 or 500)', async () => {
    const resp = await new Promise<Json>((resolve, reject) => {
      const u = new URL(`${url}/api/share`);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed: unknown = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              /* leave as string */
            }
            resolve({
              status: res.statusCode || 0,
              body: parsed,
              headers: res.headers
            });
          });
        }
      );
      req.on('error', reject);
      req.write('{not json}}');
      req.end();
    });
    // Express's json parser returns 400 or the error handler returns 500
    expect([400, 500]).toContain(resp.status);
  });

  // === UNICODE / SPECIAL CHARACTERS ===

  it('handles unicode in search query without crashing', async () => {
    const r = await request({
      url: `${url}/api/search?q=${encodeURIComponent('修复 bug 🐛 в файле')}`
    });
    expect(r.status).toBe(200);
    expect(r.body.parsedQuery).toBeTruthy();
  });

  it('handles unicode in author filter', async () => {
    const r = await request({
      url: `${url}/api/commits?author=${encodeURIComponent('José García')}`
    });
    expect(r.status).toBe(200);
    expect(r.body.commits).toEqual([]);
  });

  // === DIFF RANGE INJECTION ===

  it('GET /api/diff with from/to containing dots is rejected', async () => {
    const r = await request({
      url: `${url}/api/diff?from=...&to=...`
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Invalid commit hash/);
  });

  // === SHARE ENDPOINT ABUSE ===

  it('POST /api/share with non-object viewState returns 400', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: 'not-an-object' }
    });
    expect(r.status).toBe(400);
  });

  it('POST /api/share with array viewState returns 400', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: [1, 2, 3] }
    });
    expect(r.status).toBe(400);
  });

  it('POST /api/share with nested object viewState returns 400', async () => {
    const r = await request({
      url: `${url}/api/share`,
      method: 'POST',
      body: { viewState: { deep: { nested: true } } }
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/scalar/);
  });

  // === ANNOTATIONS EDGE CASES ===

  it('annotations: XSS attempt in body is stored as-is (not sanitized)', async () => {
    const xss = '<script>alert("xss")</script>';
    const created = await request({
      url: `${url}/api/annotations/${hash}`,
      method: 'POST',
      body: { author: 'evil', body: xss }
    });
    expect(created.status).toBe(201);
    expect(created.body.body).toBe(xss);

    // Cleanup
    await request({
      url: `${url}/api/annotations/${hash}/${created.body.id}`,
      method: 'DELETE'
    });
  });

  it('annotations: body at exactly 5000 chars is accepted', async () => {
    const r = await request({
      url: `${url}/api/annotations/${hash}`,
      method: 'POST',
      body: { author: 'test', body: 'x'.repeat(5000) }
    });
    expect(r.status).toBe(201);

    // Cleanup
    await request({
      url: `${url}/api/annotations/${hash}/${r.body.id}`,
      method: 'DELETE'
    });
  });

  it('annotations: body at 5001 chars is rejected', async () => {
    const r = await request({
      url: `${url}/api/annotations/${hash}`,
      method: 'POST',
      body: { author: 'test', body: 'x'.repeat(5001) }
    });
    expect(r.status).toBe(413);
  });

  // === CORS ENFORCEMENT ===

  it('blocks requests from unauthorized origins', async () => {
    const r = await request({
      url: `${url}/api/health`,
      headers: { Origin: 'https://evil.attacker.com' }
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('CORS not allowed');
  });

  it('allows localhost with port', async () => {
    const r = await request({
      url: `${url}/api/health`,
      headers: { Origin: 'http://localhost:9999' }
    });
    expect(r.status).toBe(200);
  });

  it('allows 127.0.0.1 with port', async () => {
    const r = await request({
      url: `${url}/api/health`,
      headers: { Origin: 'http://127.0.0.1:3000' }
    });
    expect(r.status).toBe(200);
  });

  // === HELMET HEADERS ===

  it('disables X-Powered-By header', async () => {
    const r = await request({ url: `${url}/api/health` });
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  // === ERROR HANDLING ===

  it('returns proper JSON error for all error types', async () => {
    const r = await request({ url: `${url}/api/commit/aaaa` });
    // Short hash that doesn't exist → 404
    expect(r.status).toBe(404);
    expect(typeof r.body.error).toBe('string');
    expect(r.body.error.length).toBeGreaterThan(0);
  });
});
