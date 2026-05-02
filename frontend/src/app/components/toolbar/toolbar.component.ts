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
import { ThemeService } from '../../services/theme.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="toolbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">⎇</span>
        <div class="brand-text">
          <span class="brand-title">Git History</span>
          <span class="brand-sub" *ngIf="totalLabel() as t">{{ t }}</span>
        </div>
      </div>

      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M9 2a7 7 0 1 1-4.32 12.5l-3.1 3.09a1 1 0 0 1-1.42-1.42l3.1-3.09A7 7 0 0 1 9 2Zm0 2a5 5 0 1 0 0 10A5 5 0 0 0 9 4Z"/>
          </svg>
          <input
            #searchInput
            class="search-input"
            type="text"
            placeholder="Search commits…   ( / )"
            [ngModel]="searchValue()"
            (ngModelChange)="onSearchInput($event)"
            aria-label="Search commits"
          />
          <kbd class="kbd" *ngIf="!searchValue()">/</kbd>
        </label>

        <select
          class="select"
          [ngModel]="state.filters().author ?? ''"
          (ngModelChange)="onAuthor($event)"
          aria-label="Filter by author"
        >
          <option value="">All authors</option>
          <option *ngFor="let a of state.authors()" [value]="a">{{ a }}</option>
        </select>

        <input
          class="input date"
          type="date"
          [ngModel]="state.filters().since ?? ''"
          (ngModelChange)="onSince($event)"
          aria-label="Since date"
        />
        <input
          class="input date"
          type="date"
          [ngModel]="state.filters().until ?? ''"
          (ngModelChange)="onUntil($event)"
          aria-label="Until date"
        />

        <input
          class="input"
          type="text"
          placeholder="path/to/file"
          [ngModel]="state.filters().file ?? ''"
          (ngModelChange)="onFile($event)"
          aria-label="Filter by file path"
        />
      </div>

      <div class="actions">
        <button class="btn btn-ghost btn-icon"
                (click)="state.paletteOpen.set(true)"
                title="Command palette (⌘K)">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Zm3-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Zm2 4h2v2H8Zm4 0h6v2h-6Zm-4 4h6v2H8Zm8 0h2v2h-2Z"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon"
                (click)="state.shortcutsOpen.set(true)"
                title="Keyboard shortcuts (?)">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M11 18h2v-2h-2Zm1-16a8 8 0 0 0-8 8h2a6 6 0 1 1 9.6 4.8c-1.06.8-1.6 1.42-1.6 3.2v.5h-2v-.5c0-2.6.94-3.5 2.13-4.39A4 4 0 1 0 8 10H6a6 6 0 0 1 6-8Z"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon"
                (click)="theme.cycle()"
                [title]="themeLabel()"
                [attr.aria-label]="themeLabel()">
          <svg *ngIf="theme.resolved() === 'light'" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-6.34 1.42-1.42M4.92 19.08l1.42-1.42m0-11.32L4.92 4.92m14.16 14.16-1.42-1.42M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>
          </svg>
          <svg *ngIf="theme.resolved() === 'dark'" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>
          </svg>
        </button>
      </div>
    </header>
  `,
  styles: [`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 50;
      background: color-mix(in oklab, var(--bg-surface) 92%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border-soft);
    }
    .toolbar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding-right: 0.5rem;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent), #06b6d4);
      color: var(--accent-fg);
      font-weight: 700;
      font-size: 18px;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .brand-title { font-weight: 600; }
    .brand-sub { font-size: 11px; color: var(--fg-muted); }

    .filters {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      min-width: 0;
    }

    .search {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex: 1 1 240px;
      min-width: 200px;
      max-width: 420px;
      padding: 0 0.6rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      color: var(--fg-muted);
    }
    .search:focus-within {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(99,102,241,.18);
    }
    .search-input {
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--fg-primary);
      font-size: 13px;
      padding: 0.45rem 0;
    }
    .search-input::placeholder { color: var(--fg-subtle); }
    .search .kbd { margin-left: 0.4rem; }

    .date { width: 9rem; }

    .actions { display: flex; gap: 0.3rem; }
  `]
})
export class ToolbarComponent {
  state = inject(UiStateService);
  theme = inject(ThemeService);

  @ViewChild('searchInput') searchEl?: ElementRef<HTMLInputElement>;

  searchValue = signal('');
  totalLabel = computed(() => {
    const t = this.state.total();
    if (!t) return '';
    return `${t.toLocaleString()} commits`;
  });
  themeLabel = computed(() => `Switch to ${this.theme.resolved() === 'light' ? 'dark' : 'light'} mode`);

  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      // keep local input in sync with external resets
      const f = this.state.filters();
      this.searchValue.set(f.search ?? '');
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if (ev.key === '/' && !this.isTyping(ev.target)) {
      ev.preventDefault();
      queueMicrotask(() => this.searchEl?.nativeElement.focus());
    }
  }

  onSearchInput(value: string) {
    this.searchValue.set(value);
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.state.patchFilters({ search: value || undefined });
    }, 250);
  }

  onAuthor(v: string) {
    this.state.patchFilters({ author: v || undefined });
  }
  onSince(v: string) {
    this.state.patchFilters({ since: v || undefined });
  }
  onUntil(v: string) {
    this.state.patchFilters({ until: v || undefined });
  }
  onFile(v: string) {
    this.state.patchFilters({ file: v || undefined });
  }

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable;
  }
}
