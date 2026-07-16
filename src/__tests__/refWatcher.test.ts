import fs from 'fs';
import path from 'path';
import os from 'os';
import { RefWatcher } from '../backend/refWatcher';

describe('RefWatcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refwatcher-'));
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(path.join(gitDir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits change when a ref file is modified', (done) => {
    const watcher = new RefWatcher(tmpDir, 50); // 50ms debounce for test speed
    watcher.on('change', () => {
      watcher.stop();
      done();
    });
    watcher.start();

    // Simulate a commit by touching HEAD
    setTimeout(() => {
      fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
    }, 20);
  });

  it('stop() prevents further events', (done) => {
    const watcher = new RefWatcher(tmpDir, 30);
    let fired = false;
    watcher.on('change', () => {
      fired = true;
    });
    watcher.start();
    watcher.stop();

    fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'changed\n');

    setTimeout(() => {
      expect(fired).toBe(false);
      done();
    }, 100);
  });

  it('watches shared refs when .git points at a linked-worktree git directory', (done) => {
    const dotGit = path.join(tmpDir, '.git');
    fs.rmSync(dotGit, { recursive: true, force: true });
    const worktreeGitDir = path.join(tmpDir, 'git-data', 'worktrees', 'feature');
    const commonGitDir = path.join(tmpDir, 'git-data');
    fs.mkdirSync(path.join(commonGitDir, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(worktreeGitDir, { recursive: true });
    fs.writeFileSync(dotGit, `gitdir: ${worktreeGitDir}\n`);
    fs.writeFileSync(path.join(worktreeGitDir, 'HEAD'), 'ref: refs/heads/feature\n');
    fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');

    const watcher = new RefWatcher(tmpDir, 30);
    watcher.on('change', () => {
      watcher.stop();
      done();
    });
    watcher.start();

    setTimeout(() => {
      fs.writeFileSync(path.join(commonGitDir, 'refs', 'heads', 'feature'), 'a'.repeat(40));
    }, 20);
  });

  it('does not throw when .git does not exist', () => {
    const watcher = new RefWatcher('/nonexistent/path');
    expect(() => watcher.start()).not.toThrow();
    watcher.stop();
  });
});
