import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Shared test helpers for spinning up real, throwaway git repos.
 * Tests use a real `git` binary so we exercise the same parsers the
 * production server uses.
 */

export interface TestRepo {
  dir: string;
  git: (args: string[]) => string;
  commit: (file: string, content: string, msg: string) => string;
  cleanup: () => void;
}

export function makeRepo(prefix = 'ghui-test-'): TestRepo {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  const git = (args: string[]): string =>
    execFileSync('git', args, {
      cwd: dir,
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

  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'tester@example.com']);
  git(['config', 'user.name', 'Tester']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'init.defaultBranch', 'main']);

  const commit = (file: string, content: string, msg: string): string => {
    const full = path.join(dir, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
    git(['add', '-A']);
    git(['commit', '-q', '-m', msg]);
    return git(['rev-parse', 'HEAD']).trim();
  };

  const cleanup = () => removeTempDir(dir);
  return { dir, git, commit, cleanup };
}

/** Per-test isolated HOME so modules that derive ~/.git-history-ui paths
 * from os.homedir() write into a temp directory we can inspect & nuke.
 *
 * We can't rely on process.env.HOME because Node caches the password-db
 * lookup on first os.homedir() call. We mutate the function directly. */
export function withTempHome<T>(fn: (home: string) => T): T {
  const original = os.homedir;
  const home = mkdtempSync(path.join(os.tmpdir(), 'ghui-home-'));
  (os as unknown as { homedir: () => string }).homedir = () => home;
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    (os as unknown as { homedir: () => string }).homedir = original;
    removeTempDir(home);
  }
}

/**
 * Build a synthetic repo with N linear commits using `git fast-import`.
 * This is roughly two orders of magnitude faster than running `git
 * commit` N times — essential for benchmark tests that need 1k+ commits
 * to surface real performance regressions.
 */
export function makeBigRepo(commitCount: number, prefix = 'ghui-bench-'): TestRepo {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Tester',
    GIT_AUTHOR_EMAIL: 'tester@example.com',
    GIT_COMMITTER_NAME: 'Tester',
    GIT_COMMITTER_EMAIL: 'tester@example.com',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C'
  };

  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env }).toString();

  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'tester@example.com']);
  git(['config', 'user.name', 'Tester']);
  git(['config', 'commit.gpgsign', 'false']);

  // Build a fast-import stream describing N commits, each touching a few
  // files so insights/numstat have something realistic to chew on.
  const lines: string[] = [];
  // Reserve an author/committer block for reuse.
  const author = 'Tester <tester@example.com>';
  // Author dates step backward so commits look realistic & sortable.
  const baseEpoch = 1_700_000_000;
  const subjects = [
    'feat(api): improve query speed',
    'fix(ui): nav menu collapse',
    'refactor: split module',
    'chore: bump deps',
    'docs: clarify usage',
    'test: cover edge cases',
    'feat(core): add new endpoint',
    'fix: race in cache'
  ];

  for (let i = 0; i < commitCount; i++) {
    const epoch = baseEpoch + i * 60;
    const subject = subjects[i % subjects.length];
    const fileA = `src/mod_${i % 50}.ts`;
    const fileB = `tests/mod_${i % 25}.test.ts`;
    const contentA = `export const v_${i} = ${i};\n`;
    const contentB = `import { v_${i} } from '../src/mod_${i % 50}';\n`;
    const msgBody = `${subject} #${i}`;
    lines.push(`commit refs/heads/main`);
    lines.push(`mark :${i + 1}`);
    lines.push(`author ${author} ${epoch} +0000`);
    lines.push(`committer ${author} ${epoch} +0000`);
    lines.push(`data ${Buffer.byteLength(msgBody, 'utf8')}`);
    lines.push(msgBody);
    if (i > 0) lines.push(`from :${i}`);
    lines.push(`M 100644 inline ${fileA}`);
    lines.push(`data ${Buffer.byteLength(contentA, 'utf8')}`);
    lines.push(contentA.replace(/\n$/, ''));
    lines.push(`M 100644 inline ${fileB}`);
    lines.push(`data ${Buffer.byteLength(contentB, 'utf8')}`);
    lines.push(contentB.replace(/\n$/, ''));
  }
  const stream = lines.join('\n') + '\n';

  const result = spawnSync('git', ['fast-import', '--quiet'], {
    cwd: dir,
    input: stream,
    env,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`git fast-import failed: ${result.stderr}`);
  }
  // Ensure HEAD and working tree are populated.
  execFileSync('git', ['reset', '--hard', '-q', 'main'], { cwd: dir, env });

  const commit = (file: string, content: string, msg: string): string => {
    const full = path.join(dir, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
    git(['add', '-A']);
    git(['commit', '-q', '-m', msg]);
    return git(['rev-parse', 'HEAD']).trim();
  };

  const cleanup = () => removeTempDir(dir);
  return { dir, git, commit, cleanup };
}

export async function withTempHomeAsync<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const original = os.homedir;
  const home = mkdtempSync(path.join(os.tmpdir(), 'ghui-home-'));
  (os as unknown as { homedir: () => string }).homedir = () => home;
  const originalEnv = process.env.HOME;
  process.env.HOME = home;
  try {
    return await fn(home);
  } finally {
    (os as unknown as { homedir: () => string }).homedir = original;
    process.env.HOME = originalEnv;
    removeTempDir(home);
  }
}

function removeTempDir(dir: string): void {
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: process.platform === 'win32' ? 5 : 0,
    retryDelay: 100
  });
}
