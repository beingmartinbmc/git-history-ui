import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { DiffFile } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';

@Component({
  selector: 'app-branch-compare',
  standalone: true,
  imports: [CommonModule, FormsModule, DiffViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="compare-page" [attr.aria-busy]="loading()">
      <div class="compare-header">
        <h2>Compare</h2>
        <div class="selectors">
          <select [(ngModel)]="fromRef" class="ref-select" aria-label="Base ref">
            <option value="">Select base ref…</option>
            <option *ngFor="let b of branches()" [value]="b">{{ b }}</option>
            <option *ngFor="let t of tags()" [value]="t">{{ t }}</option>
          </select>
          <span class="arrow">→</span>
          <select [(ngModel)]="toRef" class="ref-select" aria-label="Head ref">
            <option value="">Select head ref…</option>
            <option *ngFor="let b of branches()" [value]="b">{{ b }}</option>
            <option *ngFor="let t of tags()" [value]="t">{{ t }}</option>
          </select>
          <button class="btn" (click)="compare()" [disabled]="!fromRef || !toRef || loading()">
            {{ loading() ? 'Loading…' : 'Compare' }}
          </button>
          <ng-container *ngIf="compared() && files().length <= 50">
            <button class="btn" (click)="copyPortableLink()">Copy portable link</button>
            <button class="btn" (click)="copyMarkdownReport()">Copy Markdown report</button>
            <button class="btn" (click)="downloadReport()">Download report</button>
          </ng-container>
        </div>
      </div>

      <div class="error" *ngIf="error() as err">
        {{ err }} <button type="button" (click)="retry()">Retry</button>
      </div>

      <div class="results" *ngIf="files().length">
        <div class="summary">
          {{ files().length }} files changed
          <span class="add">+{{ totalAdditions() }}</span>
          <span class="del">-{{ totalDeletions() }}</span>
        </div>
        <div class="file-list">
          <button
            *ngFor="let f of files()"
            class="file"
            [class.selected]="f === activeFile()"
            (click)="activeFile.set(f)"
          >
            <span class="status-dot" [attr.data-status]="f.status"></span>
            <span class="path">{{ f.file }}</span>
            <span class="counts">
              <span class="add" *ngIf="f.additions">+{{ f.additions }}</span>
              <span class="del" *ngIf="f.deletions">−{{ f.deletions }}</span>
            </span>
          </button>
        </div>
        <app-diff-viewer [fileInput]="activeFile()" />
      </div>

      <div class="empty" *ngIf="!files().length && compared() && !loading() && !error()">
        No differences between these refs.
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1rem;
        overflow: auto;
        background: var(--bg-app);
      }
      .compare-header h2 {
        margin: 0 0 0.75rem;
        font-size: 18px;
      }
      .selectors {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .ref-select {
        padding: 0.4rem 0.6rem;
        background: var(--bg-surface);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-sm);
        color: var(--fg-primary);
        font-size: 13px;
        min-width: 200px;
      }
      .arrow {
        font-size: 16px;
        color: var(--fg-muted);
      }
      .error {
        color: var(--danger);
        margin: 0.5rem 0;
        font-size: 13px;
      }
      .error button {
        margin-left: 0.4rem;
      }
      .summary {
        padding: 0.6rem 0;
        font-size: 13px;
        color: var(--fg-secondary);
        border-bottom: 1px solid var(--border-soft);
      }
      .add {
        color: var(--success);
      }
      .del {
        color: var(--danger);
      }
      .file-list {
        display: flex;
        flex-direction: column;
        max-height: 200px;
        overflow-y: auto;
        border-bottom: 1px solid var(--border-soft);
      }
      .file {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.5rem;
        background: transparent;
        border: 0;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
        text-align: left;
      }
      .file:hover {
        background: var(--bg-hover);
      }
      .file.selected {
        background: color-mix(in oklab, var(--accent) 15%, transparent);
      }
      .file .path {
        flex: 1;
        font-family: var(--font-mono);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        flex-shrink: 0;
      }
      .status-dot[data-status='added'] {
        background: var(--success);
      }
      .status-dot[data-status='deleted'] {
        background: var(--danger);
      }
      .counts {
        display: flex;
        gap: 4px;
        font-family: var(--font-mono);
        font-size: 11px;
      }
      .empty {
        padding: 2rem;
        text-align: center;
        color: var(--fg-muted);
      }
    `,
  ],
})
export class BranchCompareComponent {
  private git = inject(GitService);
  private state = inject(UiStateService);
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });
  private destroyRef = inject(DestroyRef);

  branches = this.state.branches;
  tags = this.state.tags;

  fromRef = '';
  toRef = '';
  files = signal<DiffFile[]>([]);
  activeFile = signal<DiffFile | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  compared = signal(false);

  totalAdditions = signal(0);
  totalDeletions = signal(0);
  private readonly requests = new Subject<{ from: string; to: string }>();
  private pendingActiveFile = '';
  private reportSub?: { unsubscribe(): void };

  constructor() {
    this.requests
      .pipe(
        switchMap(({ from, to }) => {
          this.loading.set(true);
          this.error.set(null);
          return this.git.getRangeDiff(from, to).pipe(
            map((files) => ({ files, error: null })),
            catchError((error) =>
              of({ files: null, error: error?.error?.error ?? 'Failed to compare' }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ files, error }) => {
        this.loading.set(false);
        this.compared.set(true);
        if (error) {
          this.error.set(error);
          return;
        }
        const next = files ?? [];
        this.files.set(next);
        this.activeFile.set(
          next.find((file) => file.file === this.pendingActiveFile) ?? next[0] ?? null,
        );
        this.totalAdditions.set(next.reduce((sum, file) => sum + file.additions, 0));
        this.totalDeletions.set(next.reduce((sum, file) => sum + file.deletions, 0));
      });
    this.route?.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const from = params.get('from')?.trim() ?? '';
      const to = params.get('to')?.trim() ?? '';
      this.pendingActiveFile = params.get('activeFile')?.trim() ?? '';
      if (!from || !to || (from === this.fromRef && to === this.toRef && this.compared())) return;
      this.fromRef = from;
      this.toRef = to;
      this.compare();
    });
    this.destroyRef.onDestroy(() => this.reportSub?.unsubscribe());
  }

  compare() {
    if (!this.fromRef || !this.toRef) return;
    void this.router?.navigate([], {
      relativeTo: this.route ?? undefined,
      queryParams: { from: this.fromRef, to: this.toRef },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.requests.next({ from: this.fromRef, to: this.toRef });
  }

  retry() {
    this.compare();
  }

  copyPortableLink() {
    if (!this.fromRef || !this.toRef) return;
    this.reportSub?.unsubscribe();
    this.reportSub = this.git
      .createPortableLink({
        view: 'compare',
        from: this.fromRef,
        to: this.toRef,
        activeFile: this.activeFile()?.file,
      })
      .subscribe(({ url }) => void navigator.clipboard.writeText(url));
  }

  copyMarkdownReport() {
    if (!this.fromRef || !this.toRef) return;
    this.reportSub?.unsubscribe();
    this.reportSub = this.git
      .getRangeReportMarkdown(this.fromRef, this.toRef)
      .subscribe((markdown) => void navigator.clipboard.writeText(markdown));
  }

  downloadReport() {
    if (!this.fromRef || !this.toRef) return;
    this.reportSub?.unsubscribe();
    this.reportSub = this.git
      .getRangeReportMarkdown(this.fromRef, this.toRef)
      .subscribe((markdown) =>
        downloadText(
          `git-investigation-${safeName(this.fromRef)}-${safeName(this.toRef)}.md`,
          markdown,
        ),
      );
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60);
}

function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
