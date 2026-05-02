import path from 'path';
import { GitService, type Commit } from '../backend/gitService';
import { makeRepo, type TestRepo } from './helpers/repo';

/** Covers the parts of GitService not exercised by the original gitService.test.ts:
 *  diff edge cases (rename / delete / binary), blame, range diff, file stats,
 *  revAt, runRaw, streamCommits, getRemoteUrl, plus input validation guards.
 */
describe('GitService — extra coverage', () => {
  let repo: TestRepo;
  let svc: GitService;
  let h1: string; // first commit (adds README + alpha.ts)
  let h2: string; // renames alpha.ts -> beta.ts and edits
  let h3: string; // deletes README
  let h4: string; // adds binary file

  beforeAll(() => {
    repo = makeRepo('ghui-extra-');
    const seedContent = Array.from({ length: 40 }, (_, i) => `// line ${i}\nexport const v${i} = ${i};`).join('\n');
    h1 = repo.commit('alpha.ts', seedContent, 'feat: alpha');
    repo.git(['mv', 'alpha.ts', 'beta.ts']);
    // Keep most content identical (same 40 lines) so git -M detects the rename.
    h2 = repo.commit('beta.ts', seedContent + '\n// trailing change\n', 'refactor: rename alpha to beta');
    repo.commit('README.md', '# hi\n', 'docs: add readme');
    repo.git(['rm', 'README.md']);
    h3 = repo.commit('placeholder.txt', 'p', 'chore: drop readme');
    // Binary commit (.png magic bytes).
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    require('fs').writeFileSync(path.join(repo.dir, 'logo.bin'), bin);
    repo.git(['add', '-A']);
    repo.git(['commit', '-q', '-m', 'chore: add binary']);
    h4 = repo.git(['rev-parse', 'HEAD']).trim();
    repo.git(['tag', 'v0.1.0', h2]);
    svc = new GitService(repo.dir);
  });

  afterAll(() => repo.cleanup());

  it('classifies rename diffs', async () => {
    const diff = await svc.getDiff(h2);
    const renamed = diff.find((d) => d.status === 'renamed');
    expect(renamed?.file).toBe('beta.ts');
    expect(renamed?.oldFile).toBe('alpha.ts');
  });

  it('classifies deleted-file diffs', async () => {
    const diff = await svc.getDiff(h3);
    expect(diff.some((d) => d.status === 'deleted')).toBe(true);
  });

  it('classifies binary diffs', async () => {
    const diff = await svc.getDiff(h4);
    expect(diff.some((d) => d.status === 'binary')).toBe(true);
  });

  it('rejects malformed inputs everywhere', async () => {
    await expect(svc.getDiff('not-hex')).rejects.toThrow(/Invalid commit hash/);
    await expect(svc.getRangeDiff('zz', 'aa')).rejects.toThrow(/Invalid commit hash/);
    await expect(svc.revAt('refs;rm', '2026-01-01')).rejects.toThrow(/Invalid ref/);
    await expect(svc.revAt('HEAD', 'not-a-date')).rejects.toThrow(/Invalid date/);
    await expect(svc.getFileAtCommit('nope', 'x')).rejects.toThrow(/Invalid commit hash/);
    await expect(svc.getFileAtCommit(h1, 'a\0b')).rejects.toThrow(/Invalid path/);
    await expect(svc.getFileStats('x\0y')).rejects.toThrow(/Invalid path/);
    await expect(svc.getBlame('x\0y')).rejects.toThrow(/Invalid path/);
  });

  it('range-diffs two commits', async () => {
    const diff = await svc.getRangeDiff(h1, h3);
    expect(diff.length).toBeGreaterThan(0);
  });

  it('reads a file at a specific commit', async () => {
    const txt = await svc.getFileAtCommit(h1, 'alpha.ts');
    expect(txt).toContain('export const v0 = 0');
  });

  it('returns blame for a tracked file', async () => {
    const blame = await svc.getBlame('beta.ts');
    expect(blame.length).toBeGreaterThan(0);
    expect(blame[0]).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{40}$/),
      author: 'Tester'
    });
  });

  it('returns file stats for a renamed file via --follow', async () => {
    const stats = await svc.getFileStats('beta.ts');
    expect(stats.totalCommits).toBeGreaterThan(0);
    expect(stats.contributors).toContain('Tester');
    expect(typeof stats.firstSeen).toBe('string');
  });

  it('resolves revAt for HEAD before the future date', async () => {
    const rev = await svc.revAt('HEAD', '2099-01-01');
    expect(rev).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null from revAt when nothing matches', async () => {
    const rev = await svc.revAt('HEAD', '1970-01-01');
    expect(rev).toBeNull();
  });

  it('streamCommits yields all commits and stops at the end', async () => {
    const all: Commit[] = [];
    for await (const c of svc.streamCommits({}, 2)) {
      all.push(c);
    }
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it('streamCommits throws NotARepositoryError outside a repo', async () => {
    const empty = require('os').tmpdir();
    const bad = new GitService(empty + '/_no_such_repo_' + Date.now());
    const it = bad.streamCommits({});
    await expect(it.next()).rejects.toThrow();
  });

  it('streamCommits respects an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const it = svc.streamCommits({}, 2, { signal: ac.signal });
    await expect(it.next()).rejects.toThrow(/aborted/);
  });

  it('runRaw passes through to git', async () => {
    const out = await svc.runRaw(['rev-parse', 'HEAD']);
    expect(out.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('getAuthors returns a sorted unique author list', async () => {
    require('fs').appendFileSync(path.join(repo.dir, 'beta.ts'), '\n// zed touch\n');
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Zed',
      GIT_AUTHOR_EMAIL: 'zed@example.com',
      GIT_COMMITTER_NAME: 'Zed',
      GIT_COMMITTER_EMAIL: 'zed@example.com',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C'
    };
    require('child_process').execFileSync('git', ['add', 'beta.ts'], { cwd: repo.dir, env });
    require('child_process').execFileSync('git', ['commit', '-q', '-m', 'chore: zed'], { cwd: repo.dir, env });
    const authors = await svc.getAuthors();
    expect(authors).toEqual([...authors].sort((a, b) => a.localeCompare(b)));
    expect(authors).toContain('Tester');
    expect(authors).toContain('Zed');
  });

  it('getFileStats sorts multiple contributors for a file', async () => {
    const stats = await svc.getFileStats('beta.ts');
    expect(stats.contributors).toEqual([...stats.contributors].sort((a, b) => a.localeCompare(b)));
    expect(stats.contributors).toEqual(expect.arrayContaining(['Tester', 'Zed']));
  });

  it('throws on getRemoteUrl when no remote is configured', async () => {
    await expect(svc.getRemoteUrl()).rejects.toThrow(/git remote failed/);
  });

  it('exposes getRemoteUrl when one is configured', async () => {
    repo.git(['remote', 'add', 'origin', 'git@github.com:acme/widgets.git']);
    const remote = await svc.getRemoteUrl();
    expect(remote).toContain('acme/widgets');
  });

  it('caches commit counts within a short window', async () => {
    const first = await svc.getCommits({});
    const second = await svc.getCommits({});
    expect(first.total).toBe(second.total);
  });

  it('lists tags including newly tagged commits', async () => {
    expect(await svc.getTags()).toContain('v0.1.0');
  });

  it('getFileStats returns zeros for an unknown path', async () => {
    const stats = await svc.getFileStats('does-not-exist.xyz');
    expect(stats.totalCommits).toBe(0);
    expect(stats.firstSeen).toBe('');
    expect(stats.lastTouched).toBe('');
    expect(stats.contributors).toEqual([]);
  });

  it('revAt returns null when the underlying git call fails', async () => {
    // 'unknown-ref' is shape-valid but not present → git rev-list returns
    // empty stdout, falls into the null branch.
    const out = await svc.revAt('unknown-ref-xyz', '2099-01-01');
    expect(out).toBeNull();
  });

  it('getNumstat returns per-commit additions/deletions in a single subprocess', async () => {
    const m = await svc.getNumstat({}, 100);
    expect(m.size).toBeGreaterThan(0);
    // Every value should be an array of file stat objects with numeric counts.
    for (const files of m.values()) {
      for (const f of files) {
        expect(typeof f.file).toBe('string');
        expect(typeof f.additions).toBe('number');
        expect(typeof f.deletions).toBe('number');
      }
    }
  });

  it('filters commits, streaming commits, and numstat by branch revision', async () => {
    const branchRepo = makeRepo('ghui-branch-filter-');
    try {
      const branchSvc = new GitService(branchRepo.dir);
      branchRepo.commit('base.txt', 'base\n', 'base');
      branchRepo.git(['checkout', '-q', '-b', 'feature/filter']);
      const featureHash = branchRepo.commit('feature.txt', 'feature\n', 'feat: branch-only');
      branchRepo.git(['checkout', '-q', 'main']);
      const mainHash = branchRepo.commit('main.txt', 'main\n', 'feat: main-only');

      const featurePage = await branchSvc.getCommits({ branch: 'feature/filter', pageSize: 10 });
      expect(featurePage.commits.map((c) => c.hash)).toContain(featureHash);
      expect(featurePage.commits.map((c) => c.hash)).not.toContain(mainHash);

      const streamed: string[] = [];
      for await (const c of branchSvc.streamCommits({ branch: 'feature/filter' })) {
        streamed.push(c.hash);
      }
      expect(streamed).toContain(featureHash);
      expect(streamed).not.toContain(mainHash);

      const numstat = await branchSvc.getNumstat({ branch: 'feature/filter' }, 20);
      expect(numstat.has(featureHash)).toBe(true);
      expect(numstat.has(mainHash)).toBe(false);
    } finally {
      branchRepo.cleanup();
    }
  });

  it('rejects unsafe branch names', async () => {
    await expect(svc.getCommits({ branch: 'bad branch;rm -rf' })).rejects.toThrow(/Invalid branch/);
  });

  it('getNumstat normalizes renamed paths to the destination file', async () => {
    const m = await svc.getNumstat({}, 100);
    const files = m.get(h2) ?? [];
    expect(files.some((f) => f.file === 'beta.ts')).toBe(true);
    expect(files.some((f) => f.file.includes('=>'))).toBe(false);
  });

  it('getNumstat handles binary files (additions/deletions = 0)', async () => {
    const m = await svc.getNumstat({}, 100);
    let sawBinary = false;
    for (const files of m.values()) {
      const bin = files.find((f) => f.file === 'logo.bin');
      if (bin) {
        sawBinary = true;
        expect(bin.additions).toBe(0);
        expect(bin.deletions).toBe(0);
      }
    }
    expect(sawBinary).toBe(true);
  });

  it('streamRaw delivers chunks and resolves on success', async () => {
    let bytes = 0;
    await svc.streamRaw(['log', '--pretty=oneline'], (chunk) => {
      bytes += chunk.length;
    });
    expect(bytes).toBeGreaterThan(0);
  });

  it('streamRaw rejects on a non-zero exit and surfaces stderr', async () => {
    await expect(
      svc.streamRaw(['cat-file', '-p', '0000000000000000000000000000000000000000'], () => {})
    ).rejects.toThrow(/git cat-file/);
  });

  it('streamRaw rejects immediately when called with an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(svc.streamRaw(['log', '--pretty=oneline'], () => {}, { signal: ac.signal }))
      .rejects.toThrow(/aborted/);
  });

  it('streamRaw rejects if the consumer callback throws', async () => {
    await expect(
      svc.streamRaw(['log', '--pretty=oneline'], () => {
        throw new Error('consumer failed');
      })
    ).rejects.toThrow('consumer failed');
  });

  it('streamRaw kills the git subprocess when aborted', async () => {
    const ac = new AbortController();
    const p = svc.streamRaw(['cat-file', '--batch'], () => {}, { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toThrow(/aborted/);
  });

  it('getNumstat propagates aborts from its streaming parser', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(svc.getNumstat({}, 10, { signal: ac.signal })).rejects.toThrow(/aborted/);
  });
});
