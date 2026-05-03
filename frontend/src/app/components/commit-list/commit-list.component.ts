import { CommonModule, DatePipe } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject } from '@angular/core';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-commit-list',
  standalone: true,
  imports: [CommonModule, ScrollingModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <span class="count">{{ commits().length }} of {{ state.total() }}</span>
      <span class="hint"> <kbd class="kbd">j</kbd>/<kbd class="kbd">k</kbd> navigate </span>
    </div>

    <cdk-virtual-scroll-viewport
      class="viewport"
      [itemSize]="68"
      minBufferPx="640"
      maxBufferPx="1280"
    >
      <button
        *cdkVirtualFor="let c of commits(); trackBy: trackByHash; let i = index"
        class="row"
        [class.selected]="c.hash === selectedHash()"
        (click)="select(c)"
        [attr.aria-current]="c.hash === selectedHash() ? 'true' : null"
      >
        <span class="lane">
          <span class="dot" [class.merge]="c.isMerge" [style.background]="laneColor(c)"></span>
          <span class="line" *ngIf="i < commits().length - 1"></span>
        </span>
        <span class="content">
          <span class="title-row">
            <span class="subject" [title]="c.subject">{{ c.subject }}</span>
            <span class="badges" *ngIf="c.branches.length || c.tags.length">
              <span class="badge tag" *ngFor="let t of c.tags" [title]="t">{{ t }}</span>
              <span class="badge branch" *ngFor="let b of c.branches" [title]="b">{{ b }}</span>
            </span>
          </span>
          <span class="meta">
            <span class="hash">{{ c.shortHash }}</span>
            <span class="dot-sep">•</span>
            <span class="author" [title]="c.author">{{ c.author }}</span>
            <span class="dot-sep">•</span>
            <span class="date" [title]="c.date | date: 'MMM d, y, h:mm a'">
              {{ c.date | date: 'MMM d, y, h:mm a' }}
            </span>
          </span>
          <span class="hover-card" aria-hidden="true">
            <span class="hover-subject">{{ c.subject }}</span>
            <span class="hover-meta">
              <span class="hash">{{ c.shortHash }}</span>
              <span>{{ c.author }}</span>
              <span>{{ c.date | date: 'MMM d, y, h:mm a' }}</span>
            </span>
            <span class="hover-refs" *ngIf="refsFor(c) as refs">{{ refs }}</span>
          </span>
        </span>
      </button>

      <div class="empty" *ngIf="!commits().length && !state.loading()">
        <p>No commits match your filters.</p>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: transparent;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 0.85rem;
        border-bottom: 1px solid var(--border-soft);
        font-size: 12px;
        color: var(--fg-muted);
        background: color-mix(in oklab, var(--bg-surface) 92%, transparent);
      }
      .viewport {
        flex: 1;
        min-height: 0;
      }
      .row {
        position: relative;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 0.5rem;
        align-items: center;
        width: 100%;
        height: 68px;
        padding: 0.45rem 0.7rem;
        background: transparent;
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        border-left: 3px solid transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          background 100ms,
          border-color 100ms,
          transform 80ms;
      }
      .row:hover {
        background: color-mix(in oklab, var(--bg-hover) 70%, transparent);
        border-left-color: color-mix(in oklab, var(--accent) 48%, transparent);
        z-index: 3;
      }
      .row.selected {
        background: linear-gradient(
          90deg,
          color-mix(in oklab, var(--accent) 18%, transparent),
          transparent 70%
        );
        border-left-color: var(--accent);
      }
      .row.selected .subject {
        color: var(--fg-primary);
      }

      .lane {
        position: relative;
        width: 24px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 2px var(--bg-surface);
        z-index: 1;
      }
      .dot.merge {
        background: transparent;
        border: 2px solid var(--accent);
      }
      .line {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2px;
        height: 50%;
        background: var(--border-strong);
        transform: translateX(-50%);
      }

      .content {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 4px;
      }
      .title-row {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 0.5rem;
      }
      .subject {
        flex: 1 1 auto;
        min-width: 0;
        font-weight: 500;
        font-size: 13px;
        color: var(--fg-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta {
        display: flex;
        gap: 6px;
        font-size: 11px;
        color: var(--fg-muted);
        align-items: center;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .hash {
        flex: 0 0 auto;
        font-family: var(--font-mono);
      }
      .author,
      .date {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .author {
        flex: 0 1 auto;
      }
      .date {
        flex: 1 1 auto;
      }
      .dot-sep {
        opacity: 0.5;
      }

      .badges {
        display: inline-flex;
        gap: 4px;
        flex: 0 1 auto;
        flex-wrap: nowrap;
        justify-content: flex-end;
        min-width: 0;
        max-width: min(48%, 180px);
        overflow: hidden;
      }
      .badge {
        flex: 0 1 auto;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        letter-spacing: 0.02em;
        border: 1px solid transparent;
        min-width: 0;
        max-width: 132px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .badge.tag {
        background: rgba(217, 119, 6, 0.15);
        color: var(--warning);
        border-color: color-mix(in oklab, var(--warning) 24%, transparent);
      }
      .badge.branch {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: color-mix(in oklab, var(--accent) 24%, transparent);
      }
      .hover-card {
        position: absolute;
        left: 42px;
        right: 10px;
        top: calc(100% - 8px);
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid color-mix(in oklab, var(--accent) 28%, var(--border-soft));
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--bg-elevated) 96%, transparent);
        box-shadow: var(--shadow-lg);
        color: var(--fg-primary);
        opacity: 0;
        pointer-events: none;
        transform: translateY(-4px);
        transition:
          opacity 100ms ease,
          transform 100ms ease,
          visibility 100ms;
        visibility: hidden;
        z-index: 12;
      }
      .row:hover .hover-card,
      .row:focus-visible .hover-card {
        opacity: 1;
        transform: translateY(0);
        visibility: visible;
      }
      .hover-subject {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .hover-meta,
      .hover-refs {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
        font-size: 11px;
        line-height: 1.35;
        color: var(--fg-muted);
      }
      .hover-meta > span:not(:last-child)::after {
        content: '•';
        margin-left: 0.45rem;
        opacity: 0.55;
      }
      .hover-refs {
        color: var(--accent);
        overflow-wrap: anywhere;
      }
      .empty {
        padding: 2rem 1rem;
        text-align: center;
        color: var(--fg-muted);
      }
    `,
  ],
})
export class CommitListComponent {
  state = inject(UiStateService);

  commits = this.state.commits;
  selectedHash = this.state.selectedHash;

  trackByHash(_: number, c: Commit) {
    return c.hash;
  }

  select(c: Commit) {
    this.state.selectHash(c.hash);
  }

  refsFor(c: Commit): string {
    return [...c.tags, ...c.branches].join(', ');
  }

  private laneColors = ['#4f46e5', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

  laneColor(c: Commit): string {
    let h = 0;
    const src = c.branches[0] ?? c.parents[0] ?? c.hash;
    for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
    return this.laneColors[h % this.laneColors.length];
  }

  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (this.isTyping(ev.target)) return;
    if (ev.key === 'j') {
      ev.preventDefault();
      this.state.selectByOffset(1);
    } else if (ev.key === 'k') {
      ev.preventDefault();
      this.state.selectByOffset(-1);
    } else if (ev.key === 'g') {
      ev.preventDefault();
      const list = this.state.commits();
      if (list.length) this.state.selectHash(list[0].hash);
    } else if (ev.key === 'G') {
      ev.preventDefault();
      const list = this.state.commits();
      if (list.length) this.state.selectHash(list[list.length - 1].hash);
    }
  }

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  }
}
