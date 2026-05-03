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
  ViewChild,
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
    <div class="treemap-wrap">
      <svg
        #svg
        width="100%"
        [attr.height]="height"
        aria-label="Hot files treemap. Larger boxes changed in more commits. Stronger color means more line churn."
      ></svg>
      <div class="scale" *ngIf="data.length">
        <span>lower churn</span>
        <span class="scale-bar"></span>
        <span>higher churn</span>
      </div>
      <div class="empty" *ngIf="data.length === 0">No hotspots in the current window.</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .treemap-wrap {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        background:
          radial-gradient(
            circle at 15% 0%,
            color-mix(in oklab, var(--accent) 12%, transparent),
            transparent 38%
          ),
          var(--bg-surface-2);
      }
      svg {
        display: block;
      }
      .scale {
        position: absolute;
        right: 0.75rem;
        bottom: 0.65rem;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.28rem 0.5rem;
        border: 1px solid color-mix(in oklab, var(--border-soft) 72%, transparent);
        border-radius: 999px;
        background: color-mix(in oklab, var(--bg-surface) 88%, transparent);
        color: var(--fg-muted);
        font-size: 10px;
        box-shadow: var(--shadow-sm);
        pointer-events: none;
      }
      .scale-bar {
        width: 64px;
        height: 7px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--bg-surface-2), var(--accent));
      }
      .empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--fg-muted);
        font-size: 12px;
      }
    `,
  ],
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
    const styles = getComputedStyle(el);
    const accent = css(styles, '--accent', '#4f46e5');
    const muted = css(styles, '--fg-muted', '#64748b');
    const label = css(styles, '--fg-primary', '#0f172a');
    const surface = css(styles, '--bg-surface', '#ffffff');
    const halo = css(styles, '--bg-surface-2', '#f3f4f6');
    const border = css(styles, '--border-soft', '#e5e7eb');

    const root = d3
      .hierarchy<{ name: string; value?: number; children?: HotspotInput[] }>({
        name: 'root',
        children: this.data,
      } as never)
      .sum((d: any) => d.commits ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = d3.treemap<typeof root.data>().size([width, this.height]).padding(2).round(true);
    layout(root as never);

    const maxChurn = d3.max(this.data, (d) => d.additions + d.deletions) ?? 1;
    const color = d3
      .scaleSequential<string>()
      .domain([0, maxChurn])
      .interpolator(d3.interpolateRgb(halo, accent));

    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<HotspotInput>>('g')
      .data(root.leaves() as unknown as Array<d3.HierarchyRectangularNode<HotspotInput>>)
      .join('g')
      .attr('class', 'cell')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .on('click', (_e, d) => this.fileClick.emit((d.data as HotspotInput).file))
      .on('mouseenter', function () {
        d3.select(this)
          .select('rect')
          .attr('stroke-width', 2.5)
          .attr('filter', 'url(#hotspot-glow)');
      })
      .on('mouseleave', function () {
        d3.select(this).select('rect').attr('stroke-width', 1).attr('filter', null);
      });

    const defs = svg.append('defs');
    const filter = defs
      .append('filter')
      .attr('id', 'hotspot-glow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    filter
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 4)
      .attr('stdDeviation', 4)
      .attr('flood-color', accent)
      .attr('flood-opacity', 0.28);

    cell
      .append('rect')
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', (d) => {
        const h = d.data as HotspotInput;
        return color(h.additions + h.deletions);
      })
      .attr('stroke', border)
      .attr('stroke-width', 1);

    cell.append('title').text((d) => {
      const h = d.data as HotspotInput;
      return `${h.file}\nChanged in ${h.commits} commits by ${h.authors} authors\nLine churn: +${h.additions} -${h.deletions}`;
    });

    cell
      .append('text')
      .attr('class', 'cell-label')
      .attr('x', 4)
      .attr('y', 12)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-mono, monospace)')
      .attr('fill', label)
      .attr('stroke', surface)
      .attr('stroke-width', 2.4)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 40 || h < 18) return '';
        const file = (d.data as HotspotInput).file;
        return file.split('/').pop() ?? file;
      });

    cell
      .append('text')
      .attr('x', 4)
      .attr('y', 26)
      .attr('font-size', 9)
      .attr('fill', muted)
      .attr('stroke', surface)
      .attr('stroke-width', 2)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 70 || h < 34) return '';
        const hot = d.data as HotspotInput;
        return `${hot.commits} commits · ${hot.authors} authors`;
      });
  }
}

function css(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}
