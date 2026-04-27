import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal
} from '@angular/core';
import hljs from 'highlight.js/lib/common';
import { DiffFile } from '../../models/git.models';

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
        <div class="toggle">
          <button class="btn btn-ghost" [class.active]="mode() === 'unified'"
                  (click)="mode.set('unified')">Unified</button>
          <button class="btn btn-ghost" [class.active]="mode() === 'split'"
                  (click)="mode.set('split')">Split</button>
        </div>
      </div>
    </div>

    <div class="empty" *ngIf="!file">Select a file to see its diff.</div>
    <div class="empty" *ngIf="file && file.status === 'binary'">
      Binary file — diff not displayed.
    </div>

    <ng-container *ngIf="file && file.status !== 'binary'">
      <pre class="unified" *ngIf="mode() === 'unified'"><code><div
          *ngFor="let l of unifiedLines(); trackBy: trackByIdx"
          class="line"
          [class.add]="l.type === 'add'"
          [class.del]="l.type === 'del'"
          [class.hunk]="l.type === 'hunk'"
          [class.meta]="l.type === 'meta'"
        ><span class="gutter old">{{ l.oldNo ?? '' }}</span><span
            class="gutter new">{{ l.newNo ?? '' }}</span><span
            class="sign">{{ sign(l) }}</span><span class="text" [innerHTML]="render(l.text)"></span></div></code></pre>

      <div class="split" *ngIf="mode() === 'split'">
        <pre class="side"><code><div
            *ngFor="let l of splitLines().left; trackBy: trackByIdx"
            class="line"
            [class.del]="l.type === 'del'"
            [class.empty]="l.type === 'empty'"
            [class.hunk]="l.type === 'hunk'"
          ><span class="gutter">{{ l.no ?? '' }}</span><span class="text" [innerHTML]="render(l.text)"></span></div></code></pre>
        <pre class="side"><code><div
            *ngFor="let l of splitLines().right; trackBy: trackByIdx"
            class="line"
            [class.add]="l.type === 'add'"
            [class.empty]="l.type === 'empty'"
            [class.hunk]="l.type === 'hunk'"
          ><span class="gutter">{{ l.no ?? '' }}</span><span class="text" [innerHTML]="render(l.text)"></span></div></code></pre>
      </div>
    </ng-container>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--bg-surface);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
      background: var(--bg-surface);
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
      background: var(--bg-surface-2);
      min-height: 0;
    }
    code { display: block; min-width: max-content; }
    .line {
      display: grid;
      grid-template-columns: 48px 48px 14px 1fr;
      align-items: baseline;
      padding: 0 0.5rem;
      white-space: pre;
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
    .line.del { background: var(--diff-del-bg); color: var(--diff-del-fg); }
    .line.del .gutter { color: var(--diff-del-gutter); }
    .line.hunk { background: var(--diff-hunk-bg); color: var(--diff-hunk-fg); font-style: italic; }
    .line.meta { color: var(--fg-muted); }
    .line.empty { background: repeating-linear-gradient(45deg, transparent 0 6px, color-mix(in oklab, var(--fg-subtle) 14%, transparent) 6px 12px); }

    .split {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1px 1fr;
      min-height: 0;
    }
    .split::before {
      content: '';
      grid-column: 2;
      background: var(--border-soft);
    }
    .split .side { width: 100%; }
  `]
})
export class DiffViewerComponent {
  @Input() set fileInput(value: DiffFile | null) {
    this.file = value;
    this.parsed.set(value ? this.parse(value.changes) : []);
  }

  file: DiffFile | null = null;
  mode = signal<'unified' | 'split'>('unified');
  parsed = signal<DiffLine[]>([]);

  unifiedLines = computed(() => this.parsed());

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
      // collect contiguous block of dels/adds
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++]);
      while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++]);
      const max = Math.max(dels.length, adds.length);
      for (let j = 0; j < max; j++) {
        left.push(
          dels[j]
            ? { type: 'del', no: dels[j].oldNo, text: dels[j].text }
            : { type: 'empty', text: '' }
        );
        right.push(
          adds[j]
            ? { type: 'add', no: adds[j].newNo, text: adds[j].text }
            : { type: 'empty', text: '' }
        );
      }
    }
    return { left, right };
  });

  trackByIdx(i: number) {
    return i;
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
