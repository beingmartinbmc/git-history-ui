import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
    <div class="compare-header">
      <h2>Compare</h2>
      <div class="selectors">
        <select [(ngModel)]="fromRef" class="ref-select">
          <option value="">Select base ref…</option>
          <option *ngFor="let b of branches()" [value]="b">{{ b }}</option>
          <option *ngFor="let t of tags()" [value]="t">{{ t }}</option>
        </select>
        <span class="arrow">→</span>
        <select [(ngModel)]="toRef" class="ref-select">
          <option value="">Select head ref…</option>
          <option *ngFor="let b of branches()" [value]="b">{{ b }}</option>
          <option *ngFor="let t of tags()" [value]="t">{{ t }}</option>
        </select>
        <button class="btn" (click)="compare()" [disabled]="!fromRef || !toRef || loading()">
          {{ loading() ? 'Loading…' : 'Compare' }}
        </button>
      </div>
    </div>

    <div class="error" *ngIf="error() as err">{{ err }}</div>

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

    <div class="empty" *ngIf="!files().length && compared() && !loading()">
      No differences between these refs.
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

  compare() {
    if (!this.fromRef || !this.toRef) return;
    this.loading.set(true);
    this.error.set(null);
    this.git.getRangeDiff(this.fromRef, this.toRef).subscribe({
      next: (diff) => {
        this.files.set(diff);
        this.activeFile.set(diff[0] ?? null);
        this.totalAdditions.set(diff.reduce((s, f) => s + f.additions, 0));
        this.totalDeletions.set(diff.reduce((s, f) => s + f.deletions, 0));
        this.loading.set(false);
        this.compared.set(true);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to compare');
        this.loading.set(false);
        this.compared.set(true);
      },
    });
  }
}
