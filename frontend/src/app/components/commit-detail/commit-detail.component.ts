import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { catchError, of, switchMap } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DiffFile } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';

@Component({
  selector: 'app-commit-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, DiffViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="commit() as c; else empty">
      <header class="head">
        <div class="row">
          <span class="hash">{{ c.shortHash }}</span>
          <span class="badges">
            <span class="badge tag" *ngFor="let t of c.tags">{{ t }}</span>
            <span class="badge branch" *ngFor="let b of c.branches">{{ b }}</span>
            <span class="badge merge" *ngIf="c.isMerge">merge</span>
          </span>
        </div>
        <h2 class="subject">{{ c.subject }}</h2>
        <div class="meta">
          <span>{{ c.author }} &lt;{{ c.authorEmail }}&gt;</span>
          <span class="dot">•</span>
          <span>{{ c.date | date: 'medium' }}</span>
        </div>
        <pre class="body" *ngIf="c.body">{{ c.body }}</pre>
      </header>

      <div class="split">
        <aside class="files">
          <div class="files-header">
            <span>Files</span>
            <span class="count" *ngIf="files().length">{{ files().length }}</span>
          </div>
          <div class="files-list">
            <button *ngFor="let f of files(); trackBy: trackByFile"
                    class="file"
                    [class.selected]="f.file === activeFile()?.file"
                    (click)="selectFile(f)">
              <span class="status-dot" [attr.data-status]="f.status"></span>
              <span class="path" [title]="f.file">{{ f.file }}</span>
              <span class="counts">
                <span class="add" *ngIf="f.additions">+{{ f.additions }}</span>
                <span class="del" *ngIf="f.deletions">−{{ f.deletions }}</span>
              </span>
            </button>
            <div class="files-empty" *ngIf="!files().length && !loading()">
              No files changed.
            </div>
            <div class="files-empty" *ngIf="loading()">Loading…</div>
          </div>
        </aside>
        <section class="diff">
          <app-diff-viewer [fileInput]="activeFile()" />
        </section>
      </div>
    </ng-container>

    <ng-template #empty>
      <div class="placeholder">
        <p class="title">No commit selected</p>
        <p class="hint">
          Pick a commit from the list, or press
          <kbd class="kbd">⌘K</kbd> to open the command palette.
        </p>
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--bg-app);
    }
    .head {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--border-soft);
      background: var(--bg-surface);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.4rem;
    }
    .hash {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-muted);
      padding: 2px 6px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-soft);
      border-radius: 4px;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 999px;
    }
    .badge.tag {
      background: rgba(217, 119, 6, 0.15);
      color: var(--warning);
    }
    .badge.branch {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .badge.merge {
      background: rgba(139, 92, 246, 0.18);
      color: #8b5cf6;
    }
    .subject {
      font-size: 18px;
      margin: 0 0 4px;
      font-weight: 600;
    }
    .meta {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 12px;
      color: var(--fg-muted);
    }
    .meta .dot { opacity: 0.5; }
    .body {
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-secondary);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.75rem;
      margin-top: 0.5rem;
      max-height: 160px;
      overflow: auto;
    }

    .split {
      flex: 1;
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 0;
    }
    .files {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-soft);
    }
    .files-header {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0.85rem;
      font-size: 12px;
      color: var(--fg-muted);
      border-bottom: 1px solid var(--border-soft);
    }
    .count {
      background: var(--bg-surface-2);
      padding: 0 6px;
      border-radius: 999px;
      font-size: 11px;
    }
    .files-list { overflow: auto; flex: 1; min-height: 0; }
    .file {
      display: grid;
      grid-template-columns: 10px 1fr auto;
      gap: 0.5rem;
      align-items: center;
      width: 100%;
      padding: 0.5rem 0.85rem;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
      border-bottom: 1px solid var(--border-soft);
      font-size: 12px;
    }
    .file:hover { background: var(--bg-hover); }
    .file.selected { background: var(--bg-selected); }
    .file .path {
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
      text-align: left;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }
    .status-dot[data-status='added'] { background: var(--success); }
    .status-dot[data-status='deleted'] { background: var(--danger); }
    .status-dot[data-status='renamed'],
    .status-dot[data-status='copied'] { background: var(--warning); }
    .status-dot[data-status='binary'] { background: var(--fg-muted); }
    .counts { display: flex; gap: 6px; font-family: var(--font-mono); font-size: 11px; }
    .counts .add { color: var(--success); }
    .counts .del { color: var(--danger); }
    .files-empty { padding: 1rem; color: var(--fg-muted); font-size: 12px; text-align: center; }

    .diff { min-width: 0; }
    .placeholder {
      flex: 1;
      display: grid;
      place-items: center;
      text-align: center;
      color: var(--fg-muted);
    }
    .placeholder .title { font-size: 16px; margin-bottom: 4px; color: var(--fg-secondary); }
    .placeholder .hint { font-size: 13px; }
  `]
})
export class CommitDetailComponent {
  private state = inject(UiStateService);
  private git = inject(GitService);

  commit = this.state.selected;

  loading = signal(false);

  files = toSignal(
    toObservable(this.commit).pipe(
      switchMap((c) => {
        if (!c) {
          this.loading.set(false);
          return of([] as DiffFile[]);
        }
        this.loading.set(true);
        return this.git.getDiff(c.hash).pipe(
          catchError(() => of([] as DiffFile[]))
        );
      })
    ),
    { initialValue: [] as DiffFile[] }
  );

  activeFileIndex = signal(0);
  activeFile = computed(() => {
    const list = this.files();
    if (!list.length) return null;
    const idx = Math.min(this.activeFileIndex(), list.length - 1);
    return list[idx];
  });

  constructor() {
    effect(() => {
      // reset selection when files list changes
      void this.files();
      this.activeFileIndex.set(0);
      this.loading.set(false);
    });
  }

  trackByFile(_: number, f: DiffFile) {
    return f.file;
  }

  selectFile(f: DiffFile) {
    const idx = this.files().findIndex((x) => x.file === f.file);
    if (idx >= 0) this.activeFileIndex.set(idx);
  }
}
