import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InsightsBundle } from '../../models/git.models';
import { InsightsService } from '../../services/insights.service';
import { ChurnChartComponent } from './churn-chart.component';
import { HotspotsTreemapComponent } from './hotspots-treemap.component';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, HotspotsTreemapComponent, ChurnChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <div>
          <p class="eyebrow">Repository intelligence</p>
          <h2>Insights</h2>
        </div>
        <p class="sub" *ngIf="bundle() as b">
          {{ b.windowStart | slice: 0 : 10 }} → {{ b.windowEnd | slice: 0 : 10 }}
        </p>
      </header>

      <div class="empty" *ngIf="loading()">Computing insights (this may take a few seconds)…</div>
      <div class="empty error" *ngIf="error() as e">{{ e }}</div>

      <div class="grid" *ngIf="bundle() as b">
        <section class="kpis">
          <button class="kpi">
            <span class="label">Commits analyzed</span>
            <strong>{{ b.totalCommits }}</strong>
            <span class="hint">current insight window</span>
          </button>
          <button class="kpi">
            <span class="label">Contributors</span>
            <strong>{{ b.totalAuthors }}</strong>
            <span class="hint">{{ topContributor(b) }}</span>
          </button>
          <button class="kpi" (click)="openTopHotspot(b)">
            <span class="label">Hotspots</span>
            <strong>{{ b.hotspots.length }}</strong>
            <span class="hint">click to open the top file</span>
          </button>
          <button class="kpi" (click)="openTopRisk(b)">
            <span class="label">Risk alerts</span>
            <strong>{{ b.riskyFiles.length }}</strong>
            <span class="hint">highest churn and ownership risk</span>
          </button>
        </section>

        <section class="card contributors-card">
          <div class="section-head">
            <div>
              <p class="eyebrow mini">Ownership</p>
              <h3>Top contributors</h3>
            </div>
            <p class="meaning">Who touched this repo most in the current insight window.</p>
          </div>
          <ul class="contributors" aria-label="Top contributors by commit count">
            <li *ngFor="let c of b.topContributors; let i = index">
              <span class="avatar" [style.--avatar-color]="avatarColor(i)">{{
                initials(c.author)
              }}</span>
              <div class="contributor-main">
                <div class="contributor-row">
                  <span class="name" [title]="c.author">{{ c.author }}</span>
                  <strong>{{ c.commits }} commits</strong>
                </div>
                <div class="contributor-bar" [attr.aria-label]="c.commits + ' commits'">
                  <div
                    class="contributor-fill"
                    [style.width.%]="barPct(c.commits, maxAuthorCommits())"
                  ></div>
                </div>
                <span class="active-range">
                  active {{ c.firstCommit | date: 'MMM d' }} - {{ c.lastCommit | date: 'MMM d, y' }}
                </span>
              </div>
            </li>
          </ul>
        </section>

        <section class="card wide hotspot-card">
          <div class="section-head">
            <div>
              <p class="eyebrow mini">Change concentration</p>
              <h3>Hot files</h3>
            </div>
            <p class="meaning">
              Bigger boxes changed in more commits. Stronger color means more line churn. Click any
              file to open its history.
            </p>
          </div>
          <div class="hotspot-help">
            <span><strong>Size</strong> = commit frequency</span>
            <span><strong>Color</strong> = additions + deletions</span>
            <span><strong>People</strong> = number of authors touching it</span>
          </div>
          <app-hotspots-treemap [data]="b.hotspots" (fileClick)="openFile($event)" />
          <ul class="hot-list compact" aria-label="Top hot files">
            <li *ngFor="let h of b.hotspots.slice(0, 5)">
              <a class="path" (click)="openFile(h.file)" [title]="h.file">{{ h.file }}</a>
              <span class="count">{{ h.commits }} commits</span>
              <span class="count">{{ h.authors }} authors</span>
              <span class="churn">+{{ h.additions }} −{{ h.deletions }}</span>
            </li>
          </ul>
        </section>

        <section class="card wide risk-card">
          <div class="section-head">
            <div>
              <p class="eyebrow mini">Review priority</p>
              <h3>Risky files</h3>
            </div>
            <p class="meaning">
              This is a triage signal, not a bug detector. Higher scores mean the file changed a
              lot, changed recently, and/or has several contributors.
            </p>
          </div>
          <div class="risk-legend">
            <span class="legend-dot low"></span><span>Low</span>
            <span class="legend-dot medium"></span><span>Medium</span>
            <span class="legend-dot high"></span><span>High</span>
          </div>
          <ul class="risk-list" aria-label="Risky files ranked by review priority">
            <li
              *ngFor="let r of b.riskyFiles; let i = index"
              [class.risk-high]="riskLevel(r.riskScore) === 'high'"
              [class.risk-medium]="riskLevel(r.riskScore) === 'medium'"
              [class.risk-low]="riskLevel(r.riskScore) === 'low'"
            >
              <span class="rank">{{ i + 1 }}</span>
              <div class="risk-main">
                <a class="path" (click)="openFile(r.file)" [title]="r.file">{{ r.file }}</a>
                <span class="reason">{{ r.reason }}</span>
              </div>
              <div class="risk-meter" [attr.aria-label]="'Risk score ' + riskScore(r.riskScore)">
                <div class="risk-track">
                  <div class="risk-fill" [style.width.%]="riskPct(r.riskScore)"></div>
                </div>
                <span class="risk-score">{{ riskScore(r.riskScore) }}</span>
              </div>
              <div class="risk-stats">
                <span>{{ r.commits }} commits</span>
                <span>{{ r.authors }} authors</span>
                <span>{{ r.churn }} churn</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="card wide chart-card">
          <h3>Churn over time</h3>
          <app-churn-chart [data]="b.churnByDay" />
        </section>
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
        max-width: 1320px;
        margin: 0 auto;
      }
      .head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
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
      .head .sub {
        margin: 0;
        color: var(--fg-muted);
        font-size: 13px;
      }

      .empty {
        padding: 2rem;
        color: var(--fg-muted);
        text-align: center;
      }
      .empty.error {
        color: var(--danger);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1rem;
      }
      .kpis {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.75rem;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 0.85rem 1rem;
        color: var(--fg-primary);
        background:
          radial-gradient(
            circle at 85% 0%,
            color-mix(in oklab, var(--accent) 16%, transparent),
            transparent 44%
          ),
          var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        cursor: pointer;
        text-align: left;
      }
      .kpi:hover {
        border-color: color-mix(in oklab, var(--accent) 36%, var(--border-soft));
        box-shadow: var(--shadow-md);
      }
      .kpi .label {
        color: var(--fg-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .kpi strong {
        font-size: 24px;
        letter-spacing: -0.04em;
      }
      .kpi .hint {
        color: var(--fg-muted);
        font-size: 11px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .card {
        background: var(--bg-panel);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-lg);
        padding: 1rem 1.25rem;
        box-shadow: var(--shadow-sm);
      }
      .card.wide {
        grid-column: 1 / -1;
      }
      .card h3 {
        margin: 0 0 0.75rem;
        font-size: 14px;
      }
      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 0.7rem;
      }
      .section-head h3 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.03em;
      }
      .eyebrow.mini {
        margin-bottom: 0.1rem;
        font-size: 10px;
        letter-spacing: 0.07em;
      }
      .meaning {
        max-width: 440px;
        margin: 0;
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 1.45;
        text-align: right;
      }
      .hotspot-help {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }
      .hotspot-help span {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.55rem;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: color-mix(in oklab, var(--bg-surface) 78%, transparent);
        color: var(--fg-muted);
        font-size: 11px;
      }
      .hotspot-help strong {
        color: var(--fg-primary);
        font-weight: 700;
      }

      .contributors-card {
        background:
          radial-gradient(
            circle at 88% 0%,
            color-mix(in oklab, var(--accent) 14%, transparent),
            transparent 38%
          ),
          var(--bg-panel);
      }
      .contributors {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.65rem;
      }
      .contributors li {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 0.7rem;
        align-items: center;
        padding: 0.65rem;
        border: 1px solid color-mix(in oklab, var(--border-soft) 72%, transparent);
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--bg-surface) 62%, transparent);
        transition:
          border-color 120ms,
          box-shadow 120ms,
          transform 120ms;
      }
      .contributors li:hover {
        border-color: color-mix(in oklab, var(--accent) 36%, var(--border-soft));
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
      .avatar {
        --avatar-color: var(--accent);
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.28), transparent 36%),
          var(--avatar-color);
        color: white;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.03em;
        box-shadow: 0 0 0 2px color-mix(in oklab, var(--bg-surface) 78%, transparent);
      }
      .contributor-main {
        min-width: 0;
        display: grid;
        gap: 0.28rem;
      }
      .contributor-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fg-primary);
        font-size: 13px;
        font-weight: 600;
      }
      .contributor-row strong {
        flex: 0 0 auto;
        color: var(--fg-primary);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .contributor-bar {
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--bg-surface-2);
        border: 1px solid color-mix(in oklab, var(--border-soft) 68%, transparent);
      }
      .contributor-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--accent), #06b6d4);
      }
      .active-range {
        color: var(--fg-muted);
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hot-list,
      .risk-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .hot-list.compact {
        margin-top: 0.75rem;
        max-height: 168px;
        overflow-y: auto;
        border: 1px solid color-mix(in oklab, var(--border-soft) 72%, transparent);
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--bg-surface) 58%, transparent);
      }
      .hot-list li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto;
        gap: 0.6rem;
        align-items: center;
        padding: 0.55rem 0.7rem;
        border-bottom: 1px solid color-mix(in oklab, var(--border-soft) 50%, transparent);
        font-size: 12px;
      }
      .hot-list li:last-child,
      .risk-list li:last-child {
        border-bottom: 0;
      }
      .path {
        font-family: var(--font-mono, monospace);
        color: var(--accent);
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .path:hover {
        text-decoration: underline;
      }
      .count,
      .churn {
        color: var(--fg-muted);
        font-size: 11px;
      }

      .risk-card {
        background:
          radial-gradient(
            circle at 96% 0%,
            color-mix(in oklab, var(--danger) 12%, transparent),
            transparent 34%
          ),
          var(--bg-panel);
      }
      .risk-legend {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
        padding: 0.28rem 0.55rem;
        border: 1px solid var(--border-soft);
        border-radius: 999px;
        background: color-mix(in oklab, var(--bg-surface) 72%, transparent);
        color: var(--fg-muted);
        font-size: 11px;
      }
      .legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
      }
      .legend-dot.low {
        background: var(--success);
      }
      .legend-dot.medium {
        background: var(--warning);
      }
      .legend-dot.high {
        background: var(--danger);
      }
      .risk-list {
        display: grid;
        gap: 0.65rem;
      }
      .risk-list li {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) minmax(160px, 220px) auto;
        gap: 0.85rem;
        align-items: center;
        padding: 0.75rem;
        border: 1px solid color-mix(in oklab, var(--border-soft) 72%, transparent);
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--bg-surface) 66%, transparent);
        box-shadow: var(--shadow-sm);
        transition:
          border-color 120ms,
          box-shadow 120ms,
          transform 120ms;
      }
      .risk-list li:hover {
        border-color: color-mix(in oklab, var(--accent) 36%, var(--border-soft));
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
      .rank {
        display: inline-grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: var(--bg-surface-2);
        color: var(--fg-muted);
        font-size: 11px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .risk-main {
        min-width: 0;
        display: grid;
        gap: 0.25rem;
      }
      .risk-meter {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 42px;
        align-items: center;
        gap: 0.55rem;
      }
      .risk-track {
        position: relative;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: linear-gradient(
          90deg,
          color-mix(in oklab, var(--success) 24%, transparent) 0 33%,
          color-mix(in oklab, var(--warning) 26%, transparent) 33% 66%,
          color-mix(in oklab, var(--danger) 28%, transparent) 66% 100%
        );
        border: 1px solid color-mix(in oklab, var(--border-soft) 70%, transparent);
      }
      .risk-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--success), var(--warning), var(--danger));
      }
      .risk-score {
        font-size: 13px;
        font-weight: 800;
        color: var(--fg-primary);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .risk-stats {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.35rem;
        min-width: 150px;
      }
      .risk-stats span {
        padding: 0.18rem 0.45rem;
        border-radius: 999px;
        background: var(--bg-surface-2);
        color: var(--fg-muted);
        font-size: 11px;
        white-space: nowrap;
      }
      .reason {
        color: var(--fg-muted);
        font-size: 11px;
      }
      .risk-high .rank {
        background: color-mix(in oklab, var(--danger) 18%, transparent);
        color: var(--danger);
      }
      .risk-medium .rank {
        background: color-mix(in oklab, var(--warning) 18%, transparent);
        color: var(--warning);
      }
      .risk-low .rank {
        background: color-mix(in oklab, var(--success) 16%, transparent);
        color: var(--success);
      }

      @media (max-width: 900px) {
        .section-head {
          flex-direction: column;
        }
        .meaning {
          text-align: left;
        }
        .risk-list li {
          grid-template-columns: 28px minmax(0, 1fr);
        }
        .risk-meter,
        .risk-stats {
          grid-column: 2;
        }
        .risk-stats {
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class InsightsComponent {
  private insightsApi = inject(InsightsService);
  private router = inject(Router);

  readonly bundle = signal<InsightsBundle | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly maxAuthorCommits = signal<number>(0);

  constructor() {
    effect(() => {
      this.load();
    });
  }

  trackByDate(_: number, d: { date: string }): string {
    return d.date;
  }

  barPct(value: number, max: number): number {
    return max > 0 ? Math.round((value / max) * 100) : 0;
  }

  initials(author: string): string {
    const parts = author.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
    return `${first}${last}`.toUpperCase();
  }

  avatarColor(index: number): string {
    const colors = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    return colors[index % colors.length];
  }

  riskPct(score: number): number {
    return Math.max(4, Math.min(100, Math.round(score * 100)));
  }

  riskScore(score: number): string {
    return this.riskPct(score).toString();
  }

  riskLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= 0.67) return 'high';
    if (score >= 0.34) return 'medium';
    return 'low';
  }

  openFile(file: string) {
    this.router.navigate(['/file', encodeURIComponent(file)]);
  }

  topContributor(bundle: InsightsBundle): string {
    const top = bundle.topContributors[0];
    return top ? top.author : 'No author data';
  }

  openTopHotspot(bundle: InsightsBundle) {
    const file = bundle.hotspots[0]?.file;
    if (file) this.openFile(file);
  }

  openTopRisk(bundle: InsightsBundle) {
    const file = bundle.riskyFiles[0]?.file;
    if (file) this.openFile(file);
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.insightsApi.bundle({ maxCommits: 500 }).subscribe({
      next: (b) => {
        this.bundle.set(b);
        this.maxAuthorCommits.set(b.topContributors[0]?.commits ?? 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to load insights');
        this.loading.set(false);
      },
    });
  }
}
