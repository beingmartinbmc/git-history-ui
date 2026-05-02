import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject
} from '@angular/core';
import { Commit } from '../../models/git.models';
import { ThemeService } from '../../services/theme.service';
import { UiStateService } from '../../services/ui-state.service';

interface Node {
  commit: Commit;
  row: number;
  lane: number;
}

interface GraphTheme {
  accent: string;
  accentSoft: string;
  guide: string;
  nodeRing: string;
  rowAlt: string;
  rowHover: string;
  rowSelected: string;
  shadow: string;
  surface: string;
  warning: string;
  warningSoft: string;
}

const ROW_H = 34;
const LANE_W = 24;
const NODE_R = 5.5;
const PAD_X = 16;
const PAD_Y = 16;

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
      <div class="title">
        <span>Graph</span>
        <span class="hint">{{ graphSummary() }}</span>
      </div>
      <div class="legend" aria-hidden="true">
        <span
          class="swatch"
          *ngFor="let color of legendColors"
          [style.background]="color"
        ></span>
      </div>
    </div>
    <div class="scroll" #scroll>
      <!--
        The phantom div carries the full content height so the browser
        renders a real scrollbar. The canvas itself is sized to the
        viewport only and follows the scroll via a transform. Drawing
        translates the world by -scrollTop so visible rows land at the
        correct pixels. This is the only pattern that scales to repos
        with 50k+ commits — browsers cap canvas height at ~32k px, so a
        naive content-sized canvas goes blank past ~960 commits.
      -->
      <div class="phantom" [style.height.px]="contentHeight()"></div>
      <canvas
        #canvas
        aria-label="Commit graph"
        role="img"
      ></canvas>
      <div class="empty" *ngIf="!state.commits().length && !state.loading()">
        No commits to draw.
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: transparent;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
      font-size: 12px;
      color: var(--fg-muted);
      background: color-mix(in oklab, var(--bg-surface) 88%, transparent);
    }
    .title {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .title > span:first-child {
      color: var(--fg-primary);
      font-size: 13px;
      font-weight: 600;
    }
    .hint {
      white-space: nowrap;
    }
    .legend {
      display: flex;
      gap: 4px;
      align-items: center;
      flex: 0 0 auto;
    }
    .swatch {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      box-shadow: 0 0 0 2px var(--bg-surface);
    }
    .scroll {
      position: relative;
      flex: 1;
      overflow: auto;
      min-height: 0;
      background:
        radial-gradient(circle at 24px 24px, var(--graph-row-alt) 0 1px, transparent 1px 100%),
        linear-gradient(180deg, color-mix(in oklab, var(--bg-surface) 92%, transparent), color-mix(in oklab, var(--bg-surface-2) 76%, transparent));
      background-size: 24px 24px;
    }
    .phantom {
      width: 1px;
      pointer-events: none;
    }
    canvas {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: auto;
      will-change: transform;
    }
    .empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 1rem;
      color: var(--fg-muted);
      font-size: 12px;
      text-align: center;
    }
  `]
})
export class CommitGraphComponent implements AfterViewInit, OnDestroy {
  state = inject(UiStateService);
  private theme = inject(ThemeService);

  readonly legendColors = LANE_COLORS.slice(0, 5);
  readonly graphSummary = computed(() => {
    const commits = this.state.commits().length;
    const lanes = this.laneCount;
    return commits
      ? `${commits.toLocaleString()} commits across ${lanes} lane${lanes === 1 ? '' : 's'}`
      : 'Swim-lane visualization';
  });
  readonly contentHeight = computed(() => {
    const n = this.state.commits().length;
    return n ? PAD_Y * 2 + n * ROW_H : 0;
  });

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scroll', { static: true }) scrollRef!: ElementRef<HTMLDivElement>;

  private nodes: Node[] = [];
  private rowByHash = new Map<string, Node>();
  private laneCount = 1;
  private hoverRow = -1;
  private layoutToken = 0;
  private idleHandle: number | null = null;
  private canvasSize = { width: 0, height: 0, dpr: 0 };
  private canvasTransform = '';
  private readonly onCanvasClick = (e: MouseEvent) => this.onClick(e);
  private readonly onCanvasMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly onCanvasLeave = () => this.onMouseLeave();
  private scrollRaf = 0;
  private readonly onScroll = () => {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      this.draw();
    });
  };

  constructor() {
    effect(() => {
      // Recompute when commits change.
      this.scheduleLayout(this.state.commits());
    });
    effect(() => {
      // Re-draw on selection change and theme changes.
      void this.state.selectedHash();
      void this.theme.resolved();
      this.draw();
    });
  }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('click', this.onCanvasClick);
    canvas.addEventListener('mousemove', this.onCanvasMove);
    canvas.addEventListener('mouseleave', this.onCanvasLeave);
    this.scrollRef?.nativeElement.addEventListener('scroll', this.onScroll, { passive: true });
    this.draw();
  }

  ngOnDestroy() {
    const canvas = this.canvasRef?.nativeElement;
    canvas?.removeEventListener('click', this.onCanvasClick);
    canvas?.removeEventListener('mousemove', this.onCanvasMove);
    canvas?.removeEventListener('mouseleave', this.onCanvasLeave);
    this.scrollRef?.nativeElement.removeEventListener('scroll', this.onScroll);
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
    this.cancelIdleLayout();
  }

  @HostListener('window:resize')
  onResize() {
    this.draw();
  }

  private scheduleLayout(commits: Commit[]) {
    const token = ++this.layoutToken;
    this.cancelIdleLayout();
    this.nodes = [];
    this.rowByHash.clear();
    this.hoverRow = -1;
    if (!commits.length) {
      this.laneCount = 1;
      this.draw();
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

    const processRow = (row: number) => {
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
      if (lane + 1 > this.laneCount) this.laneCount = lane + 1;
    };

    this.laneCount = 1;
    if (commits.length <= 5_000) {
      for (let row = 0; row < commits.length; row++) processRow(row);
      this.draw();
      return;
    }

    let row = 0;
    const step = (deadline?: IdleDeadline) => {
      if (token !== this.layoutToken) return;
      const started = performance.now();
      while (row < commits.length) {
        processRow(row++);
        const idleRemaining = deadline?.timeRemaining?.() ?? 0;
        if (row % 250 === 0 && idleRemaining <= 1 && performance.now() - started > 8) break;
      }
      this.draw();
      if (row < commits.length && token === this.layoutToken) {
        this.idleHandle = this.requestIdle(step);
      }
    };
    this.idleHandle = this.requestIdle(step);
  }

  private draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const scroll = this.scrollRef?.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const contentW = PAD_X * 2 + this.laneCount * LANE_W;

    // The canvas is sized to the viewport (NOT the full content) so it
    // never exceeds the browser's ~32k px max canvas dimension regardless
    // of repo size. We follow the scroll via a transform and translate
    // the drawing context by -scrollTop so world coordinates still map
    // to the right pixels on screen.
    const scrollTop = scroll?.scrollTop ?? 0;
    const viewportH = scroll?.clientHeight ?? 0;
    const w = Math.max(contentW, scroll?.clientWidth ?? contentW);
    const h = Math.max(viewportH || ROW_H * 8, ROW_H);
    this.ensureCanvasSize(canvas, w, h, dpr);
    const transform = `translateY(${scrollTop}px)`;
    if (this.canvasTransform !== transform) {
      this.canvasTransform = transform;
      canvas.style.transform = transform;
    }

    const ctx = canvas.getContext('2d')!;
    const theme = this.readTheme(canvas);
    // Pre-translate by -scrollTop so all world-coordinate draws land in
    // the correct viewport pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollTop * dpr);
    ctx.clearRect(0, scrollTop, w, h);
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, scrollTop, w, h);
    if (!this.nodes.length) return;

    const xOf = (lane: number) => PAD_X + lane * LANE_W + LANE_W / 2;
    const yOf = (row: number) => PAD_Y + row * ROW_H + ROW_H / 2;
    const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];
    const selectedHash = this.state.selectedHash();

    // Viewport culling: only draw rows whose center falls within the
    // currently scrolled-to band of the canvas (plus a 4-row buffer above
    // and below to keep edges from "popping in"). Lane allocation still
    // walks every commit because parent threading needs full context.
    const buffer = ROW_H * 4;
    const minRow = Math.max(0, Math.floor((scrollTop - PAD_Y - buffer) / ROW_H));
    const maxRow = Math.min(
      this.nodes.length - 1,
      Math.ceil((scrollTop + h - PAD_Y + buffer) / ROW_H)
    );
    const visible = this.nodes.slice(minRow, maxRow + 1);

    this.drawRows(ctx, w, xOf, yOf, theme, selectedHash, visible);
    this.drawGuides(ctx, scrollTop, h, theme);

    // Edges. Iterate visible rows; their parents may be off-screen but
    // are still drawn (truncated by canvas clip) — important for the
    // "lines coming in from above" visual cue.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const node of visible) {
      for (const ph of node.commit.parents) {
        const target = this.rowByHash.get(ph);
        if (!target) continue;
        const x1 = xOf(node.lane);
        const y1 = yOf(node.row);
        const x2 = xOf(target.lane);
        const y2 = yOf(target.row);

        ctx.strokeStyle = theme.shadow;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.35;
        this.drawEdge(ctx, x1, y1, x2, y2);

        ctx.strokeStyle = color(target.lane);
        ctx.lineWidth = node.commit.isMerge ? 2.6 : 2.2;
        ctx.globalAlpha = selectedHash && selectedHash !== node.commit.hash && selectedHash !== target.commit.hash
          ? 0.55
          : 0.9;
        this.drawEdge(ctx, x1, y1, x2, y2);
        ctx.globalAlpha = 1;
      }
    }

    // Nodes (visible only).
    for (const node of visible) {
      const x = xOf(node.lane);
      const y = yOf(node.row);
      const c = color(node.lane);
      const isSel = node.commit.hash === selectedHash;
      const isHover = node.row === this.hoverRow;
      const r = isSel ? NODE_R + 2 : isHover ? NODE_R + 1 : NODE_R;

      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = theme.nodeRing;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.commit.isMerge ? theme.surface : c;
      ctx.fill();
      ctx.lineWidth = node.commit.isMerge || isSel ? 2.5 : 1.75;
      ctx.strokeStyle = c;
      ctx.stroke();

      if (isSel || isHover) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = c;
        ctx.globalAlpha = isSel ? 0.42 : 0.24;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawRows(
    ctx: CanvasRenderingContext2D,
    width: number,
    xOf: (lane: number) => number,
    yOf: (row: number) => number,
    theme: GraphTheme,
    selectedHash: string | null,
    visible: Node[] = this.nodes
  ) {
    for (const node of visible) {
      const y = yOf(node.row) - ROW_H / 2;
      if (node.row % 2 === 1) {
        ctx.fillStyle = theme.rowAlt;
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (node.row === this.hoverRow || node.commit.hash === selectedHash) {
        ctx.fillStyle = node.commit.hash === selectedHash ? theme.rowSelected : theme.rowHover;
        this.roundRect(ctx, 6, y + 3, width - 12, ROW_H - 6, 8);
        ctx.fill();
      }
      if (node.commit.branches.length || node.commit.tags.length) {
        const x = xOf(node.lane) + NODE_R + 8;
        this.drawRefPill(ctx, x, yOf(node.row), node.commit, theme);
      }
    }
  }

  private drawGuides(ctx: CanvasRenderingContext2D, scrollTop: number, height: number, theme: GraphTheme) {
    ctx.save();
    ctx.strokeStyle = theme.guide;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    const y1 = scrollTop;
    const y2 = scrollTop + height;
    for (let lane = 0; lane < this.laneCount; lane++) {
      const x = PAD_X + lane * LANE_W + LANE_W / 2;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);
    if (
      this.canvasSize.width === pixelWidth &&
      this.canvasSize.height === pixelHeight &&
      this.canvasSize.dpr === dpr
    ) {
      return;
    }
    this.canvasSize = { width: pixelWidth, height: pixelHeight, dpr };
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  private requestIdle(cb: (deadline?: IdleDeadline) => void): number {
    const ric = window.requestIdleCallback;
    if (ric) return ric(cb, { timeout: 100 });
    return window.setTimeout(() => cb(), 16);
  }

  private cancelIdleLayout() {
    if (this.idleHandle === null) return;
    if (window.cancelIdleCallback) window.cancelIdleCallback(this.idleHandle);
    else clearTimeout(this.idleHandle);
    this.idleHandle = null;
  }

  private drawEdge(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (x1 === x2) {
      ctx.lineTo(x2, y2);
    } else {
      const midY = y1 + Math.min(ROW_H * 0.75, Math.max(12, (y2 - y1) * 0.36));
      ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
    }
    ctx.stroke();
  }

  private drawRefPill(ctx: CanvasRenderingContext2D, x: number, y: number, commit: Commit, theme: GraphTheme) {
    const label = commit.tags[0] ?? commit.branches.find((b) => !isRemoteBranch(b));
    if (!label) return;

    const maxWidth = Math.max(0, ctx.canvas.clientWidth - x - 8);
    if (maxWidth < 28) return;
    const text = ellipsize(label, maxWidth > 72 ? 12 : 8);
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    const width = Math.min(maxWidth, 72, ctx.measureText(text).width + 14);
    const height = 18;
    ctx.fillStyle = commit.tags.length ? theme.warningSoft : theme.accentSoft;
    this.roundRect(ctx, x, y - height / 2, width, height, 999);
    ctx.fill();
    ctx.fillStyle = commit.tags.length ? theme.warning : theme.accent;
    ctx.fillText(text, x + 7, y + 3.5);
  }

  private onClick(e: MouseEvent) {
    const node = this.nodeFromEvent(e);
    if (node) this.state.selectHash(node.commit.hash);
  }

  private onMouseMove(e: MouseEvent) {
    const node = this.nodeFromEvent(e);
    const next = node?.row ?? -1;
    if (next === this.hoverRow) return;
    this.hoverRow = next;
    this.canvasRef.nativeElement.style.cursor = node ? 'pointer' : 'default';
    this.draw();
  }

  private onMouseLeave() {
    if (this.hoverRow === -1) return;
    this.hoverRow = -1;
    this.canvasRef.nativeElement.style.cursor = 'default';
    this.draw();
  }

  private nodeFromEvent(e: MouseEvent): Node | undefined {
    // Canvas is positioned at (0, 0) inside a relative .scroll container
    // and shifted via transform by scrollTop. We need world coordinates,
    // so add scrollTop back to the click offset.
    const scroll = this.scrollRef?.nativeElement;
    const rect = scroll?.getBoundingClientRect();
    if (!rect) return undefined;
    const y = e.clientY - rect.top + (scroll?.scrollTop ?? 0);
    const row = Math.floor((y - PAD_Y) / ROW_H);
    return this.nodes[row];
  }

  private readTheme(canvas: HTMLCanvasElement): GraphTheme {
    const styles = getComputedStyle(canvas);
    return {
      accent: this.css(styles, '--accent', '#4f46e5'),
      accentSoft: this.css(styles, '--accent-soft', '#eef2ff'),
      guide: this.css(styles, '--graph-guide', 'rgba(148, 163, 184, 0.28)'),
      nodeRing: this.css(styles, '--graph-node-ring', '#ffffff'),
      rowAlt: this.css(styles, '--graph-row-alt', 'rgba(15, 23, 42, 0.025)'),
      rowHover: this.css(styles, '--graph-row-hover', 'rgba(79, 70, 229, 0.08)'),
      rowSelected: this.css(styles, '--graph-row-selected', 'rgba(79, 70, 229, 0.14)'),
      shadow: this.css(styles, '--graph-shadow', 'rgba(15, 23, 42, 0.12)'),
      surface: this.css(styles, '--bg-panel', '#ffffff'),
      warning: this.css(styles, '--warning', '#d97706'),
      warningSoft: 'rgba(217, 119, 6, 0.15)'
    };
  }

  private css(styles: CSSStyleDeclaration, name: string, fallback: string) {
    return styles.getPropertyValue(name).trim() || fallback;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}

function isRemoteBranch(branch: string): boolean {
  return branch.startsWith('origin/') || branch.includes('/origin/');
}

function ellipsize(label: string, maxChars: number): string {
  return label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}...` : label;
}
