import { CommonModule, DatePipe } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject
} from '@angular/core';
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
      <span class="hint">
        <kbd class="kbd">j</kbd>/<kbd class="kbd">k</kbd> navigate
      </span>
    </div>

    <cdk-virtual-scroll-viewport
      class="viewport"
      [itemSize]="58"
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
          <span class="subject" [title]="c.subject">{{ c.subject }}</span>
          <span class="meta">
            <span class="hash">{{ c.shortHash }}</span>
            <span class="dot-sep">•</span>
            <span class="author">{{ c.author }}</span>
            <span class="dot-sep">•</span>
            <span class="date">{{ c.date | date: 'MMM d, y, h:mm a' }}</span>
          </span>
        </span>
        <span class="badges" *ngIf="c.branches.length || c.tags.length">
          <span class="badge tag" *ngFor="let t of c.tags">{{ t }}</span>
          <span class="badge branch" *ngFor="let b of c.branches">{{ b }}</span>
        </span>
      </button>

      <div class="empty" *ngIf="!commits().length && !state.loading()">
        <p>No commits match your filters.</p>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: [`
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
    .viewport { flex: 1; min-height: 0; }
    .row {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      gap: 0.5rem;
      align-items: center;
      width: 100%;
      height: 58px;
      padding: 0.38rem 0.7rem;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--border-soft);
      border-left: 3px solid transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 100ms, border-color 100ms, transform 80ms;
    }
    .row:hover {
      background: color-mix(in oklab, var(--bg-hover) 70%, transparent);
      border-left-color: color-mix(in oklab, var(--accent) 48%, transparent);
    }
    .row.selected {
      background:
        linear-gradient(90deg, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%);
      border-left-color: var(--accent);
    }
    .row.selected .subject { color: var(--fg-primary); }

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
      gap: 2px;
    }
    .subject {
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
    }
    .hash { font-family: var(--font-mono); }
    .dot-sep { opacity: 0.5; }

    .badges {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: 150px;
      overflow: hidden;
      max-height: 42px;
    }
    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      max-width: 128px;
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
    .empty {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--fg-muted);
    }
  `]
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

  private laneColors = [
    '#4f46e5',
    '#06b6d4',
    '#f59e0b',
    '#ef4444',
    '#10b981',
    '#8b5cf6'
  ];

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
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable;
  }
}
