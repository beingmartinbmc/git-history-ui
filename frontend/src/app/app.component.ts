import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { IndexStatusComponent } from './components/index-status/index-status.component';
import { ShortcutsModalComponent } from './components/shortcuts-modal/shortcuts-modal.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { Commit } from './models/git.models';
import { GitService } from './services/git.service';
import { SearchService } from './services/search.service';
import { UiStateService } from './services/ui-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    ToolbarComponent,
    CommandPaletteComponent,
    IndexStatusComponent,
    ShortcutsModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar />

    <div class="status-bar" *ngIf="state.error() as err">
      <span>{{ err }}</span>
    </div>

    <router-outlet />

    <div class="loading" *ngIf="state.loading()" aria-live="polite">
      <span class="spinner"></span> Loading commits…
    </div>

    <button
      class="new-commits-toast"
      *ngIf="newCommitsAvailable()"
      (click)="refreshCommits()"
      aria-live="polite"
    >
      New commits available — click to refresh
    </button>

    <app-index-status />
    <app-command-palette />
    <app-shortcuts-modal />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background: var(--bg-app);
        color: var(--fg-primary);
      }
      .status-bar {
        padding: 0.5rem 1rem;
        background: rgba(220, 38, 38, 0.1);
        color: var(--danger);
        border-bottom: 1px solid var(--border-soft);
        font-size: 13px;
      }
      .loading {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.85rem;
        background: var(--bg-elevated);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-md);
        font-size: 12px;
        color: var(--fg-secondary);
        z-index: 80;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--border-strong);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .new-commits-toast {
        position: fixed;
        top: 3.5rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.5rem 1.2rem;
        background: var(--accent);
        color: var(--accent-fg, #fff);
        border: none;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        z-index: 100;
        animation: slideDown 200ms ease;
      }
      .new-commits-toast:hover {
        filter: brightness(1.1);
      }
      @keyframes slideDown {
        from {
          transform: translateX(-50%) translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class AppComponent {
  state = inject(UiStateService);
  private git = inject(GitService);
  private search = inject(SearchService);
  private route = inject(ActivatedRoute);

  private commitsResp = toSignal(
    toObservable(this.state.filters).pipe(
      debounceTime(200),
      switchMap((f) => {
        this.state.loading.set(true);
        this.state.error.set(null);
        const mode = this.state.searchMode();
        const useNl = mode === 'nl' && (f.search || '').trim().length > 0;
        const useStream = !useNl && (f.page ?? 1) === 1;
        const obs = useNl
          ? this.search.naturalLanguage(f.search || '', f)
          : useStream
            ? this.git.streamCommits(f)
            : this.git.getCommits(f);
        return obs.pipe(
          catchError((err) => {
            this.state.error.set(this.errorMessage(err));
            this.state.loading.set(false);
            return of(null);
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  private authorsLoaded = signal(false);
  private pendingSharedCommit = signal<string | null>(null);
  private loadingSharedCommit = signal<string | null>(null);

  readonly newCommitsAvailable = signal(false);
  private eventSource: EventSource | null = null;

  constructor() {
    // Handle deep-link query params: commit, at, pr, filters, mode
    this.route.queryParamMap.subscribe((params) => {
      const hash = normalizeCommitParam(params.get('commit') || params.get('at'));
      if (hash) {
        this.pendingSharedCommit.set(hash);
        this.state.selectHash(hash);
      }
      // Restore shared filters
      const author = params.get('author');
      const since = params.get('since');
      const until = params.get('until');
      const branch = params.get('branch');
      const file = params.get('file');
      const mode = params.get('mode');
      if (author || since || until || branch || file) {
        this.state.patchFilters({
          ...(author ? { author } : {}),
          ...(since ? { since } : {}),
          ...(until ? { until } : {}),
          ...(branch ? { branch } : {}),
          ...(file ? { file } : {}),
        });
      }
      if (mode === 'grouped') this.state.viewMode.set('grouped');
    });

    // Wire load-more into UiStateService so child components can trigger it
    this.state.onLoadMore = () => this.loadMore();

    // SSE: listen for new-commits events from the ref watcher
    this.connectEventSource();

    effect(() => {
      const resp = this.commitsResp();
      if (!resp) return;
      const currentSelection = untracked(() => this.state.selectedHash());
      const pinned = currentSelection
        ? untracked(() => findCommit(this.state.commits(), currentSelection))
        : undefined;
      const commits =
        pinned && !findCommit(resp.commits, pinned.hash) ? [pinned, ...resp.commits] : resp.commits;
      this.state.commits.set(commits);
      this.state.total.set(resp.total);
      this.state.page.set(resp.page);
      this.state.pageSize.set(resp.pageSize);
      this.state.hasNext.set(resp.hasNext);
      this.state.loading.set(false);
      const nl = (resp as Partial<{ parsedQuery: import('./models/git.models').NlInterpretation }>)
        .parsedQuery;
      this.state.nlInterpretation.set(nl ?? null);
      const pending = this.pendingSharedCommit();
      if (pending) {
        const match = findCommit(commits, pending);
        if (match) {
          this.state.selectHash(match.hash);
          this.pendingSharedCommit.set(null);
          return;
        }
        this.loadSharedCommit(pending);
        return;
      }
      if (!untracked(() => this.state.selectedHash()) && resp.commits.length) {
        this.state.selectHash(resp.commits[0].hash);
      }
    });

    effect(() => {
      if (this.commitsResp() && !this.authorsLoaded()) {
        this.authorsLoaded.set(true);
        this.git.getAuthors().subscribe({
          next: (a) => this.state.authors.set(a),
          error: () => this.state.authors.set([]),
        });
        this.git.getBranches().subscribe({
          next: (b) => this.state.branches.set(b),
          error: () => this.state.branches.set([]),
        });
        this.git.getTags().subscribe({
          next: (t) => this.state.tags.set(t),
          error: () => this.state.tags.set([]),
        });
      }
    });
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const e = (err as { error?: { error?: string } }).error;
      if (e?.error) return e.error;
    }
    if (err instanceof Error) return err.message;
    return 'Failed to load commits.';
  }

  loadMore() {
    if (this.state.loadingMore() || !this.state.hasNext()) return;
    this.state.loadingMore.set(true);
    const nextPage = this.state.page() + 1;
    const filters = this.state.filters();
    this.git.getCommits({ ...filters, page: nextPage }).subscribe({
      next: (resp) => {
        const existing = new Set(this.state.commits().map((c) => c.hash));
        const fresh = resp.commits.filter((c) => !existing.has(c.hash));
        this.state.commits.update((prev) => [...prev, ...fresh]);
        this.state.page.set(resp.page);
        this.state.total.set(resp.total);
        this.state.hasNext.set(resp.hasNext);
        this.state.loadingMore.set(false);
      },
      error: () => this.state.loadingMore.set(false),
    });
  }

  refreshCommits() {
    this.newCommitsAvailable.set(false);
    this.git.invalidate();
    this.state.patchFilters({ page: 1 });
  }

  private connectEventSource() {
    try {
      this.eventSource = new EventSource('/api/events');
      this.eventSource.addEventListener('new-commits', () => {
        this.newCommitsAvailable.set(true);
      });
      this.eventSource.onerror = () => {
        // Silently reconnect on error; EventSource auto-reconnects
      };
    } catch {
      // SSE not available
    }
  }

  private loadSharedCommit(hash: string) {
    if (this.loadingSharedCommit() === hash) return;
    this.loadingSharedCommit.set(hash);
    this.git.getCommit(hash).subscribe({
      next: (commit) => {
        this.state.commits.update((commits) =>
          commits.some((c) => c.hash === commit.hash) ? commits : [commit, ...commits],
        );
        this.state.selectHash(commit.hash);
        this.pendingSharedCommit.set(null);
        this.loadingSharedCommit.set(null);
      },
      error: () => {
        this.state.error.set(`Shared commit not found: ${hash}`);
        this.pendingSharedCommit.set(null);
        this.loadingSharedCommit.set(null);
      },
    });
  }
}

function normalizeCommitParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[0-9a-f]{7,40}$/i.test(trimmed) ? trimmed : null;
}

function findCommit(commits: Commit[], hash: string): Commit | undefined {
  const lower = hash.toLowerCase();
  return commits.find(
    (c) =>
      c.hash.toLowerCase() === lower ||
      c.shortHash.toLowerCase() === lower ||
      c.hash.toLowerCase().startsWith(lower),
  );
}
