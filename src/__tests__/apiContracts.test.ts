import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import { startServer, type BootResult } from '../backend/server';
import { request } from './helpers/http';
import { makeRepo, withTempHomeAsync, type TestRepo } from './helpers/repo';

/**
 * The frontend keeps hand-written copies of the API shapes (frontend/src/app/models). This pins
 * them to what the server really sends: every required model field must be present, and the
 * server must not send fields the model doesn't declare — so drift fails here, not in the UI.
 */
const MODELS = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'frontend', 'src', 'app', 'models', 'git.models.ts'),
  'utf8'
);

/** Top-level members of `export interface <name>` (following `extends`). */
function declared(name: string): { required: Set<string>; all: Set<string> } {
  const head = new RegExp(`export interface ${name}(?:\\s+extends\\s+([\\w, ]+))?\\s*\\{`).exec(
    MODELS
  );
  if (!head) throw new Error(`interface ${name} not found in git.models.ts`);
  const required = new Set<string>();
  const all = new Set<string>();
  let depth = 1;
  let line = '';
  for (const ch of MODELS.slice(head.index + head[0].length)) {
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) break;
    if (ch !== '\n') {
      line += ch;
      continue;
    }
    // Members start at two-space indent; deeper lines belong to nested object types.
    const m = /^ {2}(\w+)(\?)?:/.exec(line);
    if (m) {
      all.add(m[1]);
      if (!m[2]) required.add(m[1]);
    }
    line = '';
  }
  for (const parent of head[1]?.split(',').map((p) => p.trim()) ?? []) {
    const base = declared(parent);
    base.required.forEach((f) => required.add(f));
    base.all.forEach((f) => all.add(f));
  }
  return { required, all };
}

function expectShape(name: string, actual: unknown, omit: string[] = []): void {
  expect(actual).toEqual(expect.any(Object));
  const { required, all } = declared(name);
  omit.forEach((f) => {
    required.delete(f);
    all.delete(f);
  });
  const keys = Object.keys(actual as object);
  expect({ model: name, missing: [...required].filter((f) => !keys.includes(f)) }).toEqual({
    model: name,
    missing: []
  });
  expect({ model: name, undeclared: keys.filter((k) => !all.has(k)) }).toEqual({
    model: name,
    undeclared: []
  });
}

describe('API contracts: server responses match the frontend models', () => {
  jest.setTimeout(30_000);
  let repo: TestRepo;
  let boot: BootResult;
  let origin: string;
  let impactHash: string;
  let renameHash: string;

  const get = async (route: string) => {
    const r = await request({ url: `${origin}${route}` });
    expect({ route, status: r.status }).toEqual({ route, status: 200 });
    return r.body;
  };

  beforeAll(async () => {
    repo = makeRepo('ghui-contract-');
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => `export const v${i} = ${i};\n`);
    repo.commit('src/util.ts', 'export const u = 1;\n', 'feat: util');
    repo.commit('src/a.ts', `import { u } from './util';\n${lines(12).join('')}`, 'feat: a');
    impactHash = repo.commit('src/util.ts', 'export const u = 2;\n', 'fix: util');
    repo.git(['mv', 'src/a.ts', 'src/b.ts']);
    fs.appendFileSync(path.join(repo.dir, 'src', 'b.ts'), 'export const extra = 1;\n');
    repo.git(['add', '-A']);
    repo.git(['commit', '-q', '-m', 'refactor: rename a to b']);
    renameHash = repo.git(['rev-parse', 'HEAD']).trim();
    repo.git(['tag', '-a', 'v1', '-m', 'release', renameHash]);

    await withTempHomeAsync(async () => undefined); // keeps HOME untouched; registry read is by id only
    boot = await startServer(0, '127.0.0.1', { cwd: repo.dir, llm: { provider: 'heuristic' } });
    origin = `http://127.0.0.1:${(boot.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await boot.close();
    repo.cleanup();
  });

  it('commit lists and details', async () => {
    const page = await get('/api/commits?pageSize=10');
    expectShape('PaginatedCommits', page);
    expectShape('Commit', page.commits[0]);
    expectShape('Commit', await get(`/api/commit/${renameHash}`));
  });

  it('lazy diffs, including renames', async () => {
    const meta = await get(`/api/diff/${renameHash}/files`);
    expectShape('DiffFilesResponse', meta);
    expect(meta.files[0].status).toBe('renamed');
    expectShape('DiffFile', meta.files[0], ['changes']);
    const range = await get(`/api/range-diff/files?from=${impactHash}&to=${renameHash}`);
    expectShape('DiffFilesResponse', range);
    const one = await get(`/api/range-diff/file?from=${impactHash}&to=${renameHash}&path=src/b.ts`);
    expectShape('DiffFile', one);
  });

  it('file history and stats', async () => {
    const history = await get('/api/file-history?file=src/b.ts&pageSize=2');
    expectShape('FileHistoryPage', history);
    expectShape('Commit', history.commits[0]);
    expectShape('FileStats', await get('/api/file-stats?file=src/b.ts'));
  });

  it('impact, including dependents', async () => {
    const impact = await get(`/api/impact/${impactHash}`);
    expectShape('CommitImpact', impact);
    expect(impact.dependents).toEqual([{ from: 'src/a.ts', to: 'src/util.ts' }]);
  });

  it('natural-language search', async () => {
    const res = await get('/api/search?q=rename');
    expectShape('NlSearchResponse', res);
    expectShape('NlInterpretation', res.parsedQuery);
  });

  it('repository identity and the repo switcher', async () => {
    expectShape('RepositoryIdentity', await get('/api/repository'));
    const switcher = await get('/api/checkouts');
    expectShape('CheckoutsResponse', switcher);
    expectShape('Checkout', switcher.checkouts[0]);
  });
});
