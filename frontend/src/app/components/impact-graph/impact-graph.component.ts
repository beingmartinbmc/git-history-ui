import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';
import { CommitImpact } from '../../models/git.models';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: 'changed' | 'imported' | 'module';
  label: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  type: 'imports' | 'in-module';
}

@Component({
  selector: 'app-impact-graph',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="graph-head">
      <div class="legend">
        <span class="legend-item"><span class="dot dot-changed"></span>changed file</span>
        <span class="legend-item"><span class="dot dot-imported"></span>import dependency</span>
        <span class="legend-item"><span class="dot dot-module"></span>module</span>
      </div>
      <span class="hint">Scroll to explore. Lines show module membership and imports.</span>
    </div>
    <div class="canvas-wrap" tabindex="0">
      <svg #svg aria-label="Commit impact graph"></svg>
      <div class="empty" *ngIf="!hasData">
        No graph data — changed files have no detectable internal imports.
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .graph-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        font-size: 11px;
        color: var(--fg-muted);
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .hint {
        flex: 0 0 auto;
        color: var(--fg-subtle);
        font-size: 11px;
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 4px;
      }
      .dot-changed {
        background: var(--accent);
      }
      .dot-imported {
        background: #f59e0b;
      }
      .dot-module {
        background: #8b5cf6;
      }
      .canvas-wrap {
        position: relative;
        max-height: 430px;
        min-height: 320px;
        background:
          radial-gradient(
            circle at 20% 0%,
            color-mix(in oklab, var(--accent) 12%, transparent),
            transparent 34%
          ),
          var(--bg-surface-2);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-soft);
        overflow: auto;
        overscroll-behavior: contain;
      }
      .canvas-wrap:focus-visible {
        outline: 2px solid var(--border-focus);
        outline-offset: 2px;
      }
      svg {
        display: block;
      }
      .empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--fg-muted);
        font-size: 11px;
        pointer-events: none;
      }
      :host ::ng-deep .column-title {
        fill: var(--fg-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      :host ::ng-deep .node-label {
        font-size: 10px;
        fill: var(--fg-secondary);
        font-family: var(--font-mono, monospace);
        pointer-events: none;
        paint-order: stroke;
        stroke: var(--bg-surface-2);
        stroke-width: 3px;
        stroke-linejoin: round;
      }
      :host ::ng-deep .node-label.changed {
        fill: var(--fg-primary);
        font-weight: 700;
      }
      :host ::ng-deep .label-bg {
        fill: color-mix(in oklab, var(--bg-surface) 78%, transparent);
        stroke: var(--border-soft);
        stroke-width: 1px;
        opacity: 0.92;
      }
      :host ::ng-deep .impact-link {
        fill: none;
        stroke-linecap: round;
      }
      :host ::ng-deep .impact-link.imports {
        stroke: #f59e0b;
        stroke-width: 2.2px;
        stroke-opacity: 0.78;
      }
      :host ::ng-deep .impact-link.in-module {
        stroke: #8b5cf6;
        stroke-width: 2px;
        stroke-opacity: 0.62;
        stroke-dasharray: 5 5;
      }
    `,
  ],
})
export class ImpactGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() impact: CommitImpact | null = null;
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  private simulation: d3.Simulation<Node, Link> | null = null;
  hasData = false;

  ngAfterViewInit() {
    this.render();
  }

  ngOnChanges() {
    this.render();
  }

  ngOnDestroy() {
    this.simulation?.stop();
  }

  private render() {
    if (!this.svgRef) return;
    const svgEl = this.svgRef.nativeElement;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const impact = this.impact;
    if (!impact || (impact.dependencyRipple.length === 0 && impact.modules.length === 0)) {
      this.hasData = false;
      return;
    }
    this.hasData = true;

    const nodeMap = new Map<string, Node>();
    const ensure = (id: string, group: Node['group'], label: string): Node => {
      let n = nodeMap.get(id);
      if (!n) {
        n = { id, group, label };
        nodeMap.set(id, n);
      }
      return n;
    };

    for (const file of impact.files) {
      ensure(`f:${file}`, 'changed', shortLabel(file));
    }
    for (const m of impact.modules) {
      ensure(`m:${m}`, 'module', m);
    }
    for (const r of impact.dependencyRipple) {
      ensure(`f:${r.from}`, 'changed', shortLabel(r.from));
      ensure(`f:${r.to}`, 'imported', shortLabel(r.to));
    }

    const links: Link[] = [];
    for (const r of impact.dependencyRipple) {
      links.push({ source: `f:${r.from}`, target: `f:${r.to}`, type: 'imports' });
    }
    for (const file of impact.files) {
      const mod = detectModule(file);
      if (impact.modules.includes(mod)) {
        links.push({ source: `f:${file}`, target: `m:${mod}`, type: 'in-module' });
      }
    }

    const nodes = Array.from(nodeMap.values());
    const wrapWidth = svgEl.parentElement?.clientWidth ?? 640;
    const modules = nodes.filter((n) => n.group === 'module').sort(byLabel);
    const changed = nodes.filter((n) => n.group === 'changed').sort(byLabel);
    const imported = nodes.filter((n) => n.group === 'imported').sort(byLabel);
    const maxRows = Math.max(modules.length, changed.length, imported.length, 4);
    const rowHeight = 44;
    const top = 58;
    const columns = {
      module: 68,
      changed: 430,
      imported: 780,
    };
    const width = Math.max(
      wrapWidth,
      columns.imported + Math.max(320, maxLabelWidth(imported)) + 80,
    );
    const height = Math.max(360, top + maxRows * rowHeight + 40);

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'transparent');

    svg
      .append('g')
      .selectAll('text')
      .data([
        { label: 'Modules', x: columns.module },
        { label: 'Changed files', x: columns.changed },
        { label: 'Import dependencies', x: columns.imported },
      ])
      .join('text')
      .attr('class', 'column-title')
      .attr('x', (d) => d.x)
      .attr('y', 28)
      .text((d) => d.label);

    positionColumn(modules, columns.module, top, rowHeight);
    positionColumn(changed, columns.changed, top, rowHeight);
    positionColumn(imported, columns.imported, top, rowHeight);

    const link = svg
      .append('g')
      .selectAll<SVGPathElement, Link>('path')
      .data(links)
      .join('path')
      .attr('class', (d) => `impact-link ${d.type}`)
      .attr('d', (d) => {
        const source = nodeMap.get(String(d.source));
        const target = nodeMap.get(String(d.target));
        return source && target ? linkPath(source, target) : '';
      });

    const node = svg
      .append('g')
      .selectAll<SVGCircleElement, Node>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => (d.group === 'module' ? 7 : 5))
      .attr('fill', (d) =>
        d.group === 'changed' ? 'var(--accent)' : d.group === 'imported' ? '#f59e0b' : '#8b5cf6',
      )
      .attr('stroke', 'var(--bg-surface-2)')
      .attr('stroke-width', 1.5)
      .attr('cx', (d) => d.x ?? 0)
      .attr('cy', (d) => d.y ?? 0);

    node.append('title').text((d) => `${d.group}: ${d.id.slice(2)}`);

    const labelBg = svg
      .append('g')
      .selectAll<SVGRectElement, Node>('rect')
      .data(nodes)
      .join('rect')
      .attr('class', 'label-bg')
      .attr('width', (d) => labelWidth(d))
      .attr('height', 18)
      .attr('rx', 5)
      .attr('ry', 5)
      .attr('x', (d) => (d.x ?? 0) + 10)
      .attr('y', (d) => (d.y ?? 0) - 11);

    const label = svg
      .append('g')
      .selectAll<SVGTextElement, Node>('text')
      .data(nodes)
      .join('text')
      .attr('class', (d) => `node-label ${d.group}`)
      .attr('x', (d) => (d.x ?? 0) + 14)
      .attr('y', (d) => (d.y ?? 0) + 4)
      .text((d) => d.label);

    this.simulation?.stop();
    this.simulation = null;
  }
}

function shortLabel(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 1];
}

function labelWidth(node: Node): number {
  const chars = node.label.length;
  return Math.max(112, Math.min(520, chars * 6.7 + 18));
}

function maxLabelWidth(nodes: Node[]): number {
  return Math.max(0, ...nodes.map((node) => labelWidth(node)));
}

function byLabel(a: Node, b: Node): number {
  return a.label.localeCompare(b.label);
}

function positionColumn(nodes: Node[], x: number, top: number, rowHeight: number): void {
  for (const [index, node] of nodes.entries()) {
    node.x = x;
    node.y = top + index * rowHeight;
  }
}

function linkPath(source: Node, target: Node): string {
  const x1 = source.x ?? 0;
  const y1 = source.y ?? 0;
  const x2 = target.x ?? 0;
  const y2 = target.y ?? 0;
  const bend = Math.max(72, Math.abs(x2 - x1) * 0.42);
  const direction = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`;
}

function detectModule(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}
