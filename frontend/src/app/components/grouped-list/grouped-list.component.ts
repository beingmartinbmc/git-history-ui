import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { CommitGroup } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-grouped-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="content" [attr.aria-busy]="loading()">
      <div class="head">
        <span class="title">PR / feature groups</span>
        <span class="meta" *ngIf="groups()?.length as n">{{ n }} groups</span>
      </div>

      <div class="empty" *ngIf="loading() && groups() === null">Loading groups…</div>
      <div class="empty error" *ngIf="error() as e">
        {{ e }} <button type="button" (click)="retry()">Retry</button>
      </div>
      <div class="empty" *ngIf="!loading() && !error() && (groups()?.length ?? 0) === 0">
        No groups detected. Try the flat view.
      </div>

      <ul class="groups">
        <li *ngFor="let g of groups()" class="group" [class.expanded]="isExpanded(g.id)">
          <button class="group-head" (click)="toggle(g.id)">
            <span class="caret" [class.open]="isExpanded(g.id)">▸</span>
            <span class="badge" [class]="'src-' + g.source">{{ sourceLabel(g.source) }}</span>
            <span class="pr" *ngIf="g.prNumber">#{{ g.prNumber }}</span>
            <span class="g-title">{{ g.title }}</span>
            <span class="count">{{ g.commits.length }}</span>
          </button>
          <ul class="commits" *ngIf="isExpanded(g.id)">
            <li *ngFor="let h of g.commits">
              <button
                type="button"
                class="commit"
                [class.selected]="h === state.selectedHash()"
                [attr.data-commit-hash]="h"
                [attr.aria-current]="h === state.selectedHash() ? 'true' : null"
                (click)="state.selectHash(h)"
              >
                <code class="hash">{{ shortHash(h) }}</code>
                <span class="subject">{{ subjectFor(h) }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .content {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
      .head {
        display: flex;
        justify-content: space-between;
        padding: 0.6rem 0.85rem;
        border-bottom: 1px solid var(--border-soft);
        background: color-mix(in oklab, var(--bg-surface) 92%, transparent);
      }
      .title {
        font-weight: 600;
        font-size: 13px;
      }
      .meta {
        font-size: 11px;
        color: var(--fg-muted);
      }
      .empty {
        padding: 1rem 0.85rem;
        color: var(--fg-muted);
        font-size: 12px;
      }
      .empty.error {
        color: var(--danger);
      }
      .empty button {
        margin-left: 0.4rem;
      }
      .groups {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        flex: 1;
      }
      .group {
        border-bottom: 1px solid var(--border-soft);
        transition: background 120ms;
      }
      .group.expanded {
        background: color-mix(in oklab, var(--accent) 5%, transparent);
      }
      .group-head {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.58rem 0.85rem;
        background: transparent;
        border: 0;
        color: var(--fg-primary);
        cursor: pointer;
        text-align: left;
      }
      .group-head:hover {
        background: color-mix(in oklab, var(--bg-hover) 72%, transparent);
      }
      .caret {
        display: inline-block;
        width: 10px;
        transition: transform 0.15s ease;
        color: var(--fg-muted);
      }
      .caret.open {
        transform: rotate(90deg);
      }
      .badge {
        font-size: 10px;
        letter-spacing: 0.04em;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--bg-surface-2);
        color: var(--fg-secondary);
        text-transform: uppercase;
      }
      .badge.src-merge {
        background: rgba(99, 102, 241, 0.18);
        color: var(--accent);
      }
      .badge.src-squash {
        background: rgba(16, 185, 129, 0.18);
        color: #10b981;
      }
      .badge.src-conventional {
        background: rgba(245, 158, 11, 0.18);
        color: #d97706;
      }
      .pr {
        font-size: 11px;
        color: var(--fg-muted);
      }
      .g-title {
        flex: 1;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .count {
        font-size: 11px;
        color: var(--fg-muted);
        background: var(--bg-surface-2);
        border: 1px solid var(--border-soft);
        padding: 1px 6px;
        border-radius: 999px;
      }
      .commits {
        list-style: none;
        margin: 0;
        padding: 0 0 0.4rem 0;
        background: color-mix(in oklab, var(--bg-surface-2) 72%, transparent);
      }
      .commit {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        width: 100%;
        padding: 0.34rem 0.85rem 0.34rem 2rem;
        border: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
      }
      .commit:hover {
        background: var(--bg-hover);
      }
      .commit.selected {
        background: color-mix(in oklab, var(--accent) 18%, transparent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .commit .hash {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: var(--fg-muted);
      }
      .commit .subject {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class GroupedListComponent {
  state = inject(UiStateService);
  private git = inject(GitService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly groups = signal<CommitGroup[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly expanded = signal<Set<string>>(new Set());
  private readonly reload = signal(0);

  // Map hash -> subject for fast lookup in template.
  private subjectMap = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.state.commits()) m.set(c.hash, c.subject);
    return m;
  });

  constructor() {
    const request = computed(() => {
      this.reload();
      const f = this.state.filters();
      return {
        since: f.since,
        until: f.until,
        author: f.author,
        branch: f.branch,
        focusedPr: this.state.focusedPrNumber(),
      };
    });
    toObservable(request)
      .pipe(
        switchMap(({ focusedPr, ...filters }) => {
          this.loading.set(true);
          this.error.set(null);
          return this.git.getGroups(filters).pipe(
            map((groups) => ({ groups, focusedPr, error: null })),
            catchError((error) => of({ groups: null, focusedPr, error: this.errMsg(error) })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result.error) {
          this.error.set(result.error);
          return;
        }
        const groups = result.groups ?? [];
        this.groups.set(groups);
        const focused = result.focusedPr
          ? groups.find((group) => group.prNumber === result.focusedPr)
          : undefined;
        const first = focused ?? groups.find((group) => group.prNumber);
        if (first) {
          this.expanded.set(new Set([first.id]));
          if (focused?.commits[0]) this.state.selectHash(focused.commits[0]);
        }
      });
  }

  retry() {
    this.reload.update((value) => value + 1);
  }

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggle(id: string) {
    const next = new Set(this.expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded.set(next);
  }

  focusSelected(): void {
    const hash = this.state.selectedHash();
    if (!hash) return;
    this.host.nativeElement.querySelector<HTMLElement>(`[data-commit-hash="${hash}"]`)?.focus();
  }

  shortHash(h: string): string {
    return h.slice(0, 7);
  }

  subjectFor(h: string): string {
    return this.subjectMap().get(h) ?? h.slice(0, 7);
  }

  sourceLabel(s: CommitGroup['source']): string {
    switch (s) {
      case 'merge':
        return 'PR';
      case 'squash':
        return 'PR (sq)';
      case 'conventional':
        return 'Feat';
      case 'standalone':
        return 'commit';
    }
  }

  private errMsg(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const e = (err as { error?: { error?: string } }).error;
      if (e?.error) return e.error;
    }
    return err instanceof Error ? err.message : 'Failed to load groups';
  }
}
