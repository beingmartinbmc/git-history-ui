import type { AddressInfo } from 'net';
import { startServer } from '../backend/server';
import { request } from './helpers/http';
import { makeRepo, type TestRepo } from './helpers/repo';

describe('rename-aware paginated file history', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;
  const hashes: string[] = [];

  beforeAll(async () => {
    repo = makeRepo('ghui-filehist-');
    hashes.push(repo.commit('old.txt', 'one\n', 'create old'));
    hashes.push(repo.commit('old.txt', 'one\ntwo\n', 'edit old'));
    repo.git(['mv', 'old.txt', 'new.txt']);
    repo.git(['commit', '-q', '-m', 'rename old to new']);
    hashes.push(repo.git(['rev-parse', 'HEAD']).trim());
    hashes.push(repo.commit('new.txt', 'one\ntwo\nthree\n', 'edit new'));
    repo.commit('other.txt', 'x\n', 'unrelated');

    const boot = await startServer(0, '127.0.0.1', {
      cwd: repo.dir,
      llm: { provider: 'heuristic' }
    });
    url = `http://127.0.0.1:${(boot.server.address() as AddressInfo).port}`;
    close = boot.close;
  });

  afterAll(async () => {
    await close();
    repo.cleanup();
  });

  const page = (p: number, size: number) =>
    request({ url: `${url}/api/file-history?file=new.txt&page=${p}&pageSize=${size}` });

  it('follows renames past the rename commit, newest first', async () => {
    const r = await page(1, 100);
    expect(r.status).toBe(200);
    expect(r.body.commits.map((c: { hash: string }) => c.hash)).toEqual([...hashes].reverse());
    expect(r.body).toMatchObject({ page: 1, pageSize: 100, hasNext: false, hasPrevious: false });
  });

  it('pages without gaps or overlap, flagging hasNext/hasPrevious', async () => {
    const seen: string[] = [];
    for (let p = 1; p <= 2; p++) {
      const r = await page(p, 2);
      expect(r.body.hasNext).toBe(p === 1 ? true : false);
      expect(r.body.hasPrevious).toBe(p > 1);
      seen.push(...r.body.commits.map((c: { hash: string }) => c.hash));
    }
    expect(seen).toEqual([...hashes].reverse());
    expect((await page(3, 2)).body.commits).toEqual([]);
  });

  it('rejects a missing or unsafe file', async () => {
    expect((await request({ url: `${url}/api/file-history` })).status).toBe(400);
    expect((await request({ url: `${url}/api/file-history?file=../../etc/passwd` })).status).toBe(
      400
    );
  });
});
