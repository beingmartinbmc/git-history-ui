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

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const hash = normalizeCommitParam(params.get('commit'));
      if (!hash) return;
      this.pendingSharedCommit.set(hash);
      this.state.selectHash(hash);
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
