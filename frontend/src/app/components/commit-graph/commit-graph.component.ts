import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject
} from '@angular/core';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';

interface Node {
  commit: Commit;
  row: number;
  lane: number;
}

const ROW_H = 28;
const LANE_W = 18;
const NODE_R = 5;
const PAD_X = 14;
const PAD_Y = 14;

const LANE_COLORS = [
  '#4f46e5',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9'
];

@Component({
  selector: 'app-commit-graph',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <span>Graph</span>
      <span class="hint">Swim-lane visualization</span>
    </div>
    <div class="scroll" #scroll>
      <canvas #canvas></canvas>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-soft);
    }
    .header {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
      font-size: 12px;
      color: var(--fg-muted);
    }
    .scroll {
      flex: 1;
      overflow: auto;
      min-height: 0;
    }
    canvas {
      display: block;
    }
  `]
})
export class CommitGraphComponent implements AfterViewInit {
  state = inject(UiStateService);

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scroll', { static: true }) scrollRef!: ElementRef<HTMLDivElement>;

  private nodes: Node[] = [];
  private rowByHash = new Map<string, Node>();
  private laneCount = 1;

  constructor() {
    effect(() => {
      // recompute when commits change
      this.layout(this.state.commits());
      this.draw();
    });
    effect(() => {
      // re-draw on selection change
      void this.state.selectedHash();
      this.draw();
    });
  }

  ngAfterViewInit() {
    this.canvasRef.nativeElement.addEventListener('click', (e) => this.onClick(e));
    this.draw();
  }

  @HostListener('window:resize')
  onResize() {
    this.draw();
  }

  private layout(commits: Commit[]) {
    this.nodes = [];
    this.rowByHash.clear();
    if (!commits.length) {
      this.laneCount = 1;
      return;
    }

    // Lane allocation: walk commits in display order (newest first).
    // active lanes: array of expected hashes (or null when free).
    const active: (string | null)[] = [];
    const allocate = (hash: string): number => {
      const idx = active.indexOf(hash);
      if (idx >= 0) return idx;
      const free = active.indexOf(null);
      if (free >= 0) {
        active[free] = hash;
        return free;
      }
      active.push(hash);
      return active.length - 1;
    };

    for (let row = 0; row < commits.length; row++) {
      const c = commits[row];
      const lane = allocate(c.hash);
      const node: Node = { commit: c, row, lane };
      this.nodes.push(node);
      this.rowByHash.set(c.hash, node);

      // Replace this lane with first parent (continues the line down).
      const [first, ...rest] = c.parents;
      active[lane] = first ?? null;

      // Additional parents: try to merge into existing lanes if already there;
      // otherwise allocate new lanes.
      for (const p of rest) {
        if (active.indexOf(p) === -1) {
          const free = active.indexOf(null);
          if (free >= 0) active[free] = p;
          else active.push(p);
        }
      }

      // Compact trailing nulls to keep laneCount tight.
      while (active.length && active[active.length - 1] === null) active.pop();
    }

    this.laneCount = Math.max(
      1,
      this.nodes.reduce((m, n) => Math.max(m, n.lane + 1), 0)
    );
  }

  private draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = PAD_X * 2 + this.laneCount * LANE_W;
    const h = PAD_Y * 2 + this.nodes.length * ROW_H;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.nodes.length) return;

    const xOf = (lane: number) => PAD_X + lane * LANE_W + LANE_W / 2;
    const yOf = (row: number) => PAD_Y + row * ROW_H + ROW_H / 2;
    const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

    // edges
    ctx.lineWidth = 2;
    for (const node of this.nodes) {
      for (const ph of node.commit.parents) {
        const target = this.rowByHash.get(ph);
        if (!target) continue;
        ctx.strokeStyle = color(target.lane);
        const x1 = xOf(node.lane);
        const y1 = yOf(node.row);
        const x2 = xOf(target.lane);
        const y2 = yOf(target.row);
        ctx.beginPath();
        if (x1 === x2) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        } else {
          ctx.moveTo(x1, y1);
          const my = y1 + ROW_H * 0.6;
          ctx.bezierCurveTo(x1, my, x2, y1 + ROW_H * 0.4, x2, my);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
    }

    // nodes
    const selectedHash = this.state.selectedHash();
    for (const node of this.nodes) {
      const x = xOf(node.lane);
      const y = yOf(node.row);
      const c = color(node.lane);
      const isSel = node.commit.hash === selectedHash;
      const r = isSel ? NODE_R + 2 : NODE_R;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.commit.isMerge ? 'transparent' : c;
      ctx.fill();
      ctx.lineWidth = node.commit.isMerge || isSel ? 2.5 : 1.5;
      ctx.strokeStyle = c;
      ctx.stroke();

      if (isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private onClick(e: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const row = Math.floor((y - PAD_Y) / ROW_H);
    const node = this.nodes[row];
    if (node) this.state.selectHash(node.commit.hash);
  }
}
