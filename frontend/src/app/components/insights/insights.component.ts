import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal
} from '@angular/core';
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
          {{ b.windowStart | slice:0:10 }} → {{ b.windowEnd | slice:0:10 }}
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

        <section class="card">
          <h3>Top contributors</h3>
          <ul class="bars">
            <li *ngFor="let c of b.topContributors">
              <div class="bar-row">
                <span class="bar-label">{{ c.author }}</span>
                <span class="bar-value">{{ c.commits }}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" [style.width.%]="barPct(c.commits, maxAuthorCommits())"></div>
              </div>
            </li>
          </ul>
        </section>

        <section class="card wide hotspot-card">
          <h3>Hotspots <span class="card-sub">(treemap sized by commit count — click to drill in)</span></h3>
          <app-hotspots-treemap [data]="b.hotspots" (fileClick)="openFile($event)" />
          <ul class="hot-list compact">
            <li *ngFor="let h of b.hotspots.slice(0, 5)">
              <a class="path" (click)="openFile(h.file)">{{ h.file }}</a>
              <span class="count">{{ h.commits }}c · {{ h.authors }}a</span>
              <span class="churn">+{{ h.additions }} −{{ h.deletions }}</span>
            </li>
          </ul>
        </section>

        <section class="card">
          <h3>Risky files <span class="card-sub">(churn × authors × recency)</span></h3>
          <ul class="risk-list">
            <li *ngFor="let r of b.riskyFiles">
              <a class="path" (click)="openFile(r.file)">{{ r.file }}</a>
              <div class="risk-bar">
                <div class="risk-fill" [style.width.%]="r.riskScore * 100"></div>
                <span class="risk-score">{{ (r.riskScore * 100).toFixed(0) }}</span>
              </div>
              <span class="reason">{{ r.reason }}</span>
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
  styles: [`
    :host { display: block; flex: 1; min-height: 0; overflow-y: auto; }
    .page { padding: 1.1rem 1.25rem 1.4rem; max-width: 1320px; margin: 0 auto; }
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
    .head h2 { margin: 0; font-size: clamp(20px, 2vw, 28px); letter-spacing: -0.03em; }
    .head .sub { margin: 0; color: var(--fg-muted); font-size: 13px; }

    .empty { padding: 2rem; color: var(--fg-muted); text-align: center; }
    .empty.error { color: var(--danger); }

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
        radial-gradient(circle at 85% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 44%),
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
    .kpi .label { color: var(--fg-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi strong { font-size: 24px; letter-spacing: -0.04em; }
    .kpi .hint { color: var(--fg-muted); font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card {
      background: var(--bg-panel);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      padding: 1rem 1.25rem;
      box-shadow: var(--shadow-sm);
    }
    .card.wide { grid-column: 1 / -1; }
    .card h3 { margin: 0 0 0.75rem; font-size: 14px; }
    .card-sub { font-size: 11px; color: var(--fg-muted); font-weight: 400; margin-left: 0.4rem; }

    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .bar-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
    .bar-label { color: var(--fg-primary); }
    .bar-value { color: var(--fg-muted); font-variant-numeric: tabular-nums; }
    .bar-track { height: 7px; background: var(--bg-surface-2); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #06b6d4); border-radius: 999px; }

    .hot-list, .risk-list { list-style: none; margin: 0; padding: 0; }
    .hot-list.compact { margin-top: 0.5rem; max-height: 130px; overflow-y: auto; }
    .hot-list li, .risk-list li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 0.6rem;
      align-items: center;
      padding: 0.4rem 0;
      border-bottom: 1px solid color-mix(in oklab, var(--border-soft) 50%, transparent);
      font-size: 12px;
    }
    .hot-list li:last-child, .risk-list li:last-child { border-bottom: 0; }
    .path {
      font-family: var(--font-mono, monospace);
      color: var(--accent);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .path:hover { text-decoration: underline; }
    .count, .churn { color: var(--fg-muted); font-size: 11px; }

    .risk-list li {
      grid-template-columns: minmax(0, 1.5fr) 100px minmax(0, 1.5fr);
    }
    .risk-bar {
      position: relative;
      height: 16px;
      background: var(--bg-surface-2);
      border-radius: 999px;
      overflow: hidden;
    }
    .risk-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444);
    }
    .risk-score {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 10px;
      font-weight: 600;
      color: var(--fg-primary);
      mix-blend-mode: difference;
    }
    .reason { color: var(--fg-muted); font-size: 11px; }

    .churn-chart {
      display: flex;
      align-items: flex-end;
      height: 120px;
      gap: 1px;
      padding: 0.5rem 0;
    }
    .day {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      height: 100%;
      position: relative;
    }
    .day-bar {
      width: 100%;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      min-height: 1px;
      opacity: 0.85;
    }
    .day:hover .day-bar { opacity: 1; }
    .day-label {
      font-size: 9px;
      color: var(--fg-muted);
      position: absolute;
      bottom: -16px;
      transform: rotate(-30deg);
      transform-origin: top left;
      white-space: nowrap;
    }
  `]
})
export class InsightsComponent {
  private insightsApi = inject(InsightsService);
  private router = inject(Router);

  readonly bundle = signal<InsightsBundle | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly maxAuthorCommits = signal<number>(0);
  readonly maxDayCommits = signal<number>(0);

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

  dayPct(value: number, max: number): number {
    return max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  }

  shouldShowLabel(date: string): boolean {
    // Show first of month only.
    return date.endsWith('-01');
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
        this.maxDayCommits.set(Math.max(0, ...b.churnByDay.map((d) => d.commits)));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to load insights');
        this.loading.set(false);
      }
    });
  }
}
