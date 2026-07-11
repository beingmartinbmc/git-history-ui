import { AddressInfo } from 'net';
import { startServer } from '../backend/server';
import { request } from './helpers/http';
import { makeRepo, type TestRepo } from './helpers/repo';

describe('HTTP server', () => {
  let repo: TestRepo;
  let url: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    repo = makeRepo('ghui-srv-');
    repo.commit('README.md', 'hi\n', 'feat: hello');
    const result = await startServer(0, '127.0.0.1', { cwd: repo.dir });
    const addr = result.server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    repo.cleanup();
  });

  it('exposes /api/health', async () => {
    const r = await request({ url: `${url}/api/health` });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('exposes /api/version', async () => {
    const r = await request({ url: `${url}/api/version` });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('git-history-ui');
    expect(typeof r.body.version).toBe('string');
  });

  it('isolates LLM providers between server instances', async () => {
    const heuristic = await startServer(0, '127.0.0.1', {
      cwd: repo.dir,
      llm: { provider: 'heuristic' }
    });
    const openai = await startServer(0, '127.0.0.1', {
      cwd: repo.dir,
      llm: { provider: 'openai', openaiApiKey: 'test-key' }
    });
    try {
      const heuristicUrl = `http://127.0.0.1:${(heuristic.server.address() as AddressInfo).port}`;
      const openaiUrl = `http://127.0.0.1:${(openai.server.address() as AddressInfo).port}`;
      const [heuristicVersion, openaiVersion] = await Promise.all([
        request({ url: `${heuristicUrl}/api/version` }),
        request({ url: `${openaiUrl}/api/version` })
      ]);

      expect(heuristicVersion.body.llm).toEqual({ provider: 'heuristic', isAi: false });
      expect(openaiVersion.body.llm).toEqual({ provider: 'openai', isAi: true });
    } finally {
      await Promise.all([heuristic.close(), openai.close()]);
    }
  });

  it('returns paginated commits', async () => {
    const r = await request({ url: `${url}/api/commits?pageSize=5` });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.commits[0].subject).toBe('feat: hello');
  });

  it('returns 404 for unknown API paths', async () => {
    const r = await request({ url: `${url}/api/does-not-exist` });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Not Found');
  });

  it('returns the SPA index for non-API paths', async () => {
    const r = await request({ url: `${url}/anything-else` });
    if (r.status === 200) {
      expect(String(r.body)).toContain('<app-root');
    } else {
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/Frontend build not found/);
    }
  });
});
