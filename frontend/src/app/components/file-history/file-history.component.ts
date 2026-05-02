import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Commit, FileStats } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import { UiStateService } from '../../services/ui-state.service';
import { BlameComponent } from '../blame/blame.component';

type Tab = 'history' | 'blame';

@Component({
  selector: 'app-file-history',
  standalone: true,
  imports: [CommonModule, BlameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <button class="btn btn-ghost" (click)="goBack()">← Back</button>
        <div class="title-block">
          <h2>{{ filePath() }}</h2>
          <div class="meta" *ngIf="stats() as s">
            <span>{{ s.totalCommits }} commits</span>
            <span>·</span>
            <span>{{ s.contributors.length }} contributors</span>
            <span>·</span>
            <span>first: {{ s.firstSeen | slice:0:10 }}</span>
            <span>·</span>
            <span>last: {{ s.lastTouched | slice:0:10 }}</span>
          </div>
        </div>
      </header>

      <nav class="tabs">
        <button class="tab" [class.active]="tab() === 'history'" (click)="tab.set('history')">
          History
        </button>
        <button class="tab" [class.active]="tab() === 'blame'" (click)="tab.set('blame')">
          Blame
        </button>
      </nav>

      <section *ngIf="tab() === 'history'" class="history">
        <div class="empty" *ngIf="loading()">Loading commits…</div>
        <div class="empty error" *ngIf="error() as e">{{ e }}</div>
        <ul class="commits">
          <li *ngFor="let c of commits()"
              class="commit"
              [class.selected]="c.hash === state.selectedHash()"
              (click)="onSelectCommit(c.hash)">
            <code class="hash">{{ c.shortHash }}</code>
            <div class="info">
              <span class="subject">{{ c.subject }}</span>
              <span class="byline">{{ c.author }} · {{ c.date | slice:0:10 }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section *ngIf="tab() === 'blame'" class="blame-tab">
        <app-blame [file]="filePath()" [onCommitClick]="onSelectCommit.bind(this)" />
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; flex: 1; min-height: 0; overflow-y: auto; }
    .page { padding: 1rem 1.25rem; max-width: 1200px; margin: 0 auto; }
    .head {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .head h2 {
      margin: 0;
      font-size: 16px;
      font-family: var(--font-mono, monospace);
      word-break: break-all;
    }
    .meta { color: var(--fg-muted); font-size: 12px; display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem; }
    .tabs {
      display: flex;
      gap: 0.5rem;
      border-bottom: 1px solid var(--border-soft);
      margin-bottom: 1rem;
    }
    .tab {
      background: transparent;
      border: 0;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      color: var(--fg-muted);
      border-bottom: 2px solid transparent;
      font-size: 13px;
    }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .empty { padding: 1.5rem; color: var(--fg-muted); text-align: center; font-size: 13px; }
    .empty.error { color: var(--danger); }
    .commits { list-style: none; margin: 0; padding: 0; }
    .commit {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.55rem 0.85rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .commit:hover { background: var(--bg-elevated); }
    .commit.selected { background: color-mix(in oklab, var(--accent) 18%, transparent); }
    .commit .hash {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--fg-muted);
      padding-top: 2px;
    }
    .commit .info { display: flex; flex-direction: column; min-width: 0; }
    .commit .subject {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .commit .byline { font-size: 11px; color: var(--fg-muted); margin-top: 2px; }
  `]
})
export class FileHistoryComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private git = inject(GitService);
  private insightsApi = inject(InsightsService);
  state = inject(UiStateService);

  readonly filePath = signal<string>('');
  readonly stats = signal<FileStats | null>(null);
  readonly commits = signal<Commit[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<Tab>('history');

  constructor() {
    effect(() => {
      const raw = this.route.snapshot.paramMap.get('path') ?? '';
      const decoded = decodeURIComponent(raw);
      this.filePath.set(decoded);
      if (decoded) {
        this.load(decoded);
      }
    });
  }

  onSelectCommit(hash: string) {
    this.state.selectHash(hash);
    this.router.navigate(['/'], { queryParams: { commit: hash } });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  private load(file: string) {
    this.loading.set(true);
    this.error.set(null);
    this.insightsApi.fileStats(file).subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(null)
    });
    this.git.getCommits({ file, page: 1, pageSize: 200 }).subscribe({
      next: (r) => {
        this.commits.set(r.commits);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to load file history');
        this.loading.set(false);
      }
    });
  }
}
