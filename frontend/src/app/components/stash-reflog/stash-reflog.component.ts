import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GitService } from '../../services/git.service';

@Component({
  selector: 'app-stash-reflog',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container">
      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab() === 'stash'"
          (click)="activeTab.set('stash'); loadStashes()"
        >
          Stashes
        </button>
        <button
          class="tab"
          [class.active]="activeTab() === 'reflog'"
          (click)="activeTab.set('reflog'); loadReflog()"
        >
          Reflog
        </button>
      </div>

      <div class="content" *ngIf="activeTab() === 'stash'">
        <div class="empty" *ngIf="!stashes().length && !loading()">No stashes found.</div>
        <div class="entry" *ngFor="let s of stashes()">
          <span class="hash">stash&#64;{{ '{' }}{{ s.index }}{{ '}' }}</span>
          <span class="message">{{ s.message }}</span>
          <span class="date">{{ s.date | date: 'short' }}</span>
        </div>
      </div>

      <div class="content" *ngIf="activeTab() === 'reflog'">
        <div class="empty" *ngIf="!reflog().length && !loading()">No reflog entries.</div>
        <div class="entry" *ngFor="let r of reflog()">
          <span class="hash">{{ r.shortHash }}</span>
          <span class="action-badge">{{ r.action }}</span>
          <span class="message">{{ r.message }}</span>
          <span class="date">{{ r.date | date: 'short' }}</span>
        </div>
      </div>

      <div class="loading-bar" *ngIf="loading()">Loading…</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        background: var(--bg-app);
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 1.5rem 1rem;
      }
      .tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      .tab {
        padding: 0.5rem 1rem;
        background: var(--bg-surface);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-sm);
        color: var(--fg-secondary);
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
      }
      .tab.active {
        background: var(--accent);
        color: var(--accent-fg, #fff);
        border-color: var(--accent);
      }
      .entry {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-soft);
        font-size: 13px;
      }
      .hash {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg-muted);
        flex-shrink: 0;
      }
      .action-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        flex-shrink: 0;
      }
      .message {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .date {
        flex-shrink: 0;
        color: var(--fg-muted);
        font-size: 12px;
      }
      .empty,
      .loading-bar {
        padding: 2rem;
        text-align: center;
        color: var(--fg-muted);
        font-size: 13px;
      }
    `,
  ],
})
export class StashReflogComponent {
  private git = inject(GitService);

  activeTab = signal<'stash' | 'reflog'>('stash');
  stashes = signal<Array<{ index: number; message: string; date: string; hash: string }>>([]);
  reflog = signal<
    Array<{ hash: string; shortHash: string; action: string; message: string; date: string }>
  >([]);
  loading = signal(false);

  constructor() {
    this.loadStashes();
  }

  loadStashes() {
    this.loading.set(true);
    this.git.getStashes().subscribe({
      next: (s) => {
        this.stashes.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadReflog() {
    this.loading.set(true);
    this.git.getReflog().subscribe({
      next: (r) => {
        this.reflog.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
