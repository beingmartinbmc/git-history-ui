import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Commit, DiffFile, SnapshotResponse } from '../../models/git.models';
import { TimelineService } from '../../services/timeline.service';
import { UiStateService } from '../../services/ui-state.service';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, DiffViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h2>Time travel</h2>
          <p class="sub">
            Drag the slider to see repo state at any point. Diff is computed against current HEAD.
          </p>
        </div>
        <div class="now">{{ atDisplay() }}</div>
      </header>

      <div class="slider-wrap">
        <div class="rail">
          <div class="rail-fill" [style.width.%]="tickPct()"></div>
          <div class="rail-knob" [style.left.%]="tickPct()"></div>
        </div>
        <input
          type="range"
          class="slider"
          min="0"
          [max]="ticks().length - 1"
          [ngModel]="tickIndex()"
          (ngModelChange)="onTickChange($event)"
        />
        <div class="ticks">
          <span
            class="tick"
            *ngFor="let t of ticks(); let i = index"
            [class.active]="i === tickIndex()"
            [title]="t.label"
            >|</span
          >
        </div>
        <div class="tick-labels">
          <span>{{ firstTickLabel() }}</span>
          <span>{{ lastTickLabel() }}</span>
        </div>
      </div>

      <section class="moment" *ngIf="selectedTick() as tick">
        <div class="moment-copy">
          <span class="snap-label">Selected moment</span>
          <h3>{{ tick.label }}</h3>
          <p>{{ momentSummary() }}</p>
        </div>
        <div class="authors" *ngIf="authorBreakdown().length; else noAuthors">
          <span class="author-chip" *ngFor="let a of authorBreakdown()">
            <span class="avatar">{{ initials(a.author) }}</span>
            <span class="author-name">{{ a.author }}</span>
            <span class="author-count">{{ a.count }}</span>
          </span>
        </div>
        <ng-template #noAuthors>
          <p class="no-authors">No loaded commits fall in this time window.</p>
        </ng-template>
      </section>

      <section class="snapshot" *ngIf="snapshot() as s">
        <div class="snap-card">
          <span class="snap-label">HEAD at this moment</span>
          <code class="snap-hash">{{ s.ref ?? '(no commits yet)' }}</code>
        </div>
        <div class="snap-card head-commit" *ngIf="headCommit() as hc">
          <span class="snap-label">Commit at this point</span>
          <button class="commit-summary" (click)="selectCommit(hc)">
            <span class="commit-subject">{{ hc.subject }}</span>
            <span class="commit-meta">
              <code>{{ hc.shortHash }}</code>
              <span>{{ hc.author }}</span>
              <span>{{ hc.date | date: 'MMM d, y, h:mm a' }}</span>
            </span>
          </button>
        </div>
        <div class="snap-card branches" *ngIf="branchEntries(s).length">
          <span class="snap-label">Branches ({{ branchEntries(s).length }})</span>
          <ul class="ref-list">
            <li *ngFor="let b of branchEntries(s).slice(0, 8)">
              <span class="ref-name">{{ b.name }}</span>
              <code class="ref-hash">{{ b.hash.slice(0, 7) }}</code>
            </li>
          </ul>
        </div>
        <div class="snap-card branches" *ngIf="tagEntries(s).length">
          <span class="snap-label">Tags ({{ tagEntries(s).length }})</span>
          <ul class="ref-list">
            <li *ngFor="let t of tagEntries(s).slice(0, 8)">
              <span class="ref-name">{{ t.name }}</span>
              <code class="ref-hash">{{ t.hash.slice(0, 7) }}</code>
            </li>
          </ul>
        </div>
      </section>

      <section class="recent-card" *ngIf="recentCommits().length">
        <div class="recent-head">
          <h3>Recent commits before this moment</h3>
          <span>{{ recentCommits().length }} shown</span>
        </div>
        <button class="recent-row" *ngFor="let c of recentCommits()" (click)="selectCommit(c)">
          <span class="recent-dot"></span>
          <span class="recent-main">
            <span class="recent-subject">{{ c.subject }}</span>
            <span class="recent-meta">
              <code>{{ c.shortHash }}</code>
              <span>{{ c.author }}</span>
              <span>{{ c.date | date: 'MMM d, y, h:mm a' }}</span>
            </span>
          </span>
        </button>
      </section>

      <section class="diff-panel">
        <div class="diff-head">
          <h3>Diff vs HEAD</h3>
          <span class="diff-status" *ngIf="loadingDiff()">Computing diff…</span>
          <span class="diff-status" *ngIf="diffError() as e">{{ e }}</span>
          <span
            class="diff-status muted"
            *ngIf="!loadingDiff() && !diffError() && diff()?.length === 0"
          >
            No differences (you're already at HEAD).
          </span>
        </div>
        <div class="files" *ngIf="(diff()?.length ?? 0) > 0">
          <div
            class="file"
            *ngFor="let f of diff()"
            [class.selected]="f === selectedFile()"
            (click)="selectedFile.set(f)"
          >
            <span class="status status-{{ f.status }}">{{ statusLabel(f.status) }}</span>
            <span class="path">{{ f.file }}</span>
            <span class="changes">+{{ f.additions }} −{{ f.deletions }}</span>
          </div>
        </div>
        <div class="diff-body" *ngIf="selectedFile() as sf">
          <app-diff-viewer [fileInput]="sf" />
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
      .page {
        padding: 1.1rem 1.25rem 1.4rem;
        max-width: 1240px;
        margin: 0 auto;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .head h2 {
        margin: 0;
        font-size: clamp(20px, 2vw, 28px);
        letter-spacing: -0.03em;
      }
      .head .sub {
        margin: 0.2rem 0 0;
        color: var(--fg-muted);
        font-size: 13px;
      }
      .now {
        font-family: var(--font-mono, monospace);
        font-size: 13px;
        padding: 0.4rem 0.7rem;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        box-shadow: var(--shadow-sm);
      }

      .slider-wrap {
        position: relative;
        background:
          radial-gradient(
            circle at 20% 0%,
            color-mix(in oklab, var(--accent) 14%, transparent),
            transparent 42%
          ),
          var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
        box-shadow: var(--shadow-sm);
      }
      .rail {
        position: relative;
        height: 10px;
        margin: 0.25rem 0 0.85rem;
        border-radius: 999px;
        background: var(--bg-surface-2);
        overflow: visible;
      }
      .rail-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), #06b6d4);
        transition: width 120ms ease;
      }
      .rail-knob {
        position: absolute;
        top: 50%;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--bg-surface);
        border: 3px solid var(--accent);
        box-shadow: var(--shadow-md);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .slider {
        width: 100%;
        accent-color: var(--accent);
        opacity: 0.01;
        position: absolute;
        left: 1.25rem;
        right: 1.25rem;
        top: 0.95rem;
        width: calc(100% - 2.5rem);
        height: 34px;
        cursor: ew-resize;
      }
      .ticks {
        display: flex;
        justify-content: space-between;
        margin-top: 0.4rem;
        color: var(--fg-subtle);
        font-size: 10px;
      }
      .tick.active {
        color: var(--accent);
        font-weight: bold;
      }
      .tick-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 0.5rem;
        font-size: 11px;
        color: var(--fg-muted);
      }

      .moment {
        display: grid;
        grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
        gap: 0.9rem;
        align-items: center;
        margin-bottom: 1rem;
        padding: 0.85rem 1rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        background:
          radial-gradient(
            circle at 92% 0%,
            color-mix(in oklab, var(--accent) 14%, transparent),
            transparent 36%
          ),
          var(--bg-panel);
        box-shadow: var(--shadow-sm);
      }
      .moment-copy h3 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.03em;
      }
      .moment-copy p,
      .no-authors {
        margin: 0.25rem 0 0;
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .authors {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.45rem;
      }
      .author-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
        max-width: 230px;
        padding: 0.28rem 0.5rem 0.28rem 0.32rem;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: color-mix(in oklab, var(--bg-surface) 78%, transparent);
        color: var(--fg-secondary);
        font-size: 11px;
      }
      .avatar {
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-fg);
        font-size: 10px;
        font-weight: 800;
        flex: 0 0 auto;
      }
      .author-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .author-count {
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
      }

      .snapshot {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .snap-card {
        background: linear-gradient(
          180deg,
          color-mix(in oklab, var(--bg-panel) 96%, white 4%),
          var(--bg-panel)
        );
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        padding: 0.75rem 1rem;
        box-shadow: var(--shadow-sm);
        transition:
          border-color 120ms,
          box-shadow 120ms,
          transform 120ms;
      }
      .snap-card:hover {
        border-color: color-mix(in oklab, var(--accent) 28%, var(--border-soft));
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
      .snap-label {
        display: block;
        font-size: 11px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 0.4rem;
      }
      .snap-hash {
        font-family: var(--font-mono, monospace);
        font-size: 13px;
        color: var(--accent);
        word-break: break-all;
      }
      .commit-summary {
        display: grid;
        gap: 0.35rem;
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: left;
      }
      .commit-summary:hover .commit-subject {
        color: var(--accent);
      }
      .commit-subject {
        font-size: 13px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .commit-meta,
      .recent-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        color: var(--fg-muted);
        font-size: 11px;
      }
      .commit-meta code,
      .recent-meta code {
        color: var(--accent);
        font-family: var(--font-mono, monospace);
      }
      .ref-list {
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 12px;
      }
      .ref-list li {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        gap: 1rem;
      }
      .ref-name {
        color: var(--fg-secondary);
      }
      .ref-hash {
        font-family: var(--font-mono, monospace);
        color: var(--fg-muted);
        font-size: 11px;
      }

      .recent-card {
        margin-bottom: 1rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        background: var(--bg-panel);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
      }
      .recent-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
        padding: 0.7rem 0.9rem;
        border-bottom: 1px solid var(--border-soft);
        background: color-mix(in oklab, var(--bg-surface) 82%, transparent);
      }
      .recent-head h3 {
        margin: 0;
        font-size: 14px;
      }
      .recent-head span {
        color: var(--fg-muted);
        font-size: 11px;
      }
      .recent-row {
        display: grid;
        grid-template-columns: 12px minmax(0, 1fr);
        gap: 0.65rem;
        width: 100%;
        padding: 0.55rem 0.9rem;
        border: 0;
        border-bottom: 1px solid color-mix(in oklab, var(--border-soft) 58%, transparent);
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: left;
      }
      .recent-row:last-child {
        border-bottom: 0;
      }
      .recent-row:hover {
        background: color-mix(in oklab, var(--bg-hover) 68%, transparent);
      }
      .recent-dot {
        width: 9px;
        height: 9px;
        margin-top: 0.25rem;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-ring);
      }
      .recent-main {
        min-width: 0;
        display: grid;
        gap: 0.25rem;
      }
      .recent-subject {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 600;
      }

      .diff-panel {
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow: var(--shadow-sm);
      }
      .diff-head {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-soft);
        display: flex;
        align-items: baseline;
        gap: 1rem;
      }
      .diff-head h3 {
        margin: 0;
        font-size: 14px;
      }
      .diff-status {
        font-size: 12px;
        color: var(--fg-muted);
      }
      .diff-status.muted {
        font-style: italic;
      }
      .files {
        display: flex;
        gap: 0.4rem;
        padding: 0.65rem;
        max-height: 170px;
        overflow: auto;
        flex-wrap: wrap;
        background: color-mix(in oklab, var(--bg-surface-2) 56%, transparent);
      }
      .file {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.38rem 0.65rem;
        cursor: pointer;
        font-size: 12px;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: var(--bg-surface);
        max-width: 100%;
      }
      .file:hover {
        background: var(--bg-hover);
      }
      .file.selected {
        background: color-mix(in oklab, var(--accent) 18%, transparent);
        border-color: color-mix(in oklab, var(--accent) 40%, var(--border-soft));
      }
      .status {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--bg-surface-2);
        color: var(--fg-muted);
        text-transform: uppercase;
      }
      .status-added {
        background: rgba(16, 185, 129, 0.18);
        color: #10b981;
      }
      .status-deleted {
        background: rgba(239, 68, 68, 0.18);
        color: #ef4444;
      }
      .status-modified {
        background: rgba(99, 102, 241, 0.18);
        color: var(--accent);
      }
      .path {
        flex: 1;
        font-family: var(--font-mono, monospace);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .changes {
        font-size: 11px;
        color: var(--fg-muted);
      }
      .diff-body {
        border-top: 1px solid var(--border-soft);
        height: clamp(320px, 58vh, 720px);
        min-height: 0;
      }
      .diff-body app-diff-viewer {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      @media (max-width: 760px) {
        .moment {
          grid-template-columns: 1fr;
        }
        .authors {
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class TimelineComponent {
  state = inject(UiStateService);
  private timelineApi = inject(TimelineService);

  readonly snapshot = signal<SnapshotResponse | null>(null);
  readonly diff = signal<DiffFile[] | null>(null);
  readonly loadingDiff = signal(false);
  readonly diffError = signal<string | null>(null);
  readonly selectedFile = signal<DiffFile | null>(null);
  readonly tickIndex = signal(0);
  private diffSub: { unsubscribe(): void } | null = null;

  readonly timelineCommits = computed(() =>
    this.state
      .commits()
      .map((commit) => ({ commit, time: new Date(commit.date).getTime() }))
      .filter((x) => Number.isFinite(x.time))
      .sort((a, b) => a.time - b.time),
  );
  readonly ticks = computed(() => buildTicks(this.timelineCommits()));
  readonly selectedTick = computed(() => this.ticks()[this.tickIndex()] ?? null);
  readonly headCommit = computed(() => {
    const ref = this.snapshot()?.ref;
    if (!ref) return null;
    return (
      this.state.commitIndex().get(ref)?.commit ??
      this.state.commits().find((c) => c.hash.startsWith(ref)) ??
      null
    );
  });
  readonly windowCommits = computed(() => {
    const tick = this.selectedTick();
    if (!tick) return [];
    const current = new Date(tick.iso).getTime();
    const previous = this.previousTickTime();
    return this.timelineCommits()
      .filter((x) => x.time <= current && x.time > previous)
      .map((x) => x.commit)
      .reverse();
  });
  readonly recentCommits = computed(() => {
    const tick = this.selectedTick();
    if (!tick) return [];
    const current = new Date(tick.iso).getTime();
    const out: Commit[] = [];
    const list = this.timelineCommits();
    for (let i = list.length - 1; i >= 0 && out.length < 6; i--) {
      if (list[i].time <= current) out.push(list[i].commit);
    }
    return out;
  });
  readonly authorBreakdown = computed(() => {
    const counts = new Map<string, number>();
    for (const commit of this.windowCommits()) {
      counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
      .slice(0, 8);
  });
  readonly atDisplay = computed(() => {
    const t = this.ticks()[this.tickIndex()];
    return t ? t.label : '';
  });
  readonly firstTickLabel = computed(() => this.ticks()[0]?.label ?? '');
  readonly lastTickLabel = computed(() => this.ticks()[this.ticks().length - 1]?.label ?? '');
  readonly tickPct = computed(() => {
    const max = Math.max(1, this.ticks().length - 1);
    return Math.round((this.tickIndex() / max) * 100);
  });

  constructor() {
    // Default to the latest tick (most recent).
    effect(() => {
      const t = this.ticks();
      if (t.length === 0) return;
      if (this.tickIndex() >= t.length) this.tickIndex.set(t.length - 1);
    });

    // Load snapshot whenever tick changes.
    effect((onCleanup) => {
      const t = this.ticks()[this.tickIndex()];
      if (!t) return;
      let sub: { unsubscribe(): void } | null = null;
      const timer = window.setTimeout(() => {
        sub = this.timelineApi.snapshot(t.iso).subscribe({
          next: (s) => {
            this.snapshot.set(s);
            this.loadDiff(s);
          },
          error: () => this.snapshot.set(null),
        });
      }, 180);
      onCleanup(() => {
        window.clearTimeout(timer);
        sub?.unsubscribe();
      });
    });
  }

  onTickChange(v: number) {
    this.tickIndex.set(Math.max(0, Math.min(this.ticks().length - 1, Number(v))));
  }

  branchEntries(s: SnapshotResponse): Array<{ name: string; hash: string }> {
    return Object.entries(s.branches).map(([name, hash]) => ({ name, hash }));
  }
  tagEntries(s: SnapshotResponse): Array<{ name: string; hash: string }> {
    return Object.entries(s.tags).map(([name, hash]) => ({ name, hash }));
  }
  statusLabel(s: DiffFile['status']): string {
    return s === 'modified' ? 'mod' : s.slice(0, 3);
  }

  initials(author: string): string {
    const parts = author.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
    return `${first}${last}`.toUpperCase();
  }

  momentSummary(): string {
    const commits = this.windowCommits().length;
    const authors = this.authorBreakdown().length;
    if (commits === 0) return 'No loaded commits landed in this interval.';
    return `${commits} commit${commits === 1 ? '' : 's'} by ${authors} author${authors === 1 ? '' : 's'} in this interval.`;
  }

  selectCommit(commit: Commit) {
    this.state.selectHash(commit.hash);
  }

  private loadDiff(s: SnapshotResponse) {
    this.diffSub?.unsubscribe();
    if (!s.ref) {
      this.diff.set([]);
      this.selectedFile.set(null);
      return;
    }
    const head = this.state.commits()[0]?.hash;
    if (!head || head === s.ref) {
      this.diff.set([]);
      this.selectedFile.set(null);
      return;
    }
    this.loadingDiff.set(true);
    this.diffError.set(null);
    this.diffSub = this.timelineApi.rangeDiff(s.ref, head).subscribe({
      next: (d) => {
        this.diff.set(d);
        this.selectedFile.set(d[0] ?? null);
        this.loadingDiff.set(false);
      },
      error: (err) => {
        this.diffError.set(err?.error?.error ?? 'Failed to compute diff');
        this.loadingDiff.set(false);
      },
    });
  }

  private previousTickTime(): number {
    const previous = this.ticks()[this.tickIndex() - 1];
    return previous ? new Date(previous.iso).getTime() : Number.NEGATIVE_INFINITY;
  }
}

interface Tick {
  iso: string;
  label: string;
}

function buildTicks(commits: Array<{ time: number; commit: Commit }>): Tick[] {
  if (commits.length === 0) return [];
  const first = commits[0].time;
  const last = commits[commits.length - 1].time;
  const ms = last - first;
  // Aim for 12-24 ticks across the window.
  const tickCount = Math.max(12, Math.min(24, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)) + 1));
  const stepMs = ms / Math.max(1, tickCount - 1);
  const out: Tick[] = [];
  for (let i = 0; i < tickCount; i++) {
    const d = new Date(first + i * stepMs);
    out.push({ iso: d.toISOString(), label: d.toISOString().slice(0, 10) });
  }
  return out;
}
