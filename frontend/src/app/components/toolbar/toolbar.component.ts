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
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
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

      <nav class="nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">History</a>
        <a routerLink="/timeline" routerLinkActive="active">Timeline</a>
        <a routerLink="/insights" routerLinkActive="active">Insights</a>
      </nav>

      <div class="filters">
        <label class="search" [class.search-nl]="state.searchMode() === 'nl'">
          <button
            type="button"
            class="search-mode"
            (click)="toggleSearchMode()"
            [title]="searchModeTooltip()"
            [attr.aria-label]="searchModeTooltip()"
          >
            <ng-container *ngIf="state.searchMode() === 'classic'">
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M9 2a7 7 0 1 1-4.32 12.5l-3.1 3.09a1 1 0 0 1-1.42-1.42l3.1-3.09A7 7 0 0 1 9 2Zm0 2a5 5 0 1 0 0 10A5 5 0 0 0 9 4Z"/>
              </svg>
            </ng-container>
            <ng-container *ngIf="state.searchMode() === 'nl'">
              <span class="ai-pill">AI</span>
            </ng-container>
          </button>
          <input
            #searchInput
            class="search-input"
            type="text"
            [placeholder]="searchPlaceholder()"
            [ngModel]="searchValue()"
            (ngModelChange)="onSearchInput($event)"
            aria-label="Search commits"
          />
          <kbd class="kbd" *ngIf="!searchValue()">/</kbd>
        </label>

        <select
          class="select"
          [ngModel]="state.filters().branch ?? ''"
          (ngModelChange)="onBranch($event)"
          aria-label="Filter by branch"
        >
          <option value="">All branches</option>
          <option *ngFor="let b of branchOptions()" [value]="b">{{ shortBranch(b) }}</option>
        </select>

        <select
          class="select author"
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
          class="input file"
          type="text"
          placeholder="path/to/file"
          [ngModel]="state.filters().file ?? ''"
          (ngModelChange)="onFile($event)"
          aria-label="Filter by file path"
        />
      </div>

      <div class="actions">
        <button
          class="btn btn-ghost clear-filters"
          *ngIf="activeFilterCount()"
          (click)="clearFilters()"
          title="Clear active filters"
        >
          Clear {{ activeFilterCount() }}
        </button>
        <button
          class="btn btn-ghost view-toggle"
          (click)="toggleViewMode()"
          [title]="viewModeTooltip()"
          [attr.aria-label]="viewModeTooltip()"
        >
          {{ state.viewMode() === 'grouped' ? 'Grouped' : 'Flat' }}
        </button>
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

    <div class="nl-chips" *ngIf="state.searchMode() === 'nl' && state.nlInterpretation() as q">
      <span class="chip-label">Interpreted as</span>
      <span class="chip" *ngIf="q.author">author: {{ q.author }}</span>
      <span class="chip" *ngIf="q.since">since: {{ q.since }}</span>
      <span class="chip" *ngIf="q.until">until: {{ q.until }}</span>
      <span class="chip" *ngFor="let k of q.keywords">{{ k }}</span>
      <span class="chip muted" *ngIf="q.keywords.length === 0 && !q.author && !q.since">no structured filters detected</span>
    </div>

    <div class="filter-chips" *ngIf="activeFilterCount()">
      <span class="chip-label">Active filters</span>
      <button class="chip active" *ngIf="state.filters().branch as b" (click)="onBranch('')">
        branch: {{ shortBranch(b) }} <span>×</span>
      </button>
      <button class="chip active" *ngIf="state.filters().author as a" (click)="onAuthor('')">
        author: {{ a }} <span>×</span>
      </button>
      <button class="chip active" *ngIf="state.filters().since as s" (click)="onSince('')">
        since: {{ s }} <span>×</span>
      </button>
      <button class="chip active" *ngIf="state.filters().until as u" (click)="onUntil('')">
        until: {{ u }} <span>×</span>
      </button>
      <button class="chip active" *ngIf="state.filters().file as f" (click)="onFile('')">
        file: {{ f }} <span>×</span>
      </button>
      <button class="chip active" *ngIf="state.filters().search as q" (click)="onSearchInput('')">
        search: {{ q }} <span>×</span>
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 50;
      background: color-mix(in oklab, var(--bg-glass) 94%, transparent);
      backdrop-filter: blur(16px) saturate(1.2);
      border-bottom: 1px solid var(--border-soft);
      box-shadow: var(--shadow-sm);
    }
    .toolbar {
      display: grid;
      /* brand | nav | filters (flexes) | actions */
      grid-template-columns: auto auto minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.75rem;
      row-gap: 0.4rem;
      padding: 0.65rem 1rem 0.55rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding-right: 0.25rem;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent), #06b6d4);
      color: var(--accent-fg);
      box-shadow: var(--shadow-glow);
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
      gap: 0.4rem;
      align-items: center;
      min-width: 0;
      justify-content: flex-end;
    }
    .filters > * { min-width: 0; }

    .search {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex: 1 1 220px;
      min-width: 0;
      max-width: 360px;
      padding: 0 0.55rem;
      background:
        linear-gradient(180deg, color-mix(in oklab, var(--bg-surface) 94%, white 6%), var(--bg-surface));
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      color: var(--fg-muted);
    }
    .search:focus-within {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-ring);
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

    .date { width: 8.25rem; }
    .filters .input,
    .filters .select { font-size: 12px; }
    .filters .select { max-width: 9.5rem; }
    .filters .select.author { max-width: 8.5rem; }
    .filters .input.file { width: 9rem; }

    .actions { display: flex; gap: 0.3rem; align-items: center; }

    .nav {
      display: flex;
      gap: 0.15rem;
      padding: 0;
    }
    .nav a {
      font-size: 12px;
      color: var(--fg-muted);
      text-decoration: none;
      padding: 0.3rem 0.65rem;
      border-radius: var(--radius-sm);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .nav a:hover { background: var(--bg-elevated); color: var(--fg-primary); }
    .nav a.active { background: var(--bg-elevated); color: var(--accent); font-weight: 600; }

    .search-mode {
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
    }
    .search-mode:hover { color: var(--fg-primary); }
    .search.search-nl {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 20%, transparent);
    }
    .ai-pill {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: var(--accent);
      color: var(--accent-fg);
      padding: 1px 5px;
      border-radius: 4px;
    }

    .view-toggle {
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.35rem 0.6rem;
    }
    .clear-filters {
      font-size: 11px;
      color: var(--danger);
      border-color: color-mix(in oklab, var(--danger) 24%, transparent);
    }

    .nl-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 1rem;
      border-bottom: 1px solid var(--border-soft);
      background: var(--bg-surface);
      font-size: 11px;
    }
    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      padding: 0 1rem 0.55rem;
      background: color-mix(in oklab, var(--bg-glass) 94%, transparent);
      font-size: 11px;
    }
    .chip-label { color: var(--fg-muted); margin-right: 0.2rem; }
    .chip {
      background: var(--bg-elevated);
      border: 1px solid var(--border-soft);
      padding: 2px 8px;
      border-radius: 999px;
      color: var(--fg-secondary);
    }
    button.chip {
      cursor: pointer;
      font-family: inherit;
    }
    .chip.active {
      display: inline-flex;
      gap: 0.35rem;
      align-items: center;
      border-color: color-mix(in oklab, var(--accent) 35%, var(--border-soft));
      color: var(--fg-primary);
    }
    .chip.active span { color: var(--fg-muted); font-weight: 700; }
    .chip.muted { font-style: italic; color: var(--fg-subtle); }

    /* Responsive: drop secondary controls before things wrap awkwardly. */
    @media (max-width: 1280px) {
      .filters .input.file { display: none; }
    }
    @media (max-width: 1100px) {
      .filters .date { display: none; }
      .search { max-width: 280px; }
    }
    @media (max-width: 900px) {
      .toolbar {
        grid-template-columns: auto minmax(0, 1fr) auto;
        row-gap: 0.5rem;
      }
      .nav {
        grid-column: 1 / -1;
        order: 5;
      }
      .filters .select { display: none; }
    }
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
  searchPlaceholder = computed(() =>
    this.state.searchMode() === 'nl'
      ? 'Ask anything: "login bug last month", "payments by alice"…'
      : 'Search commits…   ( / )'
  );
  searchModeTooltip = computed(() =>
    this.state.searchMode() === 'nl'
      ? 'Natural-language search active. Click to switch to literal search.'
      : 'Literal git-grep search. Click to switch to natural-language search.'
  );
  viewModeTooltip = computed(() =>
    this.state.viewMode() === 'grouped'
      ? 'Showing PR / feature groups. Click for flat list.'
      : 'Showing flat commit list. Click for PR / feature groups.'
  );
  branchOptions = computed(() => {
    const branches = this.state.branches();
    const local = branches.filter((b) => !isRemoteBranch(b));
    return local.length ? local : branches;
  });
  activeFilterCount = computed(() => {
    const f = this.state.filters();
    return [f.branch, f.author, f.since, f.until, f.file, f.search].filter(Boolean).length;
  });

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
  onBranch(v: string) {
    this.state.patchFilters({ branch: v || undefined });
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

  toggleSearchMode() {
    const next = this.state.searchMode() === 'classic' ? 'nl' : 'classic';
    this.state.searchMode.set(next);
    if (next === 'classic') this.state.nlInterpretation.set(null);
    // Re-trigger query
    this.state.patchFilters({});
  }

  toggleViewMode() {
    this.state.viewMode.set(this.state.viewMode() === 'flat' ? 'grouped' : 'flat');
  }

  clearFilters() {
    this.state.patchFilters({
      branch: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      file: undefined,
      search: undefined
    });
    this.searchValue.set('');
  }

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable;
  }

  shortBranch(branch: string): string {
    return branch.startsWith('origin/') ? branch.slice('origin/'.length) : branch;
  }
}

function isRemoteBranch(branch: string): boolean {
  return branch.startsWith('origin/') || branch.includes('/origin/');
}
