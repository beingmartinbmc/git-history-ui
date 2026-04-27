import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { GitService, NotARepositoryError } from '../backend/gitService';

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Tester',
      GIT_AUTHOR_EMAIL: 'tester@example.com',
      GIT_COMMITTER_NAME: 'Tester',
      GIT_COMMITTER_EMAIL: 'tester@example.com',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C'
    }
  }).toString();
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ghui-test-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'tester@example.com']);
  git(dir, ['config', 'user.name', 'Tester']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

function commit(repo: string, file: string, content: string, msg: string): string {
  const full = path.join(repo, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', msg]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

describe('GitService', () => {
  let repo: string;
  let svc: GitService;
  let firstHash: string;
  let secondHash: string;
  let thirdHash: string;

  beforeAll(() => {
    repo = makeRepo();
    firstHash = commit(repo, 'README.md', '# hello\n', 'feat: initial commit');
    secondHash = commit(repo, 'src/a.txt', 'a\n', 'feat: add a');
    thirdHash = commit(repo, 'src/a.txt', 'a\nb\n', 'fix: extend a');
    git(repo, ['tag', 'v1.0.0', secondHash]);
    git(repo, ['branch', 'feature']);
    svc = new GitService(repo);
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('verifies the repository', async () => {
    expect(await svc.verifyRepository()).toBe(true);
  });

  it('throws NotARepositoryError outside a repo', async () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), 'ghui-empty-'));
    try {
      const bad = new GitService(empty);
      await expect(bad.getCommits()).rejects.toBeInstanceOf(NotARepositoryError);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('lists commits with pagination metadata', async () => {
    const result = await svc.getCommits({ pageSize: 10 });
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(1);
    expect(result.commits.map((c) => c.subject)).toEqual([
      'fix: extend a',
      'feat: add a',
      'feat: initial commit'
    ]);
    expect(result.commits[0].hash).toBe(thirdHash);
    expect(result.commits[0].parents).toEqual([secondHash]);
    expect(result.commits[2].parents).toEqual([]);
  });

  it('paginates correctly with --skip', async () => {
    const p1 = await svc.getCommits({ page: 1, pageSize: 2 });
    const p2 = await svc.getCommits({ page: 2, pageSize: 2 });
    expect(p1.commits).toHaveLength(2);
    expect(p2.commits).toHaveLength(1);
    expect(p1.totalPages).toBe(2);
    expect(p2.hasNext).toBe(false);
    expect(p2.hasPrevious).toBe(true);
  });

  it('filters by author', async () => {
    const result = await svc.getCommits({ author: 'Tester' });
    expect(result.total).toBeGreaterThan(0);
    const none = await svc.getCommits({ author: 'NoSuchPerson' });
    expect(none.total).toBe(0);
    expect(none.commits).toHaveLength(0);
  });

  it('filters by file path', async () => {
    const result = await svc.getCommits({ file: 'src/a.txt' });
    expect(result.commits.map((c) => c.hash)).toEqual([thirdHash, secondHash]);
  });

  it('searches commit messages server-side (--grep)', async () => {
    const result = await svc.getCommits({ search: 'extend' });
    expect(result.commits.map((c) => c.hash)).toEqual([thirdHash]);
  });

  it('attaches branches and tags from the ref index', async () => {
    const result = await svc.getCommits({ pageSize: 10 });
    const second = result.commits.find((c) => c.hash === secondHash)!;
    expect(second.tags).toContain('v1.0.0');
    const head = result.commits[0];
    expect(head.branches).toEqual(expect.arrayContaining(['main']));
  });

  it('lists distinct authors', async () => {
    const authors = await svc.getAuthors();
    expect(authors).toEqual(['Tester']);
  });

  it('lists tags and branches', async () => {
    expect(await svc.getTags()).toContain('v1.0.0');
    expect(await svc.getBranches()).toEqual(expect.arrayContaining(['main', 'feature']));
  });

  it('returns a diff for a regular commit', async () => {
    const diff = await svc.getDiff(thirdHash);
    expect(diff).toHaveLength(1);
    expect(diff[0].file).toBe('src/a.txt');
    expect(diff[0].additions).toBe(1);
    expect(diff[0].status).toBe('modified');
  });

  it('returns a diff for the root commit (no parent)', async () => {
    const diff = await svc.getDiff(firstHash);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff[0].file).toBe('README.md');
    expect(diff[0].status).toBe('added');
  });

  it('looks up a single commit by hash', async () => {
    const c = await svc.getCommit(secondHash);
    expect(c.hash).toBe(secondHash);
    expect(c.subject).toBe('feat: add a');
  });

  it('rejects malformed hashes', async () => {
    await expect(svc.getCommit('not-a-hash')).rejects.toThrow(/Invalid commit hash/);
  });
});
