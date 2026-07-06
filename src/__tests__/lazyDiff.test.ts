import http from 'http';
import { AddressInfo } from 'net';
import { writeFileSync } from 'fs';
import path from 'path';
import { startServer } from '../backend/server';
import { makeRepo, type TestRepo } from './helpers/repo';

interface Json {
  status: number;
  body: any;
}

function get(url: string): Promise<Json> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: unknown = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            /* raw */
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Lazy diff endpoints', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  let hash: string;

  beforeAll(async () => {
    repo = makeRepo('ghui-lazydiff-');
    repo.commit('file-a.ts', 'export const a = 1;\n', 'initial A');

    // Create a multi-file commit using git helpers directly
    writeFileSync(path.join(repo.dir, 'file-a.ts'), 'export const a = 11;\n');
    writeFileSync(path.join(repo.dir, 'file-b.ts'), 'export const b = 2;\n');
    repo.git(['add', '-A']);
    repo.git(['commit', '-q', '-m', 'multi-file change']);
    hash = repo.git(['rev-parse', 'HEAD']).trim();

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

  it('GET /api/diff/:hash/files returns file metadata without full diff text', async () => {
    const r = await get(`${url}/api/diff/${hash}/files`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.files)).toBe(true);
    expect(r.body.files.length).toBe(2);
    expect(typeof r.body.totalLines).toBe('number');
    expect(typeof r.body.isLarge).toBe('boolean');
    for (const f of r.body.files) {
      expect(f.file).toBeDefined();
      expect(typeof f.additions).toBe('number');
      expect(typeof f.deletions).toBe('number');
      expect(f.changes).toBeUndefined();
    }
  });

  it('GET /api/diff/:hash/file?path=... returns diff for a single file', async () => {
    const r = await get(`${url}/api/diff/${hash}/file?path=file-a.ts`);
    expect(r.status).toBe(200);
    expect(r.body.file).toBe('file-a.ts');
    expect(typeof r.body.changes).toBe('string');
    expect(r.body.changes).toContain('const a');
  });

  it('GET /api/diff/:hash/file without path returns 400', async () => {
    const r = await get(`${url}/api/diff/${hash}/file`);
    expect(r.status).toBe(400);
  });
});
