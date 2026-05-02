import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import * as d3 from 'd3';

interface ChurnPoint {
  date: string;
  commits: number;
  additions: number;
  deletions: number;
}

@Component({
  selector: 'app-churn-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-shell">
      <div class="legend" aria-hidden="true">
        <span><i class="swatch commits"></i> commits</span>
        <span><i class="swatch additions"></i> additions</span>
        <span><i class="swatch deletions"></i> deletions</span>
      </div>
      <div class="chart-wrap">
        <svg #svg width="100%" [attr.height]="height" aria-label="Interactive churn over time"></svg>
        <div #tooltip class="tooltip" hidden></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .chart-shell {
      display: grid;
      gap: 0.45rem;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      color: var(--fg-muted);
      font-size: 11px;
    }
    .legend span {
      display: inline-flex;
      gap: 0.35rem;
      align-items: center;
    }
    .swatch {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 999px;
    }
    .swatch.commits { background: var(--chart-line); }
    .swatch.additions { background: var(--chart-add); }
    .swatch.deletions { background: var(--chart-del); }
    .chart-wrap {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      background:
        radial-gradient(circle at 12% 0%, var(--chart-fill), transparent 34%),
        linear-gradient(180deg, color-mix(in oklab, var(--bg-surface-2) 58%, transparent), transparent 70%),
        var(--bg-surface-2);
    }
    svg { display: block; outline: none; }
    :host ::ng-deep .axis text {
      font-size: 10px;
      font-family: var(--font-mono, monospace);
    }
    :host ::ng-deep .axis path,
    :host ::ng-deep .axis line {
      shape-rendering: crispEdges;
    }
    .tooltip {
      position: absolute;
      z-index: 2;
      min-width: 150px;
      max-width: 240px;
      padding: 0.5rem 0.6rem;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      color: var(--fg-primary);
      box-shadow: var(--shadow-md);
      font-size: 11px;
      line-height: 1.35;
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 12px));
    }
    .tooltip strong {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 12px;
    }
    .tooltip .row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      color: var(--fg-muted);
      font-variant-numeric: tabular-nums;
    }
    .tooltip .value { color: var(--fg-primary); }
  `]
})
export class ChurnChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: ChurnPoint[] = [];
  @Input() height = 200;
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip', { static: true }) tooltipRef!: ElementRef<HTMLDivElement>;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit() {
    this.render();
  }
  ngOnChanges() {
    this.render();
  }
  ngOnDestroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }

  private render() {
    if (!this.svgRef) return;
    const el = this.svgRef.nativeElement;
    const tooltip = this.tooltipRef?.nativeElement;
    const width = el.clientWidth || 600;
    const margin = { top: 14, right: 46, bottom: 28, left: 42 };
    const innerW = Math.max(0, width - margin.left - margin.right);
    const innerH = Math.max(0, this.height - margin.top - margin.bottom);
    const styles = getComputedStyle(el);
    const color = {
      accent: css(styles, '--chart-line', '#818cf8'),
      success: css(styles, '--chart-add', '#4ade80'),
      danger: css(styles, '--chart-del', '#f87171'),
      muted: css(styles, '--fg-muted', '#94a3b8'),
      primary: css(styles, '--fg-primary', '#f8fafc'),
      border: css(styles, '--border-soft', '#334155'),
      grid: css(styles, '--graph-guide', 'rgba(148, 163, 184, 0.22)'),
      surface: css(styles, '--bg-surface', '#111827'),
      elevated: css(styles, '--bg-elevated', '#1f2937')
    };

    const svg = d3.select(el);
    svg.selectAll('*').remove();
    hideTooltip(tooltip);
    if (this.data.length === 0 || innerW <= 0 || innerH <= 0) return;

    const parsed = this.data.map((d) => ({
      date: new Date(d.date),
      label: d.date,
      commits: d.commits,
      additions: d.additions,
      deletions: d.deletions,
      churn: d.additions + d.deletions
    })).filter((d) => !Number.isNaN(d.date.getTime()));
    if (!parsed.length) return;

    const extent = d3.extent(parsed, (d) => d.date) as [Date, Date];
    if (+extent[0] === +extent[1]) {
      extent[0] = new Date(+extent[0] - 12 * 60 * 60 * 1000);
      extent[1] = new Date(+extent[1] + 12 * 60 * 60 * 1000);
    }
    const x = d3
      .scaleTime()
      .domain(extent)
      .range([0, innerW]);
    const yChurn = d3
      .scaleLinear()
      .domain([0, d3.max(parsed, (d) => d.churn) ?? 1])
      .nice()
      .range([innerH, 0]);
    const yCommits = d3
      .scaleLinear()
      .domain([0, d3.max(parsed, (d) => d.commits) ?? 1])
      .nice()
      .range([innerH, 0]);

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', 'churn-area-gradient')
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '0%')
      .attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', color.accent).attr('stop-opacity', 0.24);
    grad.append('stop').attr('offset', '100%').attr('stop-color', color.accent).attr('stop-opacity', 0.02);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const fmt = d3.format(',');

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yChurn).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('line').attr('stroke', color.grid));

    const dayW = Math.max(2, Math.min(14, innerW / Math.max(1, parsed.length) * 0.45));
    g.append('g')
      .selectAll('line.additions')
      .data(parsed)
      .join('line')
      .attr('class', 'additions')
      .attr('x1', (d) => x(d.date) - dayW / 3)
      .attr('x2', (d) => x(d.date) - dayW / 3)
      .attr('y1', innerH)
      .attr('y2', (d) => yChurn(d.additions))
      .attr('stroke', color.success)
      .attr('stroke-width', dayW)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.75);

    g.append('g')
      .selectAll('line.deletions')
      .data(parsed)
      .join('line')
      .attr('class', 'deletions')
      .attr('x1', (d) => x(d.date) + dayW / 3)
      .attr('x2', (d) => x(d.date) + dayW / 3)
      .attr('y1', innerH)
      .attr('y2', (d) => yChurn(d.deletions))
      .attr('stroke', color.danger)
      .attr('stroke-width', dayW)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.62);

    const area = d3
      .area<typeof parsed[number]>()
      .x((d) => x(d.date))
      .y0(innerH)
      .y1((d) => yChurn(d.churn))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(parsed)
      .attr('d', area)
      .attr('fill', 'url(#churn-area-gradient)');

    const line = d3
      .line<typeof parsed[number]>()
      .x((d) => x(d.date))
      .y((d) => yCommits(d.commits))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(parsed)
      .attr('d', line)
      .attr('stroke', color.accent)
      .attr('stroke-width', 2)
      .attr('fill', 'none');

    const focus = g.append('g').attr('display', 'none');
    focus.append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', color.primary)
      .attr('stroke-opacity', 0.25)
      .attr('stroke-dasharray', '3,3');
    focus.append('circle')
      .attr('r', 4)
      .attr('fill', color.accent)
      .attr('stroke', color.surface)
      .attr('stroke-width', 2);

    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, Math.max(3, Math.floor(innerW / 90)))).tickSizeOuter(0))
      .call(styleAxis(color));
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yChurn).ticks(4).tickSizeOuter(0))
      .call(styleAxis(color));
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yCommits).ticks(4).tickSizeOuter(0))
      .call(styleAxis(color));

    g.append('text')
      .attr('x', 0)
      .attr('y', -4)
      .attr('fill', color.muted)
      .attr('font-size', 10)
      .text('churn');
    g.append('text')
      .attr('x', innerW)
      .attr('y', -4)
      .attr('text-anchor', 'end')
      .attr('fill', color.muted)
      .attr('font-size', 10)
      .text('commits');

    const bisect = d3.bisector<typeof parsed[number], Date>((d) => d.date).center;
    svg
      .attr('tabindex', 0)
      .on('pointermove', (event) => {
        const [mx, my] = d3.pointer(event, g.node());
        if (mx < 0 || mx > innerW || my < 0 || my > innerH) {
          hideTooltip(tooltip);
          focus.attr('display', 'none');
          return;
        }
        const date = x.invert(mx);
        const d = parsed[bisect(parsed, date)];
        if (!d) return;
        const fx = x(d.date);
        const fy = yCommits(d.commits);
        focus.attr('display', null).attr('transform', `translate(${fx},0)`);
        focus.select('circle').attr('cy', fy);
        showTooltip(tooltip, {
          x: margin.left + fx,
          y: margin.top + Math.min(fy, innerH - 20),
          date: d.label,
          commits: fmt(d.commits),
          additions: fmt(d.additions),
          deletions: fmt(d.deletions),
          churn: fmt(d.churn)
        });
      })
      .on('pointerleave blur', () => {
        focus.attr('display', 'none');
        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => hideTooltip(tooltip), 80);
      });
  }
}

function styleAxis(color: { muted: string; border: string }) {
  return (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    sel.selectAll('text').attr('fill', color.muted);
    sel.selectAll('path,line').attr('stroke', color.border);
  };
}

function showTooltip(
  el: HTMLDivElement | undefined,
  data: { x: number; y: number; date: string; commits: string; additions: string; deletions: string; churn: string }
) {
  if (!el) return;
  el.hidden = false;
  el.style.left = `${data.x}px`;
  el.style.top = `${data.y}px`;
  el.innerHTML = `
    <strong>${escapeHtml(data.date)}</strong>
    <div class="row"><span>Commits</span><span class="value">${data.commits}</span></div>
    <div class="row"><span>Additions</span><span class="value">+${data.additions}</span></div>
    <div class="row"><span>Deletions</span><span class="value">-${data.deletions}</span></div>
    <div class="row"><span>Total churn</span><span class="value">${data.churn}</span></div>
  `;
}

function hideTooltip(el: HTMLDivElement | undefined) {
  if (el) el.hidden = true;
}

function css(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch] ?? ch);
}
