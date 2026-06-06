import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WrappedStats } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import {
  WRAPPED_PALETTES,
  WRAPPED_TEMPLATES,
  WrappedCardRenderer,
  WrappedTemplateId,
} from '../../services/wrapped-card-renderer';

@Component({
  selector: 'app-wrapped',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
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
              <option *ngFor="let a of authors()" [value]="a">{{ a }}</option>
            </select>
          </label>
        </div>
      </header>

      <div class="empty" *ngIf="loading()">Computing your year in review…</div>
      <div class="empty error" *ngIf="error() as e">{{ e }}</div>

      <div class="layout" *ngIf="stats() as s">
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
            ⧉ Copy to clipboard
          </button>
          <p class="note" *ngIf="status() as msg">{{ msg }}</p>
          <p class="hint">
            Everything is computed locally from your git history — nothing leaves your machine.
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

  readonly stats = signal<WrappedStats | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<boolean>(false);
  readonly status = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly authors = signal<string[]>([]);

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
    this.git.getAuthors().subscribe({
      next: (a) => this.authors.set(a),
      error: () => this.authors.set([]),
    });
    this.load();
  }

  canShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  }

  setYear(y: number): void {
    this.year.set(Number(y));
    this.load();
  }

  setAuthor(a: string): void {
    this.author.set(a ?? '');
    this.load();
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

  private repoName(): string {
    const title = (document.title || '').replace(/\s*[-–|·].*$/, '').trim();
    return title && title.toLowerCase() !== 'git history' ? title : 'this repository';
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.status.set(null);
    this.insightsApi
      .wrapped({ year: this.year(), author: this.author().trim() || undefined })
      .subscribe({
        next: (s) => {
          this.stats.set(s);
          this.loading.set(false);
          this.refreshPreview(s);
        },
        error: (err) => {
          this.error.set(err?.error?.error ?? 'Failed to compute Git Wrapped');
          this.loading.set(false);
        },
      });
  }

  private refreshPreview(s: WrappedStats): void {
    try {
      this.previewUrl.set(this.renderer.toDataUrl(s, this.repoName(), this.cardOptions()));
    } catch {
      this.previewUrl.set(null);
    }
  }

  private fileName(): string {
    return `git-wrapped-${this.year()}-${this.template()}-${this.paletteId()}.png`;
  }

  async download(): Promise<void> {
    const s = this.stats();
    if (!s) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const blob = await this.renderer.toBlob(s, this.repoName());
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
      const blob = await this.renderer.toBlob(s, this.repoName());
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Git Wrapped ${this.year()}`,
          text: `My Git Wrapped for ${this.year()} 🎁`,
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
      const blob = await this.renderer.toBlob(s, this.repoName(), this.cardOptions());
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
}
