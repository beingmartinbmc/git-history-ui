import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Commit, CommitNode } from '../../models/git.models';

@Component({
  selector: 'app-commit-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="graph-container">
      <svg #commitGraph width="100%" height="600"></svg>
    </div>
  `,
  styles: [`
    .graph-container {
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
    }

    /* Dark mode styles */
    .dark .graph-container {
      background-color: #2d2d2d;
    }
  `]
})
export class CommitGraphComponent implements AfterViewInit, OnChanges {
  @ViewChild('commitGraph', { static: true }) svgElement!: ElementRef;
  @Input() commits: Commit[] = [];
  @Output() commitClick = new EventEmitter<Commit>();

  private svg: any;
  private g: any;

  ngAfterViewInit() {
    this.initializeGraph();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['commits'] && this.svg) {
      this.renderGraph();
    }
  }

  private initializeGraph() {
    this.svg = d3.select(this.svgElement.nativeElement);
    this.g = this.svg.append('g');
    this.renderGraph();
  }

  private renderGraph() {
    if (!this.commits.length) return;

    this.g.selectAll('*').remove();

    const width = this.svgElement.nativeElement.getBoundingClientRect().width;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    // Create commit nodes
    const nodes: CommitNode[] = this.commits.map((commit, i) => ({
      id: commit.hash,
      x: (i % 10) * 80 + 40,
      y: Math.floor(i / 10) * 100 + 50,
      commit: commit
    }));

    // Create links between commits
    const links = [];
    for (let i = 1; i < nodes.length; i++) {
      links.push({
        source: nodes[i - 1],
        target: nodes[i]
      });
    }

    // Draw links
    this.g.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
      .attr('stroke', '#cbd5e0')
      .attr('stroke-width', 2);

    // Draw nodes
    const node = this.g.selectAll('.commit-node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'commit-node')
      .attr('transform', (d: CommitNode) => `translate(${d.x},${d.y})`);

    node.append('circle')
      .attr('r', 8)
      .attr('fill', '#3b82f6')
      .attr('stroke', '#1e40af')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 25)
      .attr('class', 'text-xs text-gray-600 dark:text-gray-400')
      .text((d: CommitNode) => d.commit.hash.substring(0, 6));

    // Add click handlers
    node.on('click', (event: any, d: CommitNode) => {
      this.commitClick.emit(d.commit);
    });
  }
}
