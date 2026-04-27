import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import http from 'http';
import { startServer } from '../backend/server';

function git(repo: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Tester',
      GIT_AUTHOR_EMAIL: 'tester@example.com',
      GIT_COMMITTER_NAME: 'Tester',
      GIT_COMMITTER_EMAIL: 'tester@example.com'
    }
  });
}

function fetchJson(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode || 0, body: data });
          }
        });
      })
      .on('error', reject);
  });
}

describe('HTTP server', () => {
  let repo: string;
  let url: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'ghui-srv-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 'tester@example.com']);
    git(repo, ['config', 'user.name', 'Tester']);
    writeFileSync(path.join(repo, 'README.md'), 'hi\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'feat: hello']);

    const result = await startServer(0, '127.0.0.1', { cwd: repo });
    const addr = result.server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    rmSync(repo, { recursive: true, force: true });
  });

  it('exposes /api/health', async () => {
    const r = await fetchJson(`${url}/api/health`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('exposes /api/version', async () => {
    const r = await fetchJson(`${url}/api/version`);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('git-history-ui');
    expect(typeof r.body.version).toBe('string');
  });

  it('returns paginated commits', async () => {
    const r = await fetchJson(`${url}/api/commits?pageSize=5`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.commits[0].subject).toBe('feat: hello');
  });

  it('returns 404 for unknown API paths', async () => {
    const r = await fetchJson(`${url}/api/does-not-exist`);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Not Found');
  });

  it('returns the SPA index for non-API paths', async () => {
    const r = await fetchJson(`${url}/anything-else`);
    // Either the HTML index (200) or a fallback 404 if no static dir is present.
    expect([200, 404]).toContain(r.status);
  });
});
