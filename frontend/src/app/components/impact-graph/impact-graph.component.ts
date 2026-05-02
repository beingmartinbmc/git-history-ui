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
    <div class="legend">
      <span class="dot dot-changed"></span> changed
      <span class="dot dot-imported"></span> imports
      <span class="dot dot-module"></span> module
    </div>
    <div class="canvas-wrap">
      <svg #svg width="100%" height="280" aria-label="Commit impact graph"></svg>
      <div class="empty" *ngIf="!hasData">No graph data — changed files have no detectable internal imports.</div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .legend {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      font-size: 11px;
      color: var(--fg-muted);
      margin-bottom: 0.4rem;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 4px;
    }
    .dot-changed { background: var(--accent); }
    .dot-imported { background: #f59e0b; }
    .dot-module { background: #8b5cf6; }
    .canvas-wrap {
      position: relative;
      background: var(--bg-app);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-soft);
      overflow: hidden;
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
    svg :global(.node-label) {
      font-size: 9px;
      fill: var(--fg-secondary);
      font-family: var(--font-mono, monospace);
      pointer-events: none;
    }
  `]
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

    const width = svgEl.clientWidth || 600;
    const height = 280;

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

    const link = svg
      .append('g')
      .attr('stroke', 'var(--border-strong)')
      .attr('stroke-opacity', 0.5)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-dasharray', (d) => (d.type === 'in-module' ? '2,3' : null));

    const node = svg
      .append('g')
      .selectAll<SVGCircleElement, Node>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => (d.group === 'module' ? 7 : 5))
      .attr('fill', (d) =>
        d.group === 'changed'
          ? 'var(--accent)'
          : d.group === 'imported'
          ? '#f59e0b'
          : '#8b5cf6'
      )
      .attr('stroke', 'var(--bg-app)')
      .attr('stroke-width', 1.5)
      .call(drag());

    node.append('title').text((d) => d.id.slice(2));

    const label = svg
      .append('g')
      .selectAll<SVGTextElement, Node>('text')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('dx', 8)
      .attr('dy', 3)
      .text((d) => d.label);

    this.simulation?.stop();
    this.simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(links)
          .id((d: Node) => d.id)
          .distance(60)
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(14))
      .on('tick', () => {
        link
          .attr('x1', (d) => (d.source as Node).x ?? 0)
          .attr('y1', (d) => (d.source as Node).y ?? 0)
          .attr('x2', (d) => (d.target as Node).x ?? 0)
          .attr('y2', (d) => (d.target as Node).y ?? 0);
        node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
        label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
      });

    function drag() {
      function dragstarted(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, Node, Node>, d: Node) {
        if (!event.active) (window as unknown as { __impactSim?: d3.Simulation<Node, Link> }).__impactSim?.alphaTarget?.(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(_event: d3.D3DragEvent<SVGCircleElement, Node, Node>, d: Node) {
        d.fx = _event.x;
        d.fy = _event.y;
      }
      function dragended(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, Node, Node>, d: Node) {
        if (!event.active) (window as unknown as { __impactSim?: d3.Simulation<Node, Link> }).__impactSim?.alphaTarget?.(0);
        d.fx = null;
        d.fy = null;
      }
      return d3
        .drag<SVGCircleElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    (window as unknown as { __impactSim?: d3.Simulation<Node, Link> }).__impactSim = this.simulation;
  }
}

function shortLabel(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 1];
}

function detectModule(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
}
