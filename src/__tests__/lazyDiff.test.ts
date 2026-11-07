import { AddressInfo } from 'net';
import { writeFileSync } from 'fs';
import path from 'path';
import { startServer } from '../backend/server';
import { request } from './helpers/http';
import { makeRepo, type TestRepo } from './helpers/repo';

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
    const r = await request({ url: `${url}/api/diff/${hash}/files` });
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
    const r = await request({ url: `${url}/api/diff/${hash}/file?path=file-a.ts` });
    expect(r.status).toBe(200);
    expect(r.body.file).toBe('file-a.ts');
    expect(typeof r.body.changes).toBe('string');
    expect(r.body.changes).toContain('const a');
  });

  it('GET /api/diff/:hash/file without path returns 400', async () => {
    const r = await request({ url: `${url}/api/diff/${hash}/file` });
    expect(r.status).toBe(400);
  });

  describe('range diff', () => {
    const parent = () => repo.git(['rev-parse', `${hash}~1`]).trim();
    const q = (from: string, to: string, extra = '') =>
      `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extra}`;

    it('lists changed files without patch bodies, then fetches one file', async () => {
      const files = await request({ url: `${url}/api/range-diff/files?${q(parent(), hash)}` });
      expect(files.status).toBe(200);
      expect(files.body.files.map((f: { file: string }) => f.file).sort()).toEqual([
        'file-a.ts',
        'file-b.ts'
      ]);
      expect(files.body.files.every((f: { changes?: string }) => f.changes === undefined)).toBe(
        true
      );
      expect(files.body.isLarge).toBe(false);

      const one = await request({
        url: `${url}/api/range-diff/file?${q(parent(), hash, '&path=file-a.ts')}`
      });
      expect(one.status).toBe(200);
      expect(one.body.file).toBe('file-a.ts');
      expect(one.body.changes).toContain('const a = 11');
      expect(one.body.changes).not.toContain('const b');
    });

    it('returns a renamed file as a rename, not a fresh add', async () => {
      repo.git(['mv', 'file-b.ts', 'file-c.ts']);
      writeFileSync(path.join(repo.dir, 'file-c.ts'), 'export const b = 2;\nexport const c = 3;\n');
      repo.git(['add', '-A']);
      repo.git(['commit', '-q', '-m', 'rename b to c']);
      const head = repo.git(['rev-parse', 'HEAD']).trim();

      const files = await request({ url: `${url}/api/range-diff/files?${q(hash, head)}` });
      expect(files.body.files).toEqual([
        expect.objectContaining({ file: 'file-c.ts', oldFile: 'file-b.ts', status: 'renamed' })
      ]);
      const one = await request({
        url: `${url}/api/range-diff/file?${q(hash, head, '&path=file-c.ts')}`
      });
      expect(one.status).toBe(200);
      expect(one.body.changes).toContain('+export const c = 3;');
      expect(one.body.changes).not.toContain('+export const b = 2;'); // unchanged line, not re-added
    });

    it('validates input', async () => {
      expect((await request({ url: `${url}/api/range-diff/files?from=main` })).status).toBe(400);
      expect(
        (await request({ url: `${url}/api/range-diff/file?${q(parent(), hash)}` })).status
      ).toBe(400);
      expect(
        (
          await request({
            url: `${url}/api/range-diff/file?${q(parent(), hash, '&path=nope.ts')}`
          })
        ).status
      ).toBe(404);
      const unsafe = await request({
        url: `${url}/api/range-diff/files?${q('--output=x', 'HEAD')}`
      });
      expect(unsafe.status).toBeGreaterThanOrEqual(400);
      expect(unsafe.status).toBeLessThan(500);
    });
  });
});
