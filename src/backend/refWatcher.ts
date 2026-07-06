import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Watches .git/HEAD and .git/refs/ for changes and emits 'change'
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
    const gitDir = path.join(this.repoCwd, '.git');
    const watchTargets = [path.join(gitDir, 'HEAD'), path.join(gitDir, 'refs')];
    for (const target of watchTargets) {
      try {
        const isDir = fs.statSync(target).isDirectory();
        const w = fs.watch(target, { recursive: isDir }, () => this.onFsEvent());
        this.watchers.push(w);
      } catch {
        // .git dir may not exist (bare repo, submodule, etc.)
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
