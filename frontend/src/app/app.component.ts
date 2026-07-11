import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, ParamMap, Router, RouterOutlet } from '@angular/router';
import { catchError, distinctUntilChanged, filter, map, of, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { IndexStatusComponent } from './components/index-status/index-status.component';
import { ShortcutsModalComponent } from './components/shortcuts-modal/shortcuts-modal.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { Commit, PaginatedCommits } from './models/git.models';
import { GitService } from './services/git.service';
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

    <div class="status-bar" *ngIf="historyActive() && state.error() as err">
      <span>{{ err }}</span>
      <button type="button" (click)="retryCommits()">Retry</button>
    </div>

    <div class="route-content" [attr.aria-busy]="historyActive() && state.loading()">
      <router-outlet />
    </div>

    <div class="loading" *ngIf="historyActive() && state.loading()" aria-live="polite">
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
        height: 100dvh;
        width: 100%;
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
          env(safe-area-inset-left);
        overflow: hidden;
        background: var(--bg-app);
        color: var(--fg-primary);
      }
      .status-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1rem;
        background: rgba(220, 38, 38, 0.1);
        color: var(--danger);
        border-bottom: 1px solid var(--border-soft);
        font-size: 13px;
      }
      .status-bar button {
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .route-content {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private reload = signal(0);
  private queryHydrated = signal(false);
  private latestQueryParams: ParamMap | null = null;

  readonly historyActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => isHistoryUrl(event.urlAfterRedirects)),
      startWith(this.router.navigated && isHistoryUrl(this.router.url)),
      distinctUntilChanged(),
    ),
    { initialValue: this.router.navigated && isHistoryUrl(this.router.url) },
  );
  private commitsResp: Signal<PaginatedCommits | null>;

  private authorsLoaded = signal(false);
  private pendingSharedCommit = signal<string | null>(null);
  private loadingSharedCommit = signal<string | null>(null);

  readonly newCommitsAvailable = signal(false);
  private eventSource: EventSource | null = null;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.latestQueryParams = params;
      if (!isHistoryUrl(this.router.url)) return;
      const hash = this.state.hydrateQuery(params);
      this.pendingSharedCommit.set(hash);
      this.queryHydrated.set(true);
    });

    effect(() => {
      if (!this.historyActive() || this.queryHydrated() || !this.latestQueryParams) return;
      const hash = this.state.hydrateQuery(this.latestQueryParams);
      this.pendingSharedCommit.set(hash);
      this.queryHydrated.set(true);
    });

    const request = computed(() => ({
      active: this.historyActive() && this.queryHydrated(),
      filters: this.state.filters(),
      mode: this.state.searchMode(),
      reload: this.reload(),
    }));
    this.commitsResp = toSignal(
      toObservable(request).pipe(
        switchMap(({ active, filters: f, mode }) => {
          if (!active) {
            this.state.loading.set(false);
            return of(null);
          }
          this.state.loading.set(true);
          this.state.error.set(null);
          const useNl = mode === 'nl' && (f.search || '').trim().length > 0;
          const useStream = !useNl && (f.page ?? 1) === 1;
          const obs = useNl
            ? this.git.naturalLanguage(f.search || '', f)
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

    // Wire load-more into UiStateService so child components can trigger it
    this.state.onLoadMore = () => this.loadMore();

    effect(() => {
      if (this.historyActive()) this.connectEventSource();
      else this.disconnectEventSource();
    });

    effect(() => {
      if (!this.queryHydrated() || !this.historyActive()) return;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.state.queryParams(),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

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
        this.state.selectedHash.set(resp.commits[0].hash);
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

    this.destroyRef.onDestroy(() => this.disconnectEventSource());
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
    if (!this.historyActive() || this.state.loadingMore() || !this.state.hasNext()) return;
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
    this.reload.update((value) => value + 1);
  }

  retryCommits() {
    this.reload.update((value) => value + 1);
  }

  private connectEventSource() {
    if (this.eventSource) return;
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

  private disconnectEventSource() {
    this.eventSource?.close();
    this.eventSource = null;
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

function findCommit(commits: Commit[], hash: string): Commit | undefined {
  const lower = hash.toLowerCase();
  return commits.find(
    (c) =>
      c.hash.toLowerCase() === lower ||
      c.shortHash.toLowerCase() === lower ||
      c.hash.toLowerCase().startsWith(lower),
  );
}

function isHistoryUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return path === '';
}
