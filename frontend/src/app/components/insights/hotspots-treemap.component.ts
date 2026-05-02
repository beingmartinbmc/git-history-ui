import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  Output,
  EventEmitter,
  ViewChild
} from '@angular/core';
import * as d3 from 'd3';

interface HotspotInput {
  file: string;
  commits: number;
  additions: number;
  deletions: number;
  authors: number;
}

@Component({
  selector: 'app-hotspots-treemap',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg #svg width="100%" [attr.height]="height" aria-label="Hotspots treemap"></svg>
  `,
  styles: [`
    :host { display: block; }
    svg { display: block; }
    svg :global(.cell) { cursor: pointer; }
    svg :global(.cell-label) {
      pointer-events: none;
      font-size: 10px;
      fill: var(--bg-app);
      font-family: var(--font-mono, monospace);
    }
  `]
})
export class HotspotsTreemapComponent implements AfterViewInit, OnChanges {
  @Input() data: HotspotInput[] = [];
  @Input() height = 320;
  @Output() fileClick = new EventEmitter<string>();
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
    const svg = d3.select(el);
    svg.selectAll('*').remove();
    if (this.data.length === 0) return;

    const root = d3
      .hierarchy<{ name: string; value?: number; children?: HotspotInput[] }>({
        name: 'root',
        children: this.data
      } as never)
      .sum((d: any) => (d.commits ?? 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = d3.treemap<typeof root.data>().size([width, this.height]).padding(2).round(true);
    layout(root as never);

    const color = d3
      .scaleSequential<string>()
      .domain([0, d3.max(this.data, (d) => d.commits) ?? 1])
      .interpolator(d3.interpolateBlues);

    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<HotspotInput>>('g')
      .data(root.leaves() as unknown as Array<d3.HierarchyRectangularNode<HotspotInput>>)
      .join('g')
      .attr('class', 'cell')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .on('click', (_e, d) => this.fileClick.emit((d.data as HotspotInput).file));

    cell
      .append('rect')
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (d) => color((d.data as HotspotInput).commits))
      .attr('stroke', 'var(--bg-app)');

    cell
      .append('title')
      .text((d) => {
        const h = d.data as HotspotInput;
        return `${h.file}\n${h.commits} commits, ${h.authors} authors\n+${h.additions} -${h.deletions}`;
      });

    cell
      .append('text')
      .attr('class', 'cell-label')
      .attr('x', 4)
      .attr('y', 12)
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 40 || h < 18) return '';
        const file = (d.data as HotspotInput).file;
        return file.split('/').pop() ?? file;
      });
  }
}
