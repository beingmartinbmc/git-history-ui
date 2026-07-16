import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Watches Git's HEAD and refs for changes and emits 'change'
 * when new commits are likely available. Debounced to avoid noise
 * from rapid git operations (rebase, fetch, etc.).
 */
export class RefWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;
  private closed = false;

  constructor(
    private repoCwd: string,
    debounceMs = 1000
  ) {
    super();
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.closed) return;
    const gitDir = resolveGitDir(this.repoCwd);
    if (!gitDir) return;
    const commonDir = resolveCommonDir(gitDir);
    const watchTargets = new Set([
      path.join(gitDir, 'HEAD'),
      path.join(gitDir, 'refs'),
      path.join(commonDir, 'refs'),
      path.join(commonDir, 'packed-refs')
    ]);
    for (const target of watchTargets) {
      try {
        const isDir = fs.statSync(target).isDirectory();
        const w = fs.watch(target, { recursive: isDir }, () => this.onFsEvent());
        this.watchers.push(w);
      } catch {
        // A ref target may not exist yet (for example packed-only refs).
      }
    }
  }

  stop(): void {
    this.closed = true;
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private onFsEvent(): void {
    if (this.closed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.emit('change');
    }, this.debounceMs);
  }
}

function resolveGitDir(repoCwd: string): string | null {
  const dotGit = path.join(repoCwd, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
    const match = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)\s*$/m);
    if (match) return path.resolve(repoCwd, match[1]);
  } catch {
    if (fs.existsSync(path.join(repoCwd, 'HEAD'))) return repoCwd;
  }
  return null;
}

function resolveCommonDir(gitDir: string): string {
  try {
    const common = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
    if (common) return path.resolve(gitDir, common);
  } catch {
    // Normal repositories do not have a commondir file.
  }
  return gitDir;
}
