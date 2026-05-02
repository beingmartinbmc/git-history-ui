import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiffFile, SnapshotResponse } from '../../models/git.models';
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
          <p class="sub">Drag the slider to see repo state at any point. Diff is computed against current HEAD.</p>
        </div>
        <div class="now">{{ atDisplay() }}</div>
      </header>

      <div class="slider-wrap">
        <input
          type="range"
          class="slider"
          min="0"
          [max]="ticks().length - 1"
          [ngModel]="tickIndex()"
          (ngModelChange)="onTickChange($event)"
        />
        <div class="ticks">
          <span class="tick" *ngFor="let t of ticks(); let i = index"
                [class.active]="i === tickIndex()"
                [title]="t.label">|</span>
        </div>
        <div class="tick-labels">
          <span>{{ firstTickLabel() }}</span>
          <span>{{ lastTickLabel() }}</span>
        </div>
      </div>

      <section class="snapshot" *ngIf="snapshot() as s">
        <div class="snap-card">
          <span class="snap-label">HEAD at this moment</span>
          <code class="snap-hash">{{ s.ref ?? '(no commits yet)' }}</code>
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

      <section class="diff-panel">
        <div class="diff-head">
          <h3>Diff vs HEAD</h3>
          <span class="diff-status" *ngIf="loadingDiff()">Computing diff…</span>
          <span class="diff-status" *ngIf="diffError() as e">{{ e }}</span>
          <span class="diff-status muted" *ngIf="!loadingDiff() && !diffError() && diff()?.length === 0">
            No differences (you're already at HEAD).
          </span>
        </div>
        <div class="files" *ngIf="(diff()?.length ?? 0) > 0">
          <div class="file"
               *ngFor="let f of diff()"
               [class.selected]="f === selectedFile()"
               (click)="selectedFile.set(f)">
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
  styles: [`
    :host { display: block; flex: 1; min-height: 0; overflow-y: auto; }
    .page { padding: 1rem 1.25rem; max-width: 1200px; margin: 0 auto; }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .head h2 { margin: 0; font-size: 18px; }
    .head .sub { margin: 0.2rem 0 0; color: var(--fg-muted); font-size: 13px; }
    .now {
      font-family: var(--font-mono, monospace);
      font-size: 13px;
      padding: 0.4rem 0.7rem;
      background: var(--bg-elevated);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
    }

    .slider-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    .slider {
      width: 100%;
      accent-color: var(--accent);
    }
    .ticks {
      display: flex;
      justify-content: space-between;
      margin-top: 0.4rem;
      color: var(--fg-subtle);
      font-size: 10px;
    }
    .tick.active { color: var(--accent); font-weight: bold; }
    .tick-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 11px;
      color: var(--fg-muted);
    }

    .snapshot {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .snap-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
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
    .ref-list { list-style: none; margin: 0; padding: 0; font-size: 12px; }
    .ref-list li {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      gap: 1rem;
    }
    .ref-name { color: var(--fg-secondary); }
    .ref-hash { font-family: var(--font-mono, monospace); color: var(--fg-muted); font-size: 11px; }

    .diff-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .diff-head {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-soft);
      display: flex;
      align-items: baseline;
      gap: 1rem;
    }
    .diff-head h3 { margin: 0; font-size: 14px; }
    .diff-status { font-size: 12px; color: var(--fg-muted); }
    .diff-status.muted { font-style: italic; }
    .files { padding: 0.5rem 0; max-height: 220px; overflow-y: auto; }
    .file {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 1rem;
      cursor: pointer;
      font-size: 12px;
    }
    .file:hover { background: var(--bg-elevated); }
    .file.selected { background: color-mix(in oklab, var(--accent) 18%, transparent); }
    .status {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--bg-elevated);
      color: var(--fg-muted);
      text-transform: uppercase;
    }
    .status-added { background: rgba(16, 185, 129, 0.18); color: #10b981; }
    .status-deleted { background: rgba(239, 68, 68, 0.18); color: #ef4444; }
    .status-modified { background: rgba(99, 102, 241, 0.18); color: var(--accent); }
    .path { flex: 1; font-family: var(--font-mono, monospace); }
    .changes { font-size: 11px; color: var(--fg-muted); }
    .diff-body { border-top: 1px solid var(--border-soft); padding: 0.5rem 0; }
  `]
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

  readonly ticks = computed(() => buildTicks(this.state.commits()));
  readonly atDisplay = computed(() => {
    const t = this.ticks()[this.tickIndex()];
    return t ? t.label : '';
  });
  readonly firstTickLabel = computed(() => this.ticks()[0]?.label ?? '');
  readonly lastTickLabel = computed(
    () => this.ticks()[this.ticks().length - 1]?.label ?? ''
  );

  constructor() {
    // Default to the latest tick (most recent).
    effect(() => {
      const t = this.ticks();
      if (t.length === 0) return;
      if (this.tickIndex() >= t.length) this.tickIndex.set(t.length - 1);
    });

    // Load snapshot whenever tick changes.
    effect(() => {
      const t = this.ticks()[this.tickIndex()];
      if (!t) return;
      this.timelineApi.snapshot(t.iso).subscribe({
        next: (s) => {
          this.snapshot.set(s);
          this.loadDiff(s);
        },
        error: () => this.snapshot.set(null)
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

  private loadDiff(s: SnapshotResponse) {
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
    this.timelineApi.rangeDiff(s.ref, head).subscribe({
      next: (d) => {
        this.diff.set(d);
        this.selectedFile.set(d[0] ?? null);
        this.loadingDiff.set(false);
      },
      error: (err) => {
        this.diffError.set(err?.error?.error ?? 'Failed to compute diff');
        this.loadingDiff.set(false);
      }
    });
  }
}

interface Tick {
  iso: string;
  label: string;
}

function buildTicks(commits: Array<{ date: string }>): Tick[] {
  if (commits.length === 0) return [];
  const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const start = new Date(first);
  const end = new Date(last);
  const ms = end.getTime() - start.getTime();
  // Aim for 12-24 ticks across the window.
  const tickCount = Math.max(12, Math.min(24, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)) + 1));
  const stepMs = ms / Math.max(1, tickCount - 1);
  const out: Tick[] = [];
  for (let i = 0; i < tickCount; i++) {
    const d = new Date(start.getTime() + i * stepMs);
    out.push({ iso: d.toISOString(), label: d.toISOString().slice(0, 10) });
  }
  return out;
}
