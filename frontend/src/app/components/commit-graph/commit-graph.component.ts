import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Commit, CommitNode } from '../../models/git.models';
import { ColorPalette } from '../../models/color-palette.models';

@Component({
  selector: 'app-commit-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="graph-container">
      <!-- Zoom Controls -->
      <div class="zoom-controls">
        <button class="zoom-btn" (click)="zoomIn()" title="Zoom In (+ or =)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
        <button class="zoom-btn" (click)="zoomOut()" title="Zoom Out (-)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
        <button class="zoom-btn" (click)="resetZoom()" title="Reset Zoom (0)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          </svg>
        </button>
        <span class="zoom-level" title="Current zoom level">{{ (zoomLevel * 100).toFixed(0) }}%</span>
      </div>
      
      <!-- Zoom Instructions -->
      <div class="zoom-instructions">
        <span>Use mouse wheel to zoom • Drag to pan • Click commits for details</span>
      </div>
      
      <svg #commitGraph width="100%" height="600"></svg>
    </div>
  `,
  styles: [`
    .graph-container {
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      transition: background-color 0.2s ease;
      position: relative;
    }

    .zoom-controls {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      z-index: 10;
      background-color: rgba(255, 255, 255, 0.9);
      padding: 0.5rem;
      border-radius: 0.375rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(4px);
    }

    .zoom-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: 1px solid #d1d5db;
      border-radius: 0.25rem;
      background-color: white;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .zoom-btn:hover {
      background-color: #f3f4f6;
      border-color: #9ca3af;
    }

    .zoom-btn:active {
      background-color: #e5e7eb;
    }

    .zoom-level {
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      min-width: 3rem;
      text-align: center;
    }

    .zoom-instructions {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      background-color: rgba(255, 255, 255, 0.9);
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(4px);
      font-size: 0.75rem;
      color: #6b7280;
      z-index: 10;
    }

    /* Dark mode styles */
    .dark .graph-container {
      background-color: #2d2d2d;
    }

    .dark .zoom-controls {
      background-color: rgba(45, 45, 45, 0.9);
      border: 1px solid #404040;
    }

    .dark .zoom-btn {
      background-color: #404040;
      border-color: #555;
      color: #e0e0e0;
    }

    .dark .zoom-btn:hover {
      background-color: #555;
      border-color: #666;
    }

    .dark .zoom-btn:active {
      background-color: #666;
    }

    .dark .zoom-level {
      color: #e0e0e0;
    }

    .dark .zoom-instructions {
      background-color: rgba(45, 45, 45, 0.9);
      color: #9ca3af;
      border: 1px solid #404040;
    }

    /* SVG dark mode support */
    .dark svg {
      background-color: transparent;
    }

    /* Zoom behavior styles */
    .commit-node {
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .commit-node:hover {
      transform: scale(1.1);
    }

    .commit-node circle {
      transition: all 0.2s ease;
    }

    .commit-node:hover circle {
      stroke-width: 3px;
    }
  `]
})
export class CommitGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('commitGraph', { static: true }) svgElement!: ElementRef;
  @Input() commits: Commit[] = [];
  @Input() colorPalette?: ColorPalette;
  @Output() commitClick = new EventEmitter<Commit>();

  private svg: any;
  private g: any;
  private zoom: any;
  private observer: MutationObserver | null = null;
  zoomLevel: number = 1;

  ngAfterViewInit() {
    this.initializeGraph();
    this.setupDarkModeObserver();
    this.setupKeyboardShortcuts();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['commits'] && this.svg) {
      this.renderGraph();
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    // Remove keyboard event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  // Zoom control methods
  zoomIn() {
    this.zoom.scaleBy(this.svg.transition().duration(300), 1.3);
  }

  zoomOut() {
    this.zoom.scaleBy(this.svg.transition().duration(300), 1 / 1.3);
  }

  resetZoom() {
    this.svg.transition().duration(300).call(
      this.zoom.transform,
      d3.zoomIdentity
    );
  }

  private setupKeyboardShortcuts() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown(event: KeyboardEvent) {
    // Only handle shortcuts when the graph is focused or when no input is focused
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.resetZoom();
        break;
    }
  }

  private initializeGraph() {
    this.svg = d3.select(this.svgElement.nativeElement);
    this.g = this.svg.append('g');
    
    // Initialize zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 5]) // Min 10%, Max 500%
      .on('zoom', (event) => {
        this.zoomLevel = event.transform.k;
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);
    this.renderGraph();
  }

  private renderGraph() {
    if (!this.commits.length) return;

    this.g.selectAll('*').remove();

    const width = this.svgElement.nativeElement.getBoundingClientRect().width;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    // Get colors based on dark mode
    const colors = this.getGraphColors();

    // Create a more realistic git graph structure
    const { nodes, links, branches } = this.createGitGraphStructure();

    // Create force simulation for better layout
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create branch lines (different colors for different branches)
    const branchGroups = this.g.selectAll('.branch-group')
      .data(branches)
      .enter().append('g')
      .attr('class', 'branch-group');

    branchGroups.selectAll('.branch-line')
      .data((d: any) => d.links)
      .enter().append('line')
      .attr('class', 'branch-line')
      .attr('stroke', (d: any, i: number) => this.getBranchColor(d.branch, colors))
      .attr('stroke-width', 3)
      .attr('opacity', 0.7);

    // Create links between commits
    this.g.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', colors.link)
      .attr('stroke-width', 2)
      .attr('opacity', 0.5);

    // Create commit nodes
    const node = this.g.selectAll('.commit-node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'commit-node')
      .style('cursor', 'pointer');

    // Add circles for nodes
    node.append('circle')
      .attr('r', 10)
      .attr('fill', (d: any) => this.getNodeColor(d, colors))
      .attr('stroke', colors.nodeStroke)
      .attr('stroke-width', 2);

    // Add commit hash text
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 25)
      .attr('fill', colors.text)
      .attr('class', 'text-xs')
      .text((d: any) => d.commit.hash.substring(0, 6));

    // Add commit message on hover
    node.append('title')
      .text((d: any) => `${d.commit.message}\n${d.commit.author}\n${this.formatDate(d.commit.date)}`);

    // Add click handlers
    node.on('click', (event: any, d: any) => {
      this.commitClick.emit(d.commit);
    });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Update branch lines
      branchGroups.selectAll('.branch-line')
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      // Update links
      this.g.selectAll('.link')
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      // Update nodes
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  }

  private getGraphColors() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    console.log('Graph colors - Dark mode:', isDarkMode);
    
    if (this.colorPalette) {
      return {
        link: this.colorPalette.colors.link,
        nodeFill: this.colorPalette.colors.nodeFill,
        nodeStroke: this.colorPalette.colors.nodeStroke,
        text: this.colorPalette.colors.graphText
      };
    }
    
    // Fallback to default colors
    if (isDarkMode) {
      return {
        link: '#4b5563',        // gray-600 for dark mode
        nodeFill: '#3b82f6',    // blue-500 (same for both modes)
        nodeStroke: '#1e40af',  // blue-700 (same for both modes)
        text: '#9ca3af'         // gray-400 for dark mode
      };
    } else {
      return {
        link: '#cbd5e0',        // gray-300 for light mode
        nodeFill: '#3b82f6',    // blue-500 (same for both modes)
        nodeStroke: '#1e40af',  // blue-700 (same for both modes)
        text: '#6b7280'         // gray-500 for light mode
      };
    }
  }

  private setupDarkModeObserver() {
    // Observe changes to the document element's class list
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Re-render graph when dark mode changes
          if (this.svg) {
            this.renderGraph();
          }
        }
      });
    });

    // Start observing the document element for class changes
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  private createGitGraphStructure() {
    const nodes = this.commits.map((commit, i) => ({
      id: commit.hash,
      commit: commit,
      branch: commit.branches[0] || 'main',
      index: i,
      isMerge: commit.parents && commit.parents.length > 1,
      isBranch: commit.branches.length > 0
    }));

    const links = [];
    const branches: any[] = [];
    const branchColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    // Create links between commits
    for (let i = 1; i < nodes.length; i++) {
      const current = nodes[i];
      const previous = nodes[i - 1];
      
      links.push({
        source: previous.id,
        target: current.id,
        branch: current.branch
      });
    }

    // Group commits by branch
    const branchGroups = new Map();
    nodes.forEach(node => {
      const branch = node.branch;
      if (!branchGroups.has(branch)) {
        branchGroups.set(branch, []);
      }
      branchGroups.get(branch).push(node);
    });

    // Create branch structures
    branchGroups.forEach((branchNodes, branchName) => {
      const branchLinks = [];
      for (let i = 1; i < branchNodes.length; i++) {
        branchLinks.push({
          source: branchNodes[i - 1],
          target: branchNodes[i],
          branch: branchName
        });
      }
      
      branches.push({
        name: branchName,
        links: branchLinks,
        color: branchColors[branches.length % branchColors.length]
      });
    });

    return { nodes, links, branches };
  }

  private getBranchColor(branchName: string, colors: any): string {
    const branchColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    const branchIndex = branchName.charCodeAt(0) % branchColors.length;
    return branchColors[branchIndex];
  }

  private getNodeColor(node: any, colors: any): string {
    if (node.isMerge) {
      return '#8b5cf6'; // Purple for merge commits
    } else if (node.isBranch) {
      return '#10b981'; // Green for branch commits
    } else {
      return colors.nodeFill;
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}
