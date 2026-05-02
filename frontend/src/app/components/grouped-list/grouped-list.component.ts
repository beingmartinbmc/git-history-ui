import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommitGroup } from '../../models/git.models';
import { GroupsService } from '../../services/groups.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-grouped-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <span class="title">PR / feature groups</span>
      <span class="meta" *ngIf="groups()?.length as n">{{ n }} groups</span>
    </div>

    <div class="empty" *ngIf="loading()">Loading groups…</div>
    <div class="empty error" *ngIf="error() as e">{{ e }}</div>
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
          <li *ngFor="let h of g.commits"
              class="commit"
              [class.selected]="h === state.selectedHash()"
              (click)="state.selectHash(h)">
            <code class="hash">{{ shortHash(h) }}</code>
            <span class="subject">{{ subjectFor(h) }}</span>
          </li>
        </ul>
      </li>
    </ul>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .head {
      display: flex;
      justify-content: space-between;
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
      background: var(--bg-surface);
    }
    .title { font-weight: 600; font-size: 13px; }
    .meta { font-size: 11px; color: var(--fg-muted); }
    .empty {
      padding: 1rem 0.85rem;
      color: var(--fg-muted);
      font-size: 12px;
    }
    .empty.error { color: var(--danger); }
    .groups {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      flex: 1;
    }
    .group { border-bottom: 1px solid var(--border-soft); }
    .group-head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.85rem;
      background: transparent;
      border: 0;
      color: var(--fg-primary);
      cursor: pointer;
      text-align: left;
    }
    .group-head:hover { background: var(--bg-elevated); }
    .caret {
      display: inline-block;
      width: 10px;
      transition: transform 0.15s ease;
      color: var(--fg-muted);
    }
    .caret.open { transform: rotate(90deg); }
    .badge {
      font-size: 10px;
      letter-spacing: 0.04em;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--fg-secondary);
      text-transform: uppercase;
    }
    .badge.src-merge { background: rgba(99, 102, 241, 0.18); color: var(--accent); }
    .badge.src-squash { background: rgba(16, 185, 129, 0.18); color: #10b981; }
    .badge.src-conventional { background: rgba(245, 158, 11, 0.18); color: #d97706; }
    .pr { font-size: 11px; color: var(--fg-muted); }
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
      background: var(--bg-elevated);
      padding: 1px 6px;
      border-radius: 999px;
    }
    .commits {
      list-style: none;
      margin: 0;
      padding: 0 0 0.4rem 0;
      background: var(--bg-app);
    }
    .commit {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      padding: 0.3rem 0.85rem 0.3rem 2rem;
      cursor: pointer;
      font-size: 12px;
    }
    .commit:hover { background: var(--bg-elevated); }
    .commit.selected { background: color-mix(in oklab, var(--accent) 20%, transparent); }
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
  `]
})
export class GroupedListComponent {
  state = inject(UiStateService);
  private groupsApi = inject(GroupsService);

  readonly groups = signal<CommitGroup[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly expanded = signal<Set<string>>(new Set());

  // Map hash -> subject for fast lookup in template.
  private subjectMap = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.state.commits()) m.set(c.hash, c.subject);
    return m;
  });

  constructor() {
    effect(() => {
      const f = this.state.filters();
      this.load(f.since, f.until, f.author);
    });
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

  shortHash(h: string): string {
    return h.slice(0, 7);
  }

  subjectFor(h: string): string {
    return this.subjectMap().get(h) ?? h.slice(0, 7);
  }

  sourceLabel(s: CommitGroup['source']): string {
    switch (s) {
      case 'merge': return 'PR';
      case 'squash': return 'PR (sq)';
      case 'conventional': return 'Feat';
      case 'standalone': return 'commit';
    }
  }

  private load(since?: string, until?: string, author?: string) {
    this.loading.set(true);
    this.error.set(null);
    this.groupsApi.list({ since, until, author }).subscribe({
      next: (g) => {
        this.groups.set(g);
        this.loading.set(false);
        // Auto-expand the first group with a PR.
        const first = g.find((x) => x.prNumber);
        if (first) this.expanded.set(new Set([first.id]));
      },
      error: (err) => {
        this.error.set(this.errMsg(err));
        this.loading.set(false);
      }
    });
  }

  private errMsg(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const e = (err as { error?: { error?: string } }).error;
      if (e?.error) return e.error;
    }
    return err instanceof Error ? err.message : 'Failed to load groups';
  }
}
