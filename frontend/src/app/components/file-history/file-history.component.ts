import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BreakageAnalysis, Commit, FileStats } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import { UiStateService } from '../../services/ui-state.service';
import { BlameComponent } from '../blame/blame.component';

type Tab = 'history' | 'blame' | 'breakage';

@Component({
  selector: 'app-file-history',
  standalone: true,
  imports: [CommonModule, BlameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <button class="btn btn-ghost" (click)="goBack()">← Back</button>
        <div class="title-block">
          <h2>{{ filePath() }}</h2>
          <div class="meta" *ngIf="stats() as s">
            <span>{{ s.totalCommits }} commits</span>
            <span>·</span>
            <span>{{ s.contributors.length }} contributors</span>
            <span>·</span>
            <span>first: {{ s.firstSeen | slice: 0 : 10 }}</span>
            <span>·</span>
            <span>last: {{ s.lastTouched | slice: 0 : 10 }}</span>
          </div>
        </div>
      </header>

      <nav class="tabs">
        <button class="tab" [class.active]="tab() === 'history'" (click)="tab.set('history')">
          History
        </button>
        <button class="tab" [class.active]="tab() === 'blame'" (click)="tab.set('blame')">
          Blame
        </button>
        <button
          class="tab"
          [class.active]="tab() === 'breakage'"
          (click)="onSelectBreakageTab()"
          title="Heuristic analysis of recent fixes/reverts and likely culprits."
        >
          Breakage Analysis
        </button>
      </nav>

      <section *ngIf="tab() === 'history'" class="history">
        <div class="empty" *ngIf="loading()">Loading commits…</div>
        <div class="empty error" *ngIf="error() as e">{{ e }}</div>
        <ul class="commits">
          <li
            *ngFor="let c of commits()"
            class="commit"
            [class.selected]="c.hash === state.selectedHash()"
            (click)="onSelectCommit(c.hash)"
          >
            <code class="hash">{{ c.shortHash }}</code>
            <div class="info">
              <span class="subject">{{ c.subject }}</span>
              <span class="byline">{{ c.author }} · {{ c.date | slice: 0 : 10 }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section *ngIf="tab() === 'blame'" class="blame-tab">
        <app-blame [file]="filePath()" [onCommitClick]="onSelectCommit.bind(this)" />
      </section>

      <section *ngIf="tab() === 'breakage'" class="breakage" data-testid="breakage-tab">
        <div class="empty" *ngIf="breakageLoading()">Analyzing breakage history…</div>
        <div class="empty error" *ngIf="breakageError() as e">{{ e }}</div>

        <ng-container *ngIf="breakage() as b">
          <div class="risk-card" [attr.data-level]="riskLevel()">
            <div class="risk-meter" aria-hidden="true">
              <div class="risk-meter-fill" [style.width.%]="b.riskScore"></div>
            </div>
            <div class="risk-meta">
              <span class="risk-score">{{ b.riskScore }}/100</span>
              <span class="risk-label">{{ riskLevel() }} breakage risk</span>
            </div>
            <p class="summary">{{ b.summary }}</p>
            <div class="risk-stats">
              <span
                ><strong>{{ b.commits.length }}</strong> recent touches</span
              >
              <span>·</span>
              <span
                ><strong>{{ b.fixCount }}</strong> fixes/reverts</span
              >
              <span *ngIf="b.suspects.length">·</span>
              <span *ngIf="b.suspects.length"
                ><strong>{{ b.suspects.length }}</strong> suspect{{
                  b.suspects.length === 1 ? '' : 's'
                }}</span
              >
            </div>
          </div>

          <div class="cards">
            <article class="card">
              <header class="card-head">
                <h3>Likely culprits</h3>
                <span class="hint">Scored by proximity to fix commits</span>
              </header>
              <div class="empty inline" *ngIf="!b.suspects.length">
                No prior change is strongly correlated with a recent fix.
              </div>
              <ol class="suspects" *ngIf="b.suspects.length">
                <li *ngFor="let s of b.suspects" class="suspect" (click)="onSelectCommit(s.hash)">
                  <div class="suspect-row">
                    <code class="hash">{{ s.shortHash }}</code>
                    <span class="score" [attr.data-strong]="s.score >= 8 ? 'true' : 'false'">{{
                      s.score
                    }}</span>
                    <span class="subject">{{ s.subject }}</span>
                  </div>
                  <div class="byline">
                    {{ s.author }} · {{ s.date | slice: 0 : 10 }} · {{ s.churn }} lines changed
                  </div>
                  <ul class="reasons">
                    <li *ngFor="let r of s.reasons">{{ r }}</li>
                  </ul>
                  <div class="linked" *ngIf="s.linkedFixes.length">
                    Linked fix{{ s.linkedFixes.length === 1 ? '' : 'es' }}:
                    <a
                      *ngFor="let f of s.linkedFixes; let last = last"
                      class="link"
                      (click)="$event.stopPropagation(); onSelectCommit(f.hash)"
                    >
                      <code>{{ f.shortHash }}</code
                      ><span *ngIf="!last">, </span>
                    </a>
                  </div>
                </li>
              </ol>
            </article>

            <article class="card">
              <header class="card-head">
                <h3>Fixes &amp; reverts on this file</h3>
                <span class="hint">{{ b.fixCount }} of {{ b.commits.length }} recent commits</span>
              </header>
              <div class="empty inline" *ngIf="!b.fixCommits.length">
                No fix/revert commits matched recent history.
              </div>
              <ul class="fixes" *ngIf="b.fixCommits.length">
                <li
                  *ngFor="let f of b.fixCommits"
                  class="commit"
                  [class.revert]="f.isRevert"
                  (click)="onSelectCommit(f.hash)"
                >
                  <code class="hash">{{ f.shortHash }}</code>
                  <div class="info">
                    <span class="subject">
                      <span class="tag" *ngIf="f.isRevert">revert</span>
                      <span class="tag fix" *ngIf="f.isFix">fix</span>
                      {{ f.subject }}
                    </span>
                    <span class="byline"
                      >{{ f.author }} · {{ f.date | slice: 0 : 10 }} · {{ f.churn }} lines</span
                    >
                  </div>
                </li>
              </ul>
            </article>

            <article class="card" *ngIf="b.coChangedFiles.length">
              <header class="card-head">
                <h3>Often changed together</h3>
                <span class="hint">From recent fixes &amp; suspects</span>
              </header>
              <ul class="cochanged">
                <li *ngFor="let c of b.coChangedFiles" (click)="openFile(c.file)">
                  <span class="path">{{ c.file }}</span>
                  <span class="count">{{ c.count }}×</span>
                </li>
              </ul>
            </article>

            <article class="card">
              <header class="card-head">
                <h3>Recent commits</h3>
                <span class="hint">Last {{ b.commits.length }} touches</span>
              </header>
              <ul class="recent">
                <li
                  *ngFor="let c of b.commits"
                  class="commit"
                  [class.is-fix]="c.isFix || c.isRevert"
                  (click)="onSelectCommit(c.hash)"
                >
                  <code class="hash">{{ c.shortHash }}</code>
                  <div class="info">
                    <span class="subject">
                      <span class="tag fix" *ngIf="c.isFix">fix</span>
                      <span class="tag" *ngIf="c.isRevert">revert</span>
                      {{ c.subject }}
                    </span>
                    <span class="byline"
                      >{{ c.author }} · {{ c.date | slice: 0 : 10 }} · +{{ c.additions }}/-{{
                        c.deletions
                      }}</span
                    >
                  </div>
                </li>
              </ul>
            </article>
          </div>
        </ng-container>
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
        padding: 1.1rem 1.25rem;
        max-width: 1200px;
        margin: 0 auto;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 0.9rem 1rem;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
      }
      .head h2 {
        margin: 0;
        font-size: 16px;
        font-family: var(--font-mono, monospace);
        word-break: break-all;
      }
      .meta {
        color: var(--fg-muted);
        font-size: 12px;
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-top: 0.25rem;
      }
      .tabs {
        display: flex;
        gap: 0.5rem;
        padding: 0.25rem;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: var(--bg-panel);
        margin-bottom: 1rem;
        width: fit-content;
      }
      .tab {
        background: transparent;
        border: 0;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        color: var(--fg-muted);
        border-radius: 999px;
        font-size: 13px;
      }
      .tab.active {
        color: var(--accent);
        background: var(--accent-soft);
        font-weight: 600;
      }
      .empty {
        padding: 1.5rem;
        color: var(--fg-muted);
        text-align: center;
        font-size: 13px;
      }
      .empty.error {
        color: var(--danger);
      }
      .commits {
        list-style: none;
        margin: 0;
        padding: 0.35rem;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
      }
      .commit {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        padding: 0.55rem 0.85rem;
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .commit:hover {
        background: var(--bg-elevated);
      }
      .commit.selected {
        background: color-mix(in oklab, var(--accent) 18%, transparent);
      }
      .commit .hash {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: var(--fg-muted);
        padding-top: 2px;
      }
      .commit .info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .commit .subject {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .commit .byline {
        font-size: 11px;
        color: var(--fg-muted);
        margin-top: 2px;
      }

      .breakage {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .risk-card {
        padding: 1rem 1.1rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        background: var(--bg-panel);
        box-shadow: var(--shadow-sm);
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .risk-meter {
        width: 100%;
        height: 8px;
        background: var(--bg-elevated);
        border-radius: 999px;
        overflow: hidden;
      }
      .risk-meter-fill {
        height: 100%;
        background: var(--accent);
        transition: width 0.3s ease;
      }
      .risk-card[data-level='high'] .risk-meter-fill {
        background: var(--danger, #dc2626);
      }
      .risk-card[data-level='moderate'] .risk-meter-fill {
        background: var(--warning, #d97706);
      }
      .risk-card[data-level='low'] .risk-meter-fill {
        background: var(--success, #16a34a);
      }
      .risk-meta {
        display: flex;
        gap: 0.6rem;
        align-items: baseline;
        font-size: 13px;
      }
      .risk-score {
        font-weight: 700;
        font-family: var(--font-mono, monospace);
      }
      .risk-label {
        color: var(--fg-muted);
        text-transform: capitalize;
      }
      .summary {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .risk-stats {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        font-size: 12px;
        color: var(--fg-muted);
      }
      .risk-stats strong {
        color: var(--fg);
        font-weight: 600;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 1rem;
      }
      .card {
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        padding: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        min-width: 0;
      }
      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.5rem;
      }
      .card-head h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .hint {
        font-size: 11px;
        color: var(--fg-muted);
      }
      .empty.inline {
        padding: 0.75rem;
        font-size: 12px;
      }
      .suspects,
      .fixes,
      .recent,
      .cochanged {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .suspect {
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        cursor: pointer;
        background: var(--bg-elevated);
      }
      .suspect:hover {
        border-color: var(--accent);
      }
      .suspect-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }
      .suspect-row .subject {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
      }
      .score {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 700;
      }
      .score[data-strong='true'] {
        background: color-mix(in oklab, var(--danger, #dc2626) 18%, transparent);
        color: var(--danger, #dc2626);
      }
      .reasons {
        list-style: none;
        margin: 0.35rem 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .reasons li {
        font-size: 11px;
        color: var(--fg-muted);
        padding: 1px 6px;
        border-radius: 6px;
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
      }
      .linked {
        margin-top: 0.35rem;
        font-size: 11px;
        color: var(--fg-muted);
      }
      .linked .link {
        cursor: pointer;
        color: var(--accent);
      }
      .linked code {
        font-family: var(--font-mono, monospace);
      }
      .tag {
        display: inline-block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--bg-elevated);
        color: var(--fg-muted);
        margin-right: 0.25rem;
        vertical-align: middle;
      }
      .tag.fix {
        background: color-mix(in oklab, var(--accent) 18%, transparent);
        color: var(--accent);
      }
      .commit.revert .tag,
      .commit.is-fix .tag.fix {
        font-weight: 600;
      }
      .cochanged li {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.4rem 0.6rem;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 12px;
      }
      .cochanged li:hover {
        background: var(--bg-elevated);
      }
      .cochanged .path {
        font-family: var(--font-mono, monospace);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .cochanged .count {
        color: var(--fg-muted);
        flex-shrink: 0;
      }
    `,
  ],
})
export class FileHistoryComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private git = inject(GitService);
  private insightsApi = inject(InsightsService);
  state = inject(UiStateService);

  readonly filePath = signal<string>('');
  readonly stats = signal<FileStats | null>(null);
  readonly commits = signal<Commit[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<Tab>('history');

  readonly breakage = signal<BreakageAnalysis | null>(null);
  readonly breakageLoading = signal<boolean>(false);
  readonly breakageError = signal<string | null>(null);
  readonly riskLevel = computed<'low' | 'moderate' | 'high'>(() => {
    const score = this.breakage()?.riskScore ?? 0;
    if (score >= 60) return 'high';
    if (score >= 30) return 'moderate';
    return 'low';
  });

  constructor() {
    effect(() => {
      const raw = this.route.snapshot.paramMap.get('path') ?? '';
      const decoded = decodeURIComponent(raw);
      const requestedTab = this.route.snapshot.queryParamMap.get('tab');
      if (requestedTab === 'breakage' || requestedTab === 'blame' || requestedTab === 'history') {
        this.tab.set(requestedTab);
      }
      this.filePath.set(decoded);
      if (decoded) {
        this.load(decoded);
      }
    });
  }

  onSelectCommit(hash: string) {
    this.state.selectHash(hash);
    this.router.navigate(['/'], { queryParams: { commit: hash } });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  onSelectBreakageTab() {
    this.tab.set('breakage');
    if (!this.breakage() && !this.breakageLoading()) {
      this.loadBreakage(this.filePath());
    }
  }

  openFile(file: string) {
    if (!file) return;
    this.router.navigate(['/file', encodeURIComponent(file)]);
  }

  private load(file: string) {
    this.loading.set(true);
    this.error.set(null);
    this.breakage.set(null);
    this.breakageError.set(null);
    this.insightsApi.fileStats(file).subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(null),
    });
    this.git.getCommits({ file, page: 1, pageSize: 200 }).subscribe({
      next: (r) => {
        this.commits.set(r.commits);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to load file history');
        this.loading.set(false);
      },
    });
    if (this.tab() === 'breakage') {
      this.loadBreakage(file);
    }
  }

  private loadBreakage(file: string) {
    if (!file) return;
    this.breakageLoading.set(true);
    this.breakageError.set(null);
    this.insightsApi.breakage(file).subscribe({
      next: (b) => {
        this.breakage.set(b);
        this.breakageLoading.set(false);
      },
      error: (err) => {
        this.breakageError.set(err?.error?.error ?? 'Failed to analyze breakage');
        this.breakageLoading.set(false);
      },
    });
  }
}
