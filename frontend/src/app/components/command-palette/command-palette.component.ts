import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" *ngIf="state.paletteOpen()" (click)="close()"></div>
    <div class="palette" *ngIf="state.paletteOpen()" role="dialog" aria-modal="true">
      <input
        #input
        class="search"
        type="text"
        placeholder="Jump to a commit by hash, subject, or author…"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        (keydown)="onKey($event)"
      />
      <ul class="results" role="listbox">
        <li
          *ngFor="let c of results(); let i = index; trackBy: trackByHash"
          class="result"
          [class.active]="i === index()"
          [attr.aria-selected]="i === index()"
          (mouseenter)="index.set(i)"
          (click)="pick(c)"
        >
          <span class="hash">{{ c.shortHash }}</span>
          <span class="subj">{{ c.subject }}</span>
          <span class="auth">{{ c.author }}</span>
        </li>
        <li class="result empty" *ngIf="!results().length">No matches.</li>
      </ul>
      <div class="footer">
        <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
        <span><kbd class="kbd">Enter</kbd> select</span>
        <span><kbd class="kbd">Esc</kbd> close</span>
      </div>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0;
      background: var(--bg-overlay);
      backdrop-filter: blur(2px);
      z-index: 90;
    }
    .palette {
      position: fixed;
      top: 12vh;
      left: 50%;
      transform: translateX(-50%);
      width: min(640px, calc(100vw - 32px));
      background: var(--bg-elevated);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      z-index: 100;
      overflow: hidden;
    }
    .search {
      width: 100%;
      border: 0;
      outline: 0;
      padding: 0.85rem 1rem;
      background: transparent;
      color: var(--fg-primary);
      font-size: 14px;
      border-bottom: 1px solid var(--border-soft);
    }
    .results {
      list-style: none;
      margin: 0;
      padding: 0.25rem 0;
      max-height: 50vh;
      overflow: auto;
    }
    .result {
      display: grid;
      grid-template-columns: 70px 1fr auto;
      align-items: center;
      gap: 0.6rem;
      padding: 0.45rem 1rem;
      cursor: pointer;
      font-size: 13px;
    }
    .result.active { background: var(--bg-hover); }
    .result.empty {
      grid-template-columns: 1fr;
      color: var(--fg-muted);
      cursor: default;
    }
    .hash { font-family: var(--font-mono); color: var(--fg-muted); }
    .subj {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--fg-primary);
    }
    .auth { color: var(--fg-muted); font-size: 11px; }
    .footer {
      display: flex;
      gap: 1rem;
      padding: 0.4rem 0.75rem;
      background: var(--bg-surface-2);
      border-top: 1px solid var(--border-soft);
      font-size: 11px;
      color: var(--fg-muted);
    }
  `]
})
export class CommandPaletteComponent {
  state = inject(UiStateService);

  @ViewChild('input') input?: ElementRef<HTMLInputElement>;

  query = signal('');
  index = signal(0);

  results = computed<Commit[]>(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.state.commits();
    if (!q) return list.slice(0, 50);
    return list
      .filter((c) =>
        c.hash.toLowerCase().startsWith(q) ||
        c.shortHash.toLowerCase().startsWith(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q)
      )
      .slice(0, 50);
  });

  constructor() {
    effect(() => {
      if (this.state.paletteOpen()) {
        this.query.set('');
        this.index.set(0);
        queueMicrotask(() => this.input?.nativeElement.focus());
      }
    });
    effect(() => {
      // clamp index when results change
      const len = this.results().length;
      if (this.index() >= len) this.index.set(Math.max(0, len - 1));
    });
  }

  trackByHash(_: number, c: Commit) {
    return c.hash;
  }

  onQuery(v: string) {
    this.query.set(v);
    this.index.set(0);
  }

  onKey(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.index.update((i) =>
        Math.min(this.results().length - 1, i + 1)
      );
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.index.update((i) => Math.max(0, i - 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const c = this.results()[this.index()];
      if (c) this.pick(c);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
    }
  }

  pick(c: Commit) {
    this.state.selectHash(c.hash);
    this.close();
  }

  close() {
    this.state.paletteOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onGlobal(ev: KeyboardEvent) {
    const meta = ev.metaKey || ev.ctrlKey;
    if (meta && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      this.state.paletteOpen.set(!this.state.paletteOpen());
    }
  }
}
