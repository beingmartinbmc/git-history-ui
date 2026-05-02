import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChildren,
  QueryList,
  computed,
  inject,
  signal
} from '@angular/core';
import hljs from 'highlight.js/lib/common';
import { DiffFile } from '../../models/git.models';
import { InsightsService } from '../../services/insights.service';

type Side = 'left' | 'right';

interface DiffLine {
  type: 'context' | 'add' | 'del' | 'hunk' | 'meta';
  oldNo?: number;
  newNo?: number;
  text: string;
}

interface SideLine {
  type: 'context' | 'add' | 'del' | 'empty' | 'hunk';
  no?: number;
  text: string;
  html?: string;
}

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header" *ngIf="file">
      <div class="file-info">
        <span class="status" [attr.data-status]="file.status">{{ file.status }}</span>
        <span class="path">{{ file.file }}</span>
        <span class="path old" *ngIf="file.oldFile && file.oldFile !== file.file">
          ← {{ file.oldFile }}
        </span>
      </div>
      <div class="stats">
        <span class="add">+{{ file.additions }}</span>
        <span class="del">−{{ file.deletions }}</span>
        <button
          class="btn btn-ghost btn-toggle"
          (click)="collapsed.set(!collapsed())"
          [title]="collapsed() ? 'Expand all unchanged context' : 'Collapse unchanged blocks'"
        >
          {{ collapsed() ? 'Expand' : 'Collapse' }}
        </button>
        <button
          class="btn btn-ghost btn-toggle"
          (click)="onSummarize()"
          [disabled]="summarizing() || !file"
          title="Summarize this diff with AI (requires API key)"
        >
          {{ summarizing() ? '...' : 'Summarize' }}
        </button>
        <div class="toggle">
          <button class="btn btn-ghost" [class.active]="mode() === 'unified'"
                  (click)="mode.set('unified')">Unified</button>
          <button class="btn btn-ghost" [class.active]="mode() === 'split'"
                  (click)="mode.set('split')">Split</button>
        </div>
      </div>
    </div>

    <div class="ai-summary" *ngIf="summary() as s">
      <span class="ai-pill">AI</span>
      <span class="summary-text">{{ s }}</span>
      <button class="btn btn-ghost btn-icon close" (click)="summary.set(null)">×</button>
    </div>
    <div class="ai-summary error" *ngIf="summaryError() as e">{{ e }}</div>

    <div class="empty" *ngIf="!file">Select a file to see its diff.</div>
    <div class="empty" *ngIf="file && file.status === 'binary'">
      Binary file — diff not displayed.
    </div>

    <ng-container *ngIf="file && file.status !== 'binary'">
      <pre class="unified" *ngIf="mode() === 'unified'"><code><div
          *ngFor="let l of visibleUnifiedLines(); trackBy: trackByIdx"
          class="line"
          [class.add]="l.type === 'add'"
          [class.del]="l.type === 'del'"
          [class.hunk]="l.type === 'hunk'"
          [class.meta]="l.type === 'meta'"
        ><span class="gutter old">{{ l.oldNo ?? '' }}</span><span
            class="gutter new">{{ l.newNo ?? '' }}</span><span
            class="sign">{{ sign(l) }}</span><span class="text" [innerHTML]="render(l.text)"></span></div></code></pre>

      <div class="split" *ngIf="mode() === 'split'">
        <pre #splitPane class="side"><code><div
            *ngFor="let l of splitLines().left; trackBy: trackByIdx"
            class="line"
            [class.del]="l.type === 'del'"
            [class.empty]="l.type === 'empty'"
            [class.hunk]="l.type === 'hunk'"
          ><span class="gutter">{{ l.no ?? '' }}</span><span class="text" [innerHTML]="renderSide(l)"></span></div></code></pre>
        <pre #splitPane class="side"><code><div
            *ngFor="let l of splitLines().right; trackBy: trackByIdx"
            class="line"
            [class.add]="l.type === 'add'"
            [class.empty]="l.type === 'empty'"
            [class.hunk]="l.type === 'hunk'"
          ><span class="gutter">{{ l.no ?? '' }}</span><span class="text" [innerHTML]="renderSide(l)"></span></div></code></pre>
      </div>
    </ng-container>
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
      justify-content: space-between;
      align-items: center;
      padding: 0.58rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
      background: color-mix(in oklab, var(--bg-surface) 88%, transparent);
      gap: 0.75rem;
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .path {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .path.old { color: var(--fg-muted); }
    .status {
      text-transform: uppercase;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid transparent;
      letter-spacing: 0.04em;
      color: var(--accent-fg);
    }
    .status[data-status='added'] { background: var(--success); }
    .status[data-status='deleted'] { background: var(--danger); }
    .status[data-status='modified'] { background: var(--accent); }
    .status[data-status='renamed'],
    .status[data-status='copied'] { background: var(--warning); }
    .status[data-status='binary'] { background: var(--fg-muted); }
    .stats {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .stats .add { color: var(--success); }
    .stats .del { color: var(--danger); }
    .toggle { display: flex; gap: 2px; padding-left: 0.5rem; }
    .toggle .btn { padding: 0.25rem 0.6rem; font-size: 12px; }
    .toggle .btn.active {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .btn-toggle { font-size: 11px; padding: 0.25rem 0.6rem; }
    .ai-summary {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.55rem 0.85rem;
      background: color-mix(in oklab, var(--accent) 10%, transparent);
      border-bottom: 1px solid var(--border-soft);
      font-size: 12px;
      color: var(--fg-secondary);
    }
    .ai-summary.error { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
    .ai-pill {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: var(--accent);
      color: var(--accent-fg);
      padding: 1px 5px;
      border-radius: 4px;
    }
    .summary-text { flex: 1; line-height: 1.5; }
    .ai-summary .close { font-size: 14px; line-height: 1; padding: 0 6px; }
    .empty {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--fg-muted);
    }

    pre {
      flex: 1;
      margin: 0;
      overflow: auto;
      padding: 0;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--fg-primary);
      background: color-mix(in oklab, var(--bg-surface-2) 82%, transparent);
      min-height: 0;
    }
    code { display: block; min-width: max-content; }
    .line {
      display: grid;
      grid-template-columns: 48px 48px 14px 1fr;
      align-items: baseline;
      padding: 0 0.6rem;
      white-space: pre;
    }
    .line:hover {
      background: color-mix(in oklab, var(--accent) 7%, transparent);
    }
    .split .line {
      grid-template-columns: 48px 1fr;
    }
    .gutter {
      color: var(--fg-subtle);
      text-align: right;
      padding-right: 0.5rem;
      user-select: none;
      font-variant-numeric: tabular-nums;
    }
    .sign {
      width: 14px;
      color: var(--fg-subtle);
    }
    .text { white-space: pre; }
    .line.add { background: var(--diff-add-bg); color: var(--diff-add-fg); }
    .line.add .gutter { color: var(--diff-add-gutter); }
    .line.add .text :global(.word-changed) { background: color-mix(in oklab, var(--success) 35%, transparent); border-radius: 2px; }
    .line.del { background: var(--diff-del-bg); color: var(--diff-del-fg); }
    .line.del .gutter { color: var(--diff-del-gutter); }
    .line.del .text :global(.word-changed) { background: color-mix(in oklab, var(--danger) 35%, transparent); border-radius: 2px; }
    .line.hunk { background: var(--diff-hunk-bg); color: var(--diff-hunk-fg); font-style: italic; }
    .line.meta { color: var(--fg-muted); }
    .line.empty { background: repeating-linear-gradient(45deg, transparent 0 6px, color-mix(in oklab, var(--fg-subtle) 14%, transparent) 6px 12px); }

    .split {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1px 1fr;
      grid-template-rows: minmax(0, 1fr);
      min-height: 0;
      overflow: hidden;
    }
    .split::before {
      content: '';
      grid-column: 2;
      background: var(--border-soft);
    }
    .split .side {
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      overflow: auto;
    }
  `]
})
export class DiffViewerComponent implements AfterViewInit, OnDestroy {
  @Input() set fileInput(value: DiffFile | null) {
    this.file = value;
    this.parsed.set(value ? this.parse(value.changes) : []);
  }

  @ViewChildren('splitPane') splitPanes?: QueryList<ElementRef<HTMLPreElement>>;
  private syncing = false;
  private syncListeners: Array<() => void> = [];

  private insightsApi = inject(InsightsService);

  file: DiffFile | null = null;
  mode = signal<'unified' | 'split'>('unified');
  parsed = signal<DiffLine[]>([]);
  collapsed = signal<boolean>(true);
  summary = signal<string | null>(null);
  summaryError = signal<string | null>(null);
  summarizing = signal<boolean>(false);

  private static readonly CONTEXT_RADIUS = 3;

  unifiedLines = computed(() => this.parsed());

  visibleUnifiedLines = computed<DiffLine[]>(() => {
    const lines = this.parsed();
    if (!this.collapsed() || lines.length === 0) return lines;
    const keep = new Array<boolean>(lines.length).fill(false);
    const r = DiffViewerComponent.CONTEXT_RADIUS;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].type;
      if (t === 'add' || t === 'del' || t === 'hunk' || t === 'meta') {
        for (let j = Math.max(0, i - r); j <= Math.min(lines.length - 1, i + r); j++) {
          keep[j] = true;
        }
      }
    }
    const out: DiffLine[] = [];
    let skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      if (keep[i]) {
        if (skipped > 0) {
          out.push({ type: 'hunk', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'} hidden ...` });
          skipped = 0;
        }
        out.push(lines[i]);
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      out.push({ type: 'hunk', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'} hidden ...` });
    }
    return out;
  });

  splitLines = computed(() => {
    const lines = this.parsed();
    const left: SideLine[] = [];
    const right: SideLine[] = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.type === 'hunk' || l.type === 'meta') {
        left.push({ type: 'hunk', text: l.text });
        right.push({ type: 'hunk', text: l.text });
        i++;
        continue;
      }
      if (l.type === 'context') {
        left.push({ type: 'context', no: l.oldNo, text: l.text });
        right.push({ type: 'context', no: l.newNo, text: l.text });
        i++;
        continue;
      }
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++]);
      while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++]);
      const max = Math.max(dels.length, adds.length);
      for (let j = 0; j < max; j++) {
        const d = dels[j];
        const a = adds[j];
        const wordPair = d && a ? wordDiff(d.text, a.text) : null;
        left.push(
          d
            ? { type: 'del', no: d.oldNo, text: d.text, html: wordPair?.left }
            : { type: 'empty', text: '' }
        );
        right.push(
          a
            ? { type: 'add', no: a.newNo, text: a.text, html: wordPair?.right }
            : { type: 'empty', text: '' }
        );
      }
    }
    return { left, right };
  });

  /**
   * Variant of `render()` that prefers a precomputed word-diff HTML when
   * available, falling back to the regular syntax-highlighted text.
   */
  renderSide(l: SideLine): string {
    if (l.html) return l.html;
    return this.render(l.text);
  }

  trackByIdx(i: number) {
    return i;
  }

  ngAfterViewInit() {
    this.splitPanes?.changes.subscribe(() => this.attachScrollSync());
    this.attachScrollSync();
  }

  ngOnDestroy() {
    this.detachScrollSync();
  }

  /** When in split mode, mirror scroll between the two <pre>s. */
  private attachScrollSync() {
    this.detachScrollSync();
    const panes = this.splitPanes?.toArray() ?? [];
    if (panes.length !== 2) return;
    const [a, b] = panes.map((p) => p.nativeElement);
    const sync = (src: HTMLElement, dst: HTMLElement) => () => {
      if (this.syncing) return;
      this.syncing = true;
      dst.scrollTop = src.scrollTop;
      dst.scrollLeft = src.scrollLeft;
      requestAnimationFrame(() => (this.syncing = false));
    };
    const onA = sync(a, b);
    const onB = sync(b, a);
    a.addEventListener('scroll', onA, { passive: true });
    b.addEventListener('scroll', onB, { passive: true });
    this.syncListeners.push(() => a.removeEventListener('scroll', onA));
    this.syncListeners.push(() => b.removeEventListener('scroll', onB));
  }

  private detachScrollSync() {
    for (const off of this.syncListeners) off();
    this.syncListeners = [];
  }

  onSummarize() {
    if (!this.file || this.summarizing()) return;
    this.summarizing.set(true);
    this.summaryError.set(null);
    const text = this.file.changes.length > 12000 ? this.file.changes.slice(0, 12000) : this.file.changes;
    this.insightsApi.summarizeDiff(`File: ${this.file.file}\n${text}`).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.summarizing.set(false);
      },
      error: (err) => {
        this.summary.set(null);
        this.summaryError.set(err?.error?.error ?? 'Summarize failed');
        this.summarizing.set(false);
      }
    });
  }

  sign(l: DiffLine): string {
    return l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
  }

  render(text: string): string {
    if (!text) return '';
    const lang = this.langForFile(this.file?.file);
    try {
      if (lang) {
        return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(text).value;
    } catch {
      return this.escape(text);
    }
  }

  private langForFile(name?: string): string | null {
    if (!name) return null;
    const ext = name.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript',
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      json: 'json', yml: 'yaml', yaml: 'yaml',
      md: 'markdown', html: 'xml', xml: 'xml', css: 'css', scss: 'scss',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
      kt: 'kotlin', swift: 'swift', php: 'php', sh: 'bash', bash: 'bash',
      sql: 'sql', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp',
      cs: 'csharp', dockerfile: 'dockerfile'
    };
    if (name.toLowerCase().endsWith('dockerfile')) return 'dockerfile';
    return map[ext] ?? null;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // (wordDiff helper is defined at module scope below)

  private parse(raw: string): DiffLine[] {
    const out: DiffLine[] = [];
    if (!raw) return out;
    let oldNo = 0;
    let newNo = 0;
    for (const line of raw.split('\n')) {
      if (line.startsWith('@@')) {
        out.push({ type: 'hunk', text: line });
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          oldNo = parseInt(m[1], 10);
          newNo = parseInt(m[2], 10);
        }
      } else if (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('new file') ||
        line.startsWith('deleted file') ||
        line.startsWith('rename ') ||
        line.startsWith('copy ') ||
        line.startsWith('similarity ') ||
        line.startsWith('Binary files')
      ) {
        out.push({ type: 'meta', text: line });
      } else if (line.startsWith('+')) {
        out.push({ type: 'add', newNo, text: line.substring(1) });
        newNo++;
      } else if (line.startsWith('-')) {
        out.push({ type: 'del', oldNo, text: line.substring(1) });
        oldNo++;
      } else if (line.startsWith(' ')) {
        out.push({
          type: 'context',
          oldNo,
          newNo,
          text: line.substring(1)
        });
        oldNo++;
        newNo++;
      } else if (line === '') {
        // blank — keep alignment
        out.push({ type: 'context', oldNo, newNo, text: '' });
      }
    }
    return out;
  }
}

