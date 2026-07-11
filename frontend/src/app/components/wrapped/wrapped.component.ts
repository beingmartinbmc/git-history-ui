import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { GitAuthorIdentity, WrappedStats } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import {
  WRAPPED_PALETTES,
  WRAPPED_TEMPLATES,
  CANONICAL_PROJECT_URL,
  WrappedCardRenderer,
  WrappedTemplateId,
} from '../../services/wrapped-card-renderer';

export function sanitizeFileNamePart(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'repository'
  );
}

export function wrappedCaption(stats: WrappedStats, repoName: string, limit = 280): string {
  const standout =
    stats.superlatives.longestStreakDays > 1
      ? `${stats.superlatives.longestStreakDays}-day commit streak`
      : `${stats.totalCommits.toLocaleString('en-US')} commits`;
  const suffix = ` — ${standout}. #GitWrapped ${CANONICAL_PROJECT_URL}`;
  const available = Math.max(1, limit - suffix.length);
  const repo =
    repoName.length > available ? `${repoName.slice(0, Math.max(1, available - 1))}…` : repoName;
  return `${repo}${suffix}`.slice(0, limit);
}

export function wrappedSocialUrl(platform: 'bluesky' | 'x', caption: string): string {
  const base =
    platform === 'bluesky'
      ? 'https://bsky.app/intent/compose?text='
      : 'https://twitter.com/intent/tweet?text=';
  return `${base}${encodeURIComponent(caption)}`;
}

