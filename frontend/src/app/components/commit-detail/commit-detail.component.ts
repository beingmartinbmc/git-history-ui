import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AnnotationComment, CommitImpact, DiffFile } from '../../models/git.models';
import { AnnotationsService } from '../../services/annotations.service';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import { UiStateService } from '../../services/ui-state.service';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';
import { ImpactGraphComponent } from '../impact-graph/impact-graph.component';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-commit-detail',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    DiffViewerComponent,
    ImpactGraphComponent,
    MarkdownPipe,
  ],
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

        <div class="actions">
          <button class="btn btn-ghost btn-sm" (click)="onExplain()" [disabled]="explaining()">
            {{ explaining() ? '...' : '✨ Explain change' }}
          </button>
          <button
            class="btn btn-ghost btn-sm"
            (click)="onLoadImpact()"
            [disabled]="loadingImpact()"
          >
            {{ loadingImpact() ? '...' : impact() ? 'Refresh impact' : 'Show impact' }}
          </button>
          <button class="btn btn-ghost btn-sm" (click)="copyShareLink()">
            {{ shareCopied() ? 'Copied!' : '🔗 Share' }}
          </button>
        </div>

        <div class="ai-card" *ngIf="explanation() as e">
          <span class="ai-pill">AI</span>
          <div class="ai-text" [innerHTML]="e | markdown"></div>
          <button class="btn btn-ghost btn-icon close" (click)="explanation.set(null)">×</button>
        </div>
        <div class="ai-card error" *ngIf="explainError() as e">{{ e }}</div>
      </header>

      <div class="impact-card" *ngIf="impact() as imp">
        <div class="impact-head">
          <span>Impact</span>
          <span class="impact-meta">
            {{ imp.files.length }} files · {{ imp.modules.length }} modules ·
            {{ imp.relatedCommits.length }} related commits
          </span>
        </div>
        <app-impact-graph [impact]="imp" />
        <div class="impact-body">
          <div>
            <h4>Modules</h4>
            <ul class="modules">
              <li *ngFor="let m of imp.modules">{{ m }}</li>
            </ul>
          </div>
          <div>
            <h4>Related commits</h4>
            <ul class="related">
              <li *ngFor="let r of imp.relatedCommits" (click)="state.selectHash(r.hash)">
                <code>{{ r.hash.slice(0, 7) }}</code>
                <span>{{ r.subject }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="split">
        <aside class="files">
          <div class="files-header">
            <span>Files</span>
            <span class="count" *ngIf="files().length">{{ files().length }}</span>
          </div>
          <div class="files-list">
            <div *ngFor="let f of files(); trackBy: trackByFile" class="file-row">
              <button
                class="file"
                [class.selected]="f.file === activeFile()?.file"
                (click)="selectFile(f)"
              >
                <span class="status-dot" [attr.data-status]="f.status"></span>
                <span class="path" [title]="f.file">{{ f.file }}</span>
                <span class="counts">
                  <span class="add" *ngIf="f.additions">+{{ f.additions }}</span>
                  <span class="del" *ngIf="f.deletions">−{{ f.deletions }}</span>
                </span>
              </button>
              <button
                class="file-history"
                (click)="openFileHistory(f.file)"
                title="View file history"
              >
                ⏱
              </button>
              <button
                class="file-history breakage"
                (click)="openFileBreakage(f.file)"
                title="Why did this break? Open breakage analysis"
                aria-label="Open breakage analysis for this file"
              >
                ⚠
              </button>
            </div>
            <div class="files-empty" *ngIf="!files().length && !loading()">No files changed.</div>
            <div class="files-empty" *ngIf="loading()">Loading…</div>
          </div>
        </aside>
        <section class="diff">
          <details class="annotations" [open]="annotationsOpen()">
            <summary (click)="toggleAnnotations($event)">
              💬 Notes ({{ comments().length }})
            </summary>
            <div class="annot-body">
              <div class="comment" *ngFor="let c of comments()">
                <div class="comment-head">
                  <strong>{{ c.author }}</strong>
                  <span class="comment-date">{{ c.createdAt | date: 'short' }}</span>
                  <button
                    class="btn btn-ghost btn-icon"
                    (click)="deleteComment(c.id)"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
                <p class="comment-body">{{ c.body }}</p>
              </div>
              <div class="comment-form">
                <input class="input" placeholder="Your name" [(ngModel)]="commentAuthor" />
                <textarea
                  class="input"
                  placeholder="Add a note for your team…"
                  [(ngModel)]="commentDraft"
                ></textarea>
                <button class="btn" (click)="addComment()" [disabled]="!commentDraft.trim()">
                  Post
                </button>
              </div>
            </div>
          </details>
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
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: transparent;
      }
      .head {
        position: sticky;
        top: 0;
        z-index: 3;
        padding: 0.9rem 1rem 0.8rem;
        border-bottom: 1px solid var(--border-soft);
        background: color-mix(in oklab, var(--bg-glass) 95%, transparent);
        backdrop-filter: blur(14px);
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
        background: color-mix(in oklab, var(--bg-surface-2) 78%, transparent);
        border: 1px solid var(--border-soft);
        border-radius: 999px;
      }
      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-height: 44px;
        overflow: hidden;
      }
      .badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid transparent;
        max-width: 180px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .badge.tag {
        background: rgba(217, 119, 6, 0.15);
        color: var(--warning);
        border-color: color-mix(in oklab, var(--warning) 24%, transparent);
      }
      .badge.branch {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: color-mix(in oklab, var(--accent) 24%, transparent);
      }
      .badge.merge {
        background: rgba(139, 92, 246, 0.18);
        color: #8b5cf6;
      }
      .subject {
        font-size: clamp(17px, 1.6vw, 22px);
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
      .meta .dot {
        opacity: 0.5;
      }
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
        grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        gap: 0.75rem;
        padding: 0.75rem;
        min-height: 0;
        overflow: hidden;
      }
      .files {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
      }
      .files-header {
        display: flex;
        justify-content: space-between;
        padding: 0.6rem 0.85rem;
        font-size: 12px;
        color: var(--fg-muted);
        border-bottom: 1px solid var(--border-soft);
        background: color-mix(in oklab, var(--bg-surface) 82%, transparent);
      }
      .count {
        background: var(--bg-surface-2);
        padding: 0 6px;
        border-radius: 999px;
        font-size: 11px;
      }
      .files-list {
        overflow: auto;
        flex: 1;
        min-height: 0;
      }
      .file {
        display: grid;
        grid-template-columns: 10px 1fr auto;
        gap: 0.5rem;
        align-items: center;
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: left;
        border-bottom: 1px solid var(--border-soft);
        font-size: 12px;
      }
      .file:hover {
        background: color-mix(in oklab, var(--bg-hover) 74%, transparent);
      }
      .file.selected {
        background: color-mix(in oklab, var(--accent) 15%, transparent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
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
      .status-dot[data-status='added'] {
        background: var(--success);
      }
      .status-dot[data-status='deleted'] {
        background: var(--danger);
      }
      .status-dot[data-status='renamed'],
      .status-dot[data-status='copied'] {
        background: var(--warning);
      }
      .status-dot[data-status='binary'] {
        background: var(--fg-muted);
      }
      .counts {
        display: flex;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11px;
      }
      .counts .add {
        color: var(--success);
      }
      .counts .del {
        color: var(--danger);
      }
      .files-empty {
        padding: 1rem;
        color: var(--fg-muted);
        font-size: 12px;
        text-align: center;
      }

      .diff {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--radius-md);
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        box-shadow: var(--shadow-sm);
      }
      .placeholder {
        flex: 1;
        display: grid;
        place-items: center;
        text-align: center;
        color: var(--fg-muted);
      }
      .placeholder .title {
        font-size: 16px;
        margin-bottom: 4px;
        color: var(--fg-secondary);
      }
      .placeholder .hint {
        font-size: 13px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.6rem;
      }
      .btn-sm {
        font-size: 11px;
        padding: 0.3rem 0.65rem;
      }

      .ai-card {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.55rem 0.75rem;
        margin-top: 0.5rem;
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        border-radius: var(--radius-sm);
        font-size: 12px;
        color: var(--fg-secondary);
        max-height: min(280px, 32vh);
        overflow: hidden;
      }
      .ai-card.error {
        background: rgba(239, 68, 68, 0.12);
        color: var(--danger);
      }
      .ai-pill {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        background: var(--accent);
        color: var(--accent-fg);
        padding: 1px 5px;
        border-radius: 4px;
      }
      .ai-text {
        flex: 1;
        min-width: 0;
        min-height: 0;
        max-height: calc(min(280px, 32vh) - 1.1rem);
        line-height: 1.6;
        font-size: 0.85rem;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 0.45rem;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }
      .ai-text::-webkit-scrollbar {
        width: 8px;
      }
      .ai-text::-webkit-scrollbar-track {
        background: transparent;
      }
      .ai-text::-webkit-scrollbar-thumb {
        background: color-mix(in oklab, var(--accent) 40%, transparent);
        border-radius: 999px;
      }
      .ai-text h2,
      .ai-text h3,
      .ai-text h4 {
        margin: 0.6rem 0 0.3rem;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--text-primary, #e2e8f0);
      }
      .ai-text h2 {
        font-size: 1rem;
      }
      .ai-text p {
        margin: 0.25rem 0;
      }
      .ai-text ul,
      .ai-text ol {
        margin: 0.3rem 0;
        padding-left: 1.4rem;
      }
      .ai-text li {
        margin: 0.15rem 0;
      }
      .ai-text code {
        background: rgba(139, 92, 246, 0.15);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.82em;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }
      .ai-text pre {
        background: rgba(0, 0, 0, 0.25);
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        overflow-x: auto;
        margin: 0.4rem 0;
      }
      .ai-text pre code {
        background: none;
        padding: 0;
      }
      .ai-text strong {
        color: var(--text-primary, #e2e8f0);
      }
      .ai-card .close {
        flex-shrink: 0;
        font-size: 14px;
        line-height: 1;
        padding: 0 6px;
      }

      .impact-card {
        margin: 0.6rem 1rem;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        padding: 0.75rem 1rem;
        box-shadow: var(--shadow-sm);
      }
      .impact-head {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
        margin-bottom: 0.5rem;
        font-size: 13px;
      }
      .impact-meta {
        color: var(--fg-muted);
        font-weight: 400;
        font-size: 11px;
      }
      .impact-body {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 0.75rem;
        font-size: 12px;
      }
      .impact-body h4 {
        margin: 0 0 0.4rem;
        font-size: 11px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .impact-body ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .impact-body li {
        padding: 2px 0;
        word-break: break-all;
      }
      .modules li {
        font-family: var(--font-mono, monospace);
      }
      .ripple li {
        font-size: 11px;
        color: var(--fg-secondary);
      }
      .related li {
        cursor: pointer;
        display: flex;
        gap: 0.4rem;
      }
      .related li:hover {
        color: var(--accent);
      }
      .related code {
        font-family: var(--font-mono, monospace);
        color: var(--fg-muted);
        flex-shrink: 0;
      }
      .impact-body .muted {
        color: var(--fg-muted);
        font-style: italic;
        margin: 0;
        font-size: 11px;
      }

      .file-row {
        display: flex;
      }
      .file-row .file {
        flex: 1;
      }
      .file-history {
        background: transparent;
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        cursor: pointer;
        color: var(--fg-muted);
        padding: 0 0.6rem;
        font-size: 12px;
      }
      .file-history:hover {
        background: var(--bg-elevated);
        color: var(--accent);
      }
      .file-history.breakage:hover {
        color: var(--danger, #dc2626);
      }

      .annotations {
        margin: 0.5rem;
        background: var(--bg-surface);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-sm);
      }
      .annotations summary {
        padding: 0.4rem 0.7rem;
        cursor: pointer;
        font-size: 12px;
        color: var(--fg-secondary);
        user-select: none;
      }
      .annotations[open] summary {
        border-bottom: 1px solid var(--border-soft);
      }
      .annot-body {
        padding: 0.5rem 0.7rem;
      }
      .comment {
        padding: 0.4rem 0;
        border-bottom: 1px dashed var(--border-soft);
        font-size: 12px;
      }
      .comment:last-of-type {
        border-bottom: 0;
      }
      .comment-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .comment-date {
        color: var(--fg-muted);
        font-size: 11px;
        flex: 1;
      }
      .comment-body {
        margin: 0.2rem 0 0;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .comment-form {
        display: flex;
        gap: 0.4rem;
        flex-direction: column;
        margin-top: 0.5rem;
      }
      .comment-form .input {
        width: 100%;
        padding: 0.35rem 0.5rem;
        background: var(--bg-app);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-sm);
        color: var(--fg-primary);
        font-family: inherit;
        font-size: 12px;
      }
      .comment-form textarea {
        min-height: 60px;
        resize: vertical;
      }
      .comment-form .btn {
        align-self: flex-end;
      }
    `,
  ],
})
export class CommitDetailComponent {
  state = inject(UiStateService);
  private git = inject(GitService);
  private insightsApi = inject(InsightsService);
  private annotationsApi = inject(AnnotationsService);
  private router = inject(Router);

  commit = this.state.selected;

  readonly impact = signal<CommitImpact | null>(null);
  readonly loadingImpact = signal<boolean>(false);
  readonly explanation = signal<string | null>(null);
  readonly explainError = signal<string | null>(null);
  readonly explaining = signal<boolean>(false);
  readonly comments = signal<AnnotationComment[]>([]);
  readonly annotationsOpen = signal<boolean>(false);
  readonly shareCopied = signal<boolean>(false);

  commentDraft = '';
  commentAuthor = 'me';

  loading = signal(false);

  files = toSignal(
    toObservable(this.commit).pipe(
      switchMap((c) => {
        if (!c) {
          this.loading.set(false);
          return of([] as DiffFile[]);
        }
        this.loading.set(true);
        return this.git.getDiff(c.hash).pipe(catchError(() => of([] as DiffFile[])));
      }),
    ),
    { initialValue: [] as DiffFile[] },
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
      void this.files();
      this.activeFileIndex.set(0);
      this.loading.set(false);
    });

    // Whenever the selected commit changes, reset side-panel state and load annotations.
    effect(() => {
      const c = this.commit();
      this.impact.set(null);
      this.explanation.set(null);
      this.explainError.set(null);
      this.shareCopied.set(false);
      if (!c) {
        this.comments.set([]);
        return;
      }
      this.annotationsApi.list(c.hash).subscribe({
        next: (list) => this.comments.set(list),
        error: () => this.comments.set([]),
      });
    });
  }

  trackByFile(_: number, f: DiffFile) {
    return f.file;
  }

  selectFile(f: DiffFile) {
    const idx = this.files().findIndex((x) => x.file === f.file);
    if (idx >= 0) this.activeFileIndex.set(idx);
  }

  openFileHistory(file: string) {
    this.router.navigate(['/file', encodeURIComponent(file)]);
  }

  openFileBreakage(file: string) {
    this.router.navigate(['/file', encodeURIComponent(file)], {
      queryParams: { tab: 'breakage' },
    });
  }

  shortPath(p: string): string {
    if (p.length <= 32) return p;
    const parts = p.split('/');
    if (parts.length <= 2) return p;
    return parts[0] + '/.../' + parts.slice(-2).join('/');
  }

  onLoadImpact() {
    const c = this.commit();
    if (!c) return;
    this.loadingImpact.set(true);
    this.insightsApi.impact(c.hash).subscribe({
      next: (i) => {
        this.impact.set(i);
        this.loadingImpact.set(false);
      },
      error: () => this.loadingImpact.set(false),
    });
  }

  onExplain() {
    const c = this.commit();
    if (!c || this.explaining()) return;
    this.explaining.set(true);
    this.explainError.set(null);
    this.insightsApi.explainCommit(c.hash).subscribe({
      next: (r) => {
        this.explanation.set(r.summary);
        this.explaining.set(false);
      },
      error: (err) => {
        this.explainError.set(
          err?.error?.error ??
            'AI explanation unavailable. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        );
        this.explaining.set(false);
      },
    });
  }

  copyShareLink() {
    const c = this.commit();
    if (!c) return;
    const url = `${window.location.origin}/?commit=${c.hash}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        this.shareCopied.set(true);
        setTimeout(() => this.shareCopied.set(false), 1500);
      })
      .catch(() => {
        this.shareCopied.set(false);
      });
  }

  toggleAnnotations(_event: Event) {
    setTimeout(() => this.annotationsOpen.set(!this.annotationsOpen()), 0);
  }

  addComment() {
    const c = this.commit();
    if (!c || !this.commentDraft.trim()) return;
    this.annotationsApi
      .add(c.hash, this.commentAuthor || 'anonymous', this.commentDraft.trim())
      .subscribe({
        next: (created) => {
          this.comments.set([...this.comments(), created]);
          this.commentDraft = '';
        },
      });
  }

  deleteComment(id: string) {
    const c = this.commit();
    if (!c) return;
    this.annotationsApi.remove(c.hash, id).subscribe({
      next: () => this.comments.set(this.comments().filter((x) => x.id !== id)),
    });
  }
}
