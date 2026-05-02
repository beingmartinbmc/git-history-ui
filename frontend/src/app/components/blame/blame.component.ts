import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { BlameLine } from '../../models/git.models';
import { GitService } from '../../services/git.service';

interface BlameRow extends BlameLine {
  /** Whether this row should show its commit metadata (different from the previous row's commit). */
  isFirstOfBlock: boolean;
}

@Component({
  selector: 'app-blame',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" *ngIf="loading()">Loading blame…</div>
    <div class="empty error" *ngIf="error() as e">{{ e }}</div>
    <div class="empty" *ngIf="!loading() && !error() && rows().length === 0 && file">
      No blame data (file may be binary or freshly created).
    </div>

    <div class="blame" *ngIf="rows().length > 0">
      <div class="row" *ngFor="let r of rows(); trackBy: trackByLine">
        <div class="meta" [class.invisible]="!r.isFirstOfBlock">
          <code class="hash" (click)="onSelectCommit(r.hash)">{{ r.hash.slice(0, 7) }}</code>
          <span class="author">{{ r.author }}</span>
          <span class="date">{{ shortDate(r.date) }}</span>
        </div>
        <span class="line-no">{{ r.line }}</span>
        <pre class="code">{{ r.content }}</pre>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: var(--font-mono, monospace); font-size: 12.5px; }
    .empty { padding: 1.5rem; color: var(--fg-muted); text-align: center; }
    .empty.error { color: var(--danger); }
    .blame {
      display: block;
      background: var(--bg-surface);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      overflow: auto;
      max-height: 70vh;
    }
    .row {
      display: grid;
      grid-template-columns: 220px 50px 1fr;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.5rem;
      border-bottom: 1px solid color-mix(in oklab, var(--border-soft) 50%, transparent);
    }
    .row:hover { background: var(--bg-elevated); }
    .meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 11px;
      color: var(--fg-muted);
      padding: 0.15rem 0;
      border-right: 1px solid var(--border-soft);
    }
    .meta.invisible > * { visibility: hidden; }
    .hash {
      color: var(--accent);
      cursor: pointer;
      text-decoration: none;
    }
    .hash:hover { text-decoration: underline; }
    .author {
      max-width: 100px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .date { color: var(--fg-subtle); }
    .line-no {
      color: var(--fg-subtle);
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
    }
    .code {
      margin: 0;
      padding: 0.15rem 0;
      white-space: pre;
      overflow-x: auto;
      color: var(--fg-primary);
    }
  `]
})
export class BlameComponent {
  private gitService = inject(GitService);

  @Input() set file(value: string | null) {
    this._file = value;
    if (value) this.load(value);
    else this.lines.set([]);
  }
  get file(): string | null {
    return this._file;
  }
  private _file: string | null = null;

  /** Emit when the user clicks a commit hash. */
  @Input() onCommitClick: ((hash: string) => void) | null = null;

  readonly lines = signal<BlameLine[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly rows = computed<BlameRow[]>(() => {
    const out: BlameRow[] = [];
    let prev = '';
    for (const l of this.lines()) {
      out.push({ ...l, isFirstOfBlock: l.hash !== prev });
      prev = l.hash;
    }
    return out;
  });

  trackByLine(_: number, r: BlameRow): number {
    return r.line;
  }

  shortDate(iso: string): string {
    return (iso || '').slice(0, 10);
  }

  onSelectCommit(hash: string) {
    if (this.onCommitClick) this.onCommitClick(hash);
  }

  private load(file: string) {
    this.loading.set(true);
    this.error.set(null);
    this.gitService.getBlame(file).subscribe({
      next: (l) => {
        this.lines.set(l);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to load blame');
        this.loading.set(false);
      }
    });
  }
}