@Component({
  selector: 'app-wrapped',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" [attr.aria-busy]="loading()">
      <header class="head">
        <div>
          <p class="eyebrow">Year in review</p>
          <h2>Git Wrapped</h2>
        </div>
        <div class="controls">
          <label class="field">
            <span>Year</span>
            <select [ngModel]="year()" (ngModelChange)="setYear($event)">
              <option *ngFor="let y of years()" [ngValue]="y">{{ y }}</option>
            </select>
          </label>
          <label class="field">
            <span>Author</span>
            <select [ngModel]="author()" (ngModelChange)="setAuthor($event)">
              <option value="">All contributors</option>
              <option *ngFor="let a of authors()" [value]="a.email">
                {{ authorLabel(a) }}
              </option>
            </select>
          </label>
        </div>
      </header>

      <div class="empty" *ngIf="loading() && !stats()">Computing your year in review…</div>
      <div class="empty error" role="alert" aria-live="assertive" *ngIf="error() as e">
        {{ e }} <button type="button" (click)="retry()">Retry</button>
      </div>
      <div class="empty" *ngIf="!loading() && !error() && stats()?.totalCommits === 0">
        No commits were found for this selection.
      </div>

      <div class="layout" *ngIf="nonEmptyStats() as s">
        <div class="preview-wrap">
          <img *ngIf="previewUrl() as url" [src]="url" alt="Git Wrapped card preview" />
        </div>

        <aside class="actions">
          <div class="stat-grid">
            <div class="mini">
              <strong>{{ s.totalCommits }}</strong
              ><span>commits</span>
            </div>
            <div class="mini">
              <strong>{{ s.totalAuthors }}</strong
              ><span>contributors</span>
            </div>
            <div class="mini">
              <strong>{{ s.totalFilesTouched }}</strong
              ><span>files</span>
            </div>
            <div class="mini">
              <strong>{{ s.nightOwlPercent }}%</strong><span>night owl</span>
            </div>
          </div>

          <div class="customize">
            <p class="section-label">Template</p>
            <div class="template-grid">
              <button
                *ngFor="let t of templates"
                type="button"
                class="template-chip"
                [class.selected]="template() === t.id"
                (click)="setTemplate(t.id)"
                [attr.aria-pressed]="template() === t.id"
                [title]="t.description"
              >
                <span class="t-name">{{ t.name }}</span>
                <span class="t-desc">{{ t.description }}</span>
              </button>
            </div>

            <p class="section-label">Color scheme</p>
            <div class="palette-grid">
              <button
                *ngFor="let p of palettes"
                type="button"
                class="swatch"
                [class.selected]="paletteId() === p.id"
                (click)="setPalette(p.id)"
                [attr.aria-pressed]="paletteId() === p.id"
                [attr.aria-label]="p.name"
                [title]="p.name"
                [style.background]="swatchGradient(p.stops)"
              ></button>
            </div>
          </div>

          <button class="primary" type="button" (click)="download()" [disabled]="busy()">
            ⬇ Download card (PNG)
          </button>
          <button
            class="ghost"
            type="button"
            (click)="share()"
            *ngIf="canShare()"
            [disabled]="busy()"
          >
            ↗ Share…
          </button>
          <button class="ghost" type="button" (click)="copy()" [disabled]="busy()">
            ⧉ Copy image
          </button>
          <button class="ghost" type="button" (click)="copyCaption()" [disabled]="busy()">
            Copy caption
          </button>
          <button class="ghost" type="button" (click)="post('bluesky')" [disabled]="busy()">
            Post on Bluesky
          </button>
          <button class="ghost" type="button" (click)="post('x')" [disabled]="busy()">
            Post on X
          </button>
          <p class="note" role="status" aria-live="polite" aria-atomic="true">
            {{ status() }}
          </p>
          <p class="hint">
            The card is computed locally. Social actions only open a pre-filled compose page.
          </p>
        </aside>
      </div>
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
        max-width: 1100px;
        margin: 0 auto;
      }
      .head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
      }
      .eyebrow {
        margin: 0 0 0.2rem;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .head h2 {
        margin: 0;
        font-size: clamp(20px, 2vw, 28px);
        letter-spacing: -0.03em;
      }
      .controls {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 11px;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .field select,
      .field input {
        padding: 0.45rem 0.6rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        background: var(--bg-panel);
        color: var(--fg-primary);
        font-size: 13px;
        text-transform: none;
        letter-spacing: normal;
      }
      .empty {
        padding: 2rem;
        color: var(--fg-muted);
        text-align: center;
      }
      .empty.error {
        color: var(--danger);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 1.5rem;
        align-items: start;
      }
      .preview-wrap {
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        padding: 1rem;
        box-shadow: var(--shadow-sm);
        display: flex;
        justify-content: center;
      }
      .preview-wrap img {
        width: 100%;
        max-width: 420px;
        height: auto;
        border-radius: 16px;
        box-shadow: var(--shadow-md);
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        position: sticky;
        top: 1rem;
      }
      .stat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }
      .mini {
        display: flex;
        flex-direction: column;
        padding: 0.6rem 0.75rem;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
      }
      .mini strong {
        font-size: 22px;
        letter-spacing: -0.03em;
      }
      .mini span {
        color: var(--fg-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      button {
        padding: 0.65rem 0.9rem;
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid var(--border-soft);
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .primary {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }
      .ghost {
        background: var(--bg-panel);
        color: var(--fg-primary);
      }
      .note {
        margin: 0.25rem 0 0;
        font-size: 12px;
        color: var(--accent);
      }
      .hint {
        margin: 0.5rem 0 0;
        font-size: 11px;
        color: var(--fg-muted);
        line-height: 1.5;
      }
      @media (max-width: 820px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .actions {
          position: static;
        }
      }
    `,
  ],
})
export class WrappedComponent {
  private insightsApi = inject(InsightsService);
  private renderer = inject(WrappedCardRenderer);
  private git = inject(GitService);
  private route = inject(ActivatedRoute, { optional: true });

  readonly stats = signal<WrappedStats | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<boolean>(false);
  readonly status = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly authors = signal<GitAuthorIdentity[]>([]);
  readonly repositoryName = signal<string>('Local repository');
  readonly nonEmptyStats = computed(() => {
    const stats = this.stats();
    return stats && stats.totalCommits > 0 ? stats : null;
  });
  private readonly requests = new Subject<{ year: number; author?: string }>();

  readonly year = signal<number>(new Date().getFullYear());
  readonly author = signal<string>('');
  readonly template = signal<WrappedTemplateId>('classic');
  readonly paletteId = signal<string>(WRAPPED_PALETTES[0].id);

  readonly templates = WRAPPED_TEMPLATES;
  readonly palettes = WRAPPED_PALETTES;

  readonly years = computed(() => {
    const current = new Date().getFullYear();
    const out: number[] = [];
    for (let y = current; y >= current - 9; y--) out.push(y);
    return out;
  });

  constructor() {
    this.requests
      .pipe(
        switchMap((options) => {
          this.loading.set(true);
          this.error.set(null);
          this.status.set(null);
          return this.insightsApi.wrapped(options).pipe(
            map((stats) => ({ stats, error: null })),
            catchError((error) =>
              of({
                stats: null,
                error: error?.error?.error ?? 'Failed to compute Git Wrapped',
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ stats, error }) => {
        this.loading.set(false);
        if (error) {
          this.error.set(error);
          return;
        }
        this.stats.set(stats);
        if (stats) this.refreshPreview(stats);
      });
    const params = this.route?.snapshot.queryParamMap;
    const year = Number(params?.get('year'));
    if (Number.isInteger(year) && year >= 1970 && year <= 9999) this.year.set(year);
    this.author.set(params?.get('author')?.trim() ?? '');
    const template = params?.get('template');
    if (this.templates.some((item) => item.id === template)) {
      this.template.set(template as WrappedTemplateId);
    }
    const palette = params?.get('palette');
    if (this.palettes.some((item) => item.id === palette)) this.paletteId.set(palette!);
    forkJoin({
      repository: this.git.getRepository().pipe(catchError(() => of(null))),
      authors: this.git.getAuthorIdentities().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed())
      .subscribe(({ repository, authors }) => {
        this.repositoryName.set(repository?.name?.trim() || 'Local repository');
        this.authors.set(authors);
        if (!this.author() && repository?.currentAuthor.email) {
          this.author.set(repository.currentAuthor.email);
        }
        this.retry();
      });
  }

  canShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  }

  setYear(y: number): void {
    this.year.set(Number(y));
    this.retry();
  }

  setAuthor(a: string): void {
    this.author.set(a ?? '');
    this.retry();
  }

  setTemplate(id: WrappedTemplateId): void {
    this.template.set(id);
    const s = this.stats();
    if (s) this.refreshPreview(s);
  }

  setPalette(id: string): void {
    this.paletteId.set(id);
    const s = this.stats();
    if (s) this.refreshPreview(s);
  }

  swatchGradient(stops: readonly [string, string, string]): string {
    return `linear-gradient(135deg, ${stops[0]}, ${stops[1]} 50%, ${stops[2]})`;
  }

  private cardOptions(): { template: WrappedTemplateId; paletteId: string } {
    return { template: this.template(), paletteId: this.paletteId() };
  }

  authorLabel(author: GitAuthorIdentity): string {
    const duplicateName = this.authors().some(
      (item) =>
        item !== author && item.name.toLocaleLowerCase() === author.name.toLocaleLowerCase(),
    );
    return duplicateName ? `${author.name} <${author.email}>` : author.name;
  }

  retry(): void {
    this.requests.next({ year: this.year(), author: this.author().trim() || undefined });
  }

  private refreshPreview(s: WrappedStats): void {
    try {
      this.previewUrl.set(this.renderer.toDataUrl(s, this.repositoryName(), this.cardOptions()));
    } catch {
      this.previewUrl.set(null);
    }
  }

  private fileName(): string {
    return `git-wrapped-${sanitizeFileNamePart(this.repositoryName())}-${this.year()}-${this.template()}-${this.paletteId()}.png`;
  }

  async download(): Promise<void> {
    const s = this.stats();
    if (!s) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const blob = await this.renderer.toBlob(s, this.repositoryName(), this.cardOptions());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName();
      a.click();
      URL.revokeObjectURL(url);
      this.status.set('Saved your card.');
    } catch {
      this.status.set('Could not generate the image.');
    } finally {
      this.busy.set(false);
    }
  }

  async share(): Promise<void> {
    const s = this.stats();
    if (!s) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const blob = await this.renderer.toBlob(s, this.repositoryName(), this.cardOptions());
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Git Wrapped ${this.year()}`,
          text: wrappedCaption(s, this.repositoryName()),
        });
        this.status.set('Shared.');
      } else {
        await this.download();
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        this.status.set('Sharing was not available; try downloading instead.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    const s = this.stats();
    if (!s) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const blob = await this.renderer.toBlob(s, this.repositoryName(), this.cardOptions());
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.status.set('Copied to clipboard.');
      } else {
        await this.download();
      }
    } catch {
      this.status.set('Clipboard not available; downloaded instead.');
      await this.download();
    } finally {
      this.busy.set(false);
    }
  }

  async copyCaption(): Promise<void> {
    const s = this.stats();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(wrappedCaption(s, this.repositoryName()));
      this.status.set('Caption copied.');
    } catch {
      this.status.set('Could not copy the caption.');
    }
  }

  post(platform: 'bluesky' | 'x'): void {
    const s = this.stats();
    if (!s) return;
    const limit = platform === 'bluesky' ? 300 : 280;
    const opened = window.open(
      wrappedSocialUrl(platform, wrappedCaption(s, this.repositoryName(), limit)),
      '_blank',
      'noopener,noreferrer',
    );
    this.status.set(opened ? `Opened ${platform === 'x' ? 'X' : 'Bluesky'}.` : 'Pop-up blocked.');
  }
}
