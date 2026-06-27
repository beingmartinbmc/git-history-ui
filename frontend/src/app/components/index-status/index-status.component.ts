import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IndexStatus } from '../../models/git.models';
import { GitService } from '../../services/git.service';

@Component({
  selector: 'app-index-status',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="index-card" *ngIf="status() as s" aria-live="polite">
      <div class="main">
        <span class="dot" [class.running]="s.running" [class.off]="!s.available"></span>
        <div>
          <strong>{{ title() }}</strong>
          <span>{{ subtitle() }}</span>
        </div>
      </div>
      <div class="actions" *ngIf="s.available">
        <button
          class="btn btn-ghost"
          type="button"
          (click)="build()"
          [disabled]="busy() || s.running"
        >
          Build
        </button>
        <button
          class="btn btn-ghost"
          type="button"
          (click)="rebuild()"
          [disabled]="busy() || s.running"
        >
          Rebuild
        </button>
        <button
          class="btn btn-ghost"
          type="button"
          (click)="cancel()"
          [disabled]="busy() || !s.running"
        >
          Cancel
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .index-card {
        position: fixed;
        right: 1rem;
        bottom: 3.75rem;
        z-index: 70;
        display: flex;
        gap: 0.75rem;
        align-items: center;
        max-width: min(560px, calc(100vw - 2rem));
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        background: var(--bg-elevated);
        color: var(--fg-secondary);
        box-shadow: var(--shadow-md);
        font-size: 12px;
      }
      .main {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        min-width: 0;
      }
      .main div {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      strong {
        color: var(--fg-primary);
        font-weight: 600;
      }
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-ring);
        flex: 0 0 auto;
      }
      .dot.running {
        animation: pulse 1s ease-in-out infinite;
      }
      .dot.off {
        background: var(--fg-subtle);
        box-shadow: none;
      }
      .actions {
        display: flex;
        gap: 0.3rem;
      }
      .actions .btn {
        font-size: 11px;
        padding: 0.25rem 0.45rem;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.9);
        }
        50% {
          opacity: 1;
          transform: scale(1.1);
        }
      }
      @media (max-width: 760px) {
        .index-card {
          left: 1rem;
          right: 1rem;
          justify-content: space-between;
        }
        .actions .btn:first-child {
          display: none;
        }
      }
    `,
  ],
})
export class IndexStatusComponent implements OnDestroy {
  private git = inject(GitService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  status = signal<IndexStatus | null>(null);
  busy = signal(false);
  title = computed(() => {
    const s = this.status();
    if (!s) return 'Index status';
    if (!s.available) return 'SQLite index unavailable';
    if (s.running) return `Index ${s.progress.phase}`;
    if (s.progress.phase === 'error') return 'Index build failed';
    if (s.total > 0) return 'Search index ready';
    return 'Search index not built';
  });
  subtitle = computed(() => {
    const s = this.status();
    if (!s) return 'Checking…';
    if (!s.available) return 'Install optional better-sqlite3 support to enable indexed search.';
    const message = s.progress.message ? `${s.progress.message}. ` : '';
    const indexed = s.running ? s.progress.indexed : s.total;
    const count = indexed ? `${indexed.toLocaleString()} commits` : 'No commits indexed';
    const built = s.builtAt ? `Built ${new Date(s.builtAt).toLocaleString()}` : 'Never built';
    return `${message}${count}. ${built}.`;
  });

  constructor() {
    this.refresh();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  build(): void {
    this.run(() => this.git.buildIndex());
  }

  rebuild(): void {
    this.run(() => this.git.rebuildIndex());
  }

  cancel(): void {
    this.run(() => this.git.cancelIndexBuild());
  }

  private refresh(): void {
    this.git.getIndexStatus().subscribe({
      next: (s) => {
        this.status.set(s);
        this.schedule(s.running ? 1000 : 10_000);
      },
      error: () => this.schedule(15_000),
    });
  }

  private run(action: () => import('rxjs').Observable<IndexStatus>): void {
    this.busy.set(true);
    action().subscribe({
      next: (s) => this.status.set(s),
      error: () => this.busy.set(false),
      complete: () => {
        this.busy.set(false);
        this.schedule(this.status()?.running ? 1000 : 5_000);
      },
    });
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), ms);
  }
}