/**
 * Compute a word-level diff between two lines and return HTML-safe markup
 * with `.word-changed` spans wrapping the differing tokens. Uses a simple
 * O(n*m) LCS — fine for typical line lengths under a few hundred chars.
 *
 * Returns `null` if either side is empty (no benefit from word-level diff).
 */
function wordDiff(left: string, right: string): { left: string; right: string } | null {
  if (!left || !right) return null;

  const la = tokenizeWords(left);
  const ra = tokenizeWords(right);

  // Build LCS table.
  const m = la.length;
  const n = ra.length;
  if (m === 0 || n === 0) return null;
  // Bail if very long to keep this cheap.
  if (m * n > 20000) return null;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = la[i] === ra[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Walk to emit pieces.
  const leftOut: string[] = [];
  const rightOut: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (la[i] === ra[j]) {
      const t = escapeHtml(la[i]);
      leftOut.push(t);
      rightOut.push(t);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      leftOut.push(`<span class="word-changed">${escapeHtml(la[i])}</span>`);
      i++;
    } else {
      rightOut.push(`<span class="word-changed">${escapeHtml(ra[j])}</span>`);
      j++;
    }
  }
  while (i < m) {
    leftOut.push(`<span class="word-changed">${escapeHtml(la[i++])}</span>`);
  }
  while (j < n) {
    rightOut.push(`<span class="word-changed">${escapeHtml(ra[j++])}</span>`);
  }
  return { left: leftOut.join(''), right: rightOut.join('') };
}

function tokenizeWords(s: string): string[] {
  // Split keeping whitespace and punctuation as their own tokens so the
  // visible reconstruction is exact.
  return s.match(/(\s+|[A-Za-z0-9_]+|[^A-Za-z0-9_\s])/g) ?? [];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
