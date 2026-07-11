import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
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

      <section *ngIf="tab() === 'history'" class="history" [attr.aria-busy]="loading()">
        <div class="empty" *ngIf="loading() && commits().length === 0">Loading commits…</div>
        <div class="empty error" *ngIf="error() as e">
          {{ e }} <button type="button" (click)="retryHistory()">Retry</button>
        </div>
        <div class="empty" *ngIf="!loading() && !error() && commits().length === 0">
          No commits found for this file.
        </div>
        <ul class="commits">
          <li *ngFor="let c of commits()">
            <button
              type="button"
              class="commit"
              [class.selected]="c.hash === state.selectedHash()"
              (click)="onSelectCommit(c.hash)"
            >
              <code class="hash">{{ c.shortHash }}</code>
              <span class="info">
                <span class="subject">{{ c.subject }}</span>
                <span class="byline">{{ c.author }} · {{ c.date | slice: 0 : 10 }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section *ngIf="tab() === 'blame'" class="blame-tab">
        <app-blame [file]="filePath()" [onCommitClick]="onSelectCommit.bind(this)" />
      </section>

      <section
        *ngIf="tab() === 'breakage'"
        class="breakage"
        data-testid="breakage-tab"
        [attr.aria-busy]="breakageLoading()"
      >
        <div class="empty" *ngIf="breakageLoading() && !breakage()">
          Analyzing breakage history…
        </div>
        <div class="empty error" *ngIf="breakageError() as e">
          {{ e }} <button type="button" (click)="retryBreakage()">Retry</button>
        </div>

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
                <li *ngFor="let s of b.suspects" class="suspect">
                  <button type="button" class="suspect-select" (click)="onSelectCommit(s.hash)">
                    <span class="suspect-row">
                      <code class="hash">{{ s.shortHash }}</code>
                      <span class="score" [attr.data-strong]="s.score >= 8 ? 'true' : 'false'">{{
                        s.score
                      }}</span>
                      <span class="subject">{{ s.subject }}</span>
                    </span>
                    <span class="byline">
                      {{ s.author }} · {{ s.date | slice: 0 : 10 }} · {{ s.churn }} lines changed
                    </span>
                  </button>
                  <ul class="reasons">
                    <li *ngFor="let r of s.reasons">{{ r }}</li>
                  </ul>
                  <div class="linked" *ngIf="s.linkedFixes.length">
                    Linked fix{{ s.linkedFixes.length === 1 ? '' : 'es' }}:
                    <button
                      type="button"
                      *ngFor="let f of s.linkedFixes; let last = last"
                      class="link"
                      (click)="onSelectCommit(f.hash)"
                    >
                      <code>{{ f.shortHash }}</code
                      ><span *ngIf="!last">, </span>
                    </button>
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
                <li *ngFor="let f of b.fixCommits">
                  <button
                    type="button"
                    class="commit"
                    [class.revert]="f.isRevert"
                    (click)="onSelectCommit(f.hash)"
                  >
                    <code class="hash">{{ f.shortHash }}</code>
                    <span class="info">
                      <span class="subject">
                        <span class="tag" *ngIf="f.isRevert">revert</span>
                        <span class="tag fix" *ngIf="f.isFix">fix</span>
                        {{ f.subject }}
                      </span>
                      <span class="byline"
                        >{{ f.author }} · {{ f.date | slice: 0 : 10 }} · {{ f.churn }} lines</span
                      >
                    </span>
                  </button>
                </li>
              </ul>
            </article>

            <article class="card" *ngIf="b.coChangedFiles.length">
              <header class="card-head">
                <h3>Often changed together</h3>
                <span class="hint">From recent fixes &amp; suspects</span>
              </header>
              <ul class="cochanged">
                <li *ngFor="let c of b.coChangedFiles">
                  <button type="button" (click)="openFile(c.file)">
                    <span class="path">{{ c.file }}</span>
                    <span class="count">{{ c.count }}×</span>
                  </button>
                </li>
              </ul>
            </article>

            <article class="card">
              <header class="card-head">
                <h3>Recent commits</h3>
                <span class="hint">Last {{ b.commits.length }} touches</span>
              </header>
              <ul class="recent">
                <li *ngFor="let c of b.commits">
                  <button
                    type="button"
                    class="commit"
                    [class.is-fix]="c.isFix || c.isRevert"
                    (click)="onSelectCommit(c.hash)"
                  >
                    <code class="hash">{{ c.shortHash }}</code>
                    <span class="info">
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
                    </span>
                  </button>
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
      .empty button {
        margin-left: 0.4rem;
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
        width: 100%;
        padding: 0.55rem 0.85rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
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
      .suspect-select {
        display: grid;
        gap: 0.25rem;
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
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
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        color: var(--accent);
        font: inherit;
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
      .cochanged button {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        padding: 0.4rem 0.6rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
      }
      .cochanged button:hover {
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
  private readonly historyRequests = new Subject<string>();
  private readonly breakageRequests = new Subject<string>();
  readonly riskLevel = computed<'low' | 'moderate' | 'high'>(() => {
    const score = this.breakage()?.riskScore ?? 0;
    if (score >= 60) return 'high';
    if (score >= 30) return 'moderate';
    return 'low';
  });

  constructor() {
    this.historyRequests
      .pipe(
        switchMap((file) => {
          this.loading.set(true);
          this.error.set(null);
          return forkJoin({
            stats: this.insightsApi.fileStats(file).pipe(catchError(() => of(null))),
            page: this.git.getCommits({ file, page: 1, pageSize: 200 }),
          }).pipe(
            map((result) => ({ result, error: null })),
            catchError((error) =>
              of({
                result: null,
                error: error?.error?.error ?? 'Failed to load file history',
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ result, error }) => {
        this.loading.set(false);
        if (error) {
          this.error.set(error);
          return;
        }
        this.stats.set(result?.stats ?? null);
        this.commits.set(result?.page.commits ?? []);
      });

    this.breakageRequests
      .pipe(
        switchMap((file) => {
          this.breakageLoading.set(true);
          this.breakageError.set(null);
          return this.insightsApi.breakage(file).pipe(
            map((breakage) => ({ breakage, error: null })),
            catchError((error) =>
              of({
                breakage: null,
                error: error?.error?.error ?? 'Failed to analyze breakage',
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ breakage, error }) => {
        this.breakageLoading.set(false);
        if (error) {
          this.breakageError.set(error);
          return;
        }
        this.breakage.set(breakage);
      });

    // Use paramMap observable (not snapshot) so the component reloads when
    // navigating between file-history routes without being destroyed/recreated.
    this.route.paramMap
      .pipe(
        map((params) => decodeURIComponent(params.get('path') ?? '')),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((file) => {
        this.filePath.set(file);
        this.stats.set(null);
        this.commits.set([]);
        this.breakage.set(null);
        this.breakageError.set(null);
        if (file) {
          this.historyRequests.next(file);
          if (this.tab() === 'breakage') this.breakageRequests.next(file);
        }
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((qp) => {
      const requestedTab = qp.get('tab');
      if (requestedTab !== 'breakage' && requestedTab !== 'blame' && requestedTab !== 'history') {
        return;
      }
      this.tab.set(requestedTab);
      if (requestedTab === 'breakage' && this.filePath() && !this.breakageLoading()) {
        this.breakageRequests.next(this.filePath());
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
      this.breakageRequests.next(this.filePath());
    }
  }

  retryHistory() {
    if (this.filePath()) this.historyRequests.next(this.filePath());
  }

  retryBreakage() {
    if (this.filePath()) this.breakageRequests.next(this.filePath());
  }

  openFile(file: string) {
    if (!file) return;
    this.router.navigate(['/file', encodeURIComponent(file)]);
  }
}
