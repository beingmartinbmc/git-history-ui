import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
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
    <svg #svg width="100%" [attr.height]="height" aria-label="Churn over time"></svg>
  `,
  styles: [`
    :host { display: block; }
    svg { display: block; }
    svg :global(.axis text) { font-size: 10px; fill: var(--fg-muted); }
    svg :global(.axis path),
    svg :global(.axis line) { stroke: var(--border-soft); }
    svg :global(.area) { fill: var(--accent); fill-opacity: 0.18; }
    svg :global(.line) { stroke: var(--accent); stroke-width: 1.5; fill: none; }
  `]
})
export class ChurnChartComponent implements AfterViewInit, OnChanges {
  @Input() data: ChurnPoint[] = [];
  @Input() height = 200;
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  ngAfterViewInit() {
    this.render();
  }
  ngOnChanges() {
    this.render();
  }

  private render() {
    if (!this.svgRef) return;
    const el = this.svgRef.nativeElement;
    const width = el.clientWidth || 600;
    const margin = { top: 10, right: 16, bottom: 24, left: 32 };
    const innerW = Math.max(0, width - margin.left - margin.right);
    const innerH = Math.max(0, this.height - margin.top - margin.bottom);

    const svg = d3.select(el);
    svg.selectAll('*').remove();
    if (this.data.length === 0) return;

    const parsed = this.data.map((d) => ({
      date: new Date(d.date),
      commits: d.commits,
      churn: d.additions + d.deletions
    }));
    const x = d3
      .scaleTime()
      .domain(d3.extent(parsed, (d) => d.date) as [Date, Date])
      .range([0, innerW]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(parsed, (d) => d.commits) ?? 1])
      .nice()
      .range([innerH, 0]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const area = d3
      .area<typeof parsed[number]>()
      .x((d) => x(d.date))
      .y0(innerH)
      .y1((d) => y(d.commits))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(parsed).attr('class', 'area').attr('d', area as any);

    const line = d3
      .line<typeof parsed[number]>()
      .x((d) => x(d.date))
      .y((d) => y(d.commits))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(parsed).attr('class', 'line').attr('d', line as any);

    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
  }
}
