import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { createDemoRepository } from '../backend/demoRepo';
import { GitService } from '../backend/gitService';

describe('demo repository', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'ghui-demo-test-'));
  const directory = path.join(parent, 'repo');

  afterAll(() => rmSync(parent, { recursive: true, force: true }));

  it('creates stable, rich history and reuses it until reset', async () => {
    const first = createDemoRepository({ directory, reset: true });
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: first, encoding: 'utf8' }).trim();
    const firstHead = git(['rev-parse', 'HEAD']);
    const firstLog = git(['log', '--all', '--pretty=%H %s']);

    expect(createDemoRepository({ directory })).toBe(first);
    expect(git(['rev-parse', 'HEAD'])).toBe(firstHead);
    expect(firstLog).toContain('merge(ui): ship timeline (#42)');
    expect(firstLog).toContain('refactor(core): move orbit into domain');
    expect(git(['branch', '--format=%(refname:short)'])).toContain('feature/timeline');
    expect(git(['tag', '--list'])).toContain('v1.0.0');

    createDemoRepository({ directory, reset: true });
    expect(git(['rev-parse', 'HEAD'])).toBe(firstHead);
    expect(git(['log', '--all', '--pretty=%H %s'])).toBe(firstLog);

    const service = new GitService(directory);
    const commits = await service.getCommits({ pageSize: 50 });
    expect(new Set(commits.commits.map((commit) => commit.author)).size).toBeGreaterThanOrEqual(3);
    expect(commits.commits.some((commit) => commit.isMerge)).toBe(true);
  });
});
