import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiffFile } from '../../models/git.models';

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="diff-viewer">
      <div class="diff-header">
        <h3 class="diff-title">Diff: {{ fileName }}</h3>
        <button (click)="onClose()" class="close-button">
          <svg class="close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div class="diff-content">
        <div class="diff-stats">
          <span class="stat added">+{{ diffFile?.additions || 0 }} additions</span>
          <span class="stat removed">-{{ diffFile?.deletions || 0 }} deletions</span>
        </div>
        
        <div class="diff-lines" *ngIf="diffLines.length > 0">
          <div *ngFor="let line of diffLines; trackBy: trackByLine" 
               class="diff-line"
               [class.added]="line.type === 'added'"
               [class.removed]="line.type === 'removed'"
               [class.context]="line.type === 'context'">
            <span class="line-number">{{ line.lineNumber }}</span>
            <span class="line-content">{{ line.content }}</span>
          </div>
        </div>
        
        <div class="no-diff" *ngIf="diffLines.length === 0">
          <p>No diff content available for this file.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .diff-viewer {
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      max-width: 90vw;
      width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .diff-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      background-color: #f9fafb;
    }

    .diff-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .close-button {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.25rem;
      transition: color 0.2s;
    }

    .close-button:hover {
      color: #374151;
    }

    .close-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .diff-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .diff-stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.5rem;
      background-color: #f9fafb;
      border-radius: 0.375rem;
    }

    .stat {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .stat.added {
      color: #059669;
    }

    .stat.removed {
      color: #dc2626;
    }

    .diff-lines {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.875rem;
      line-height: 1.5;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
      overflow: hidden;
    }

    .diff-line {
      display: flex;
      padding: 0.125rem 0.5rem;
      border-bottom: 1px solid #f3f4f6;
    }

    .diff-line:last-child {
      border-bottom: none;
    }

    .diff-line.added {
      background-color: #dcfce7;
    }

    .diff-line.removed {
      background-color: #fee2e2;
    }

    .diff-line.context {
      background-color: #f9fafb;
    }

    .line-number {
      min-width: 3rem;
      color: #6b7280;
      font-size: 0.75rem;
      padding-right: 0.5rem;
      border-right: 1px solid #e5e7eb;
      margin-right: 0.5rem;
    }

    .line-content {
      flex: 1;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .diff-line.added .line-content {
      color: #166534;
    }

    .diff-line.removed .line-content {
      color: #991b1b;
    }

    .diff-line.context .line-content {
      color: #374151;
    }

    .no-diff {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }

    /* Dark mode styles */
    .dark .diff-viewer {
      background-color: #2d2d2d;
      color: #e0e0e0;
    }

    .dark .diff-header {
      background-color: #404040;
      border-color: #555;
    }

    .dark .diff-title {
      color: #e0e0e0;
    }

    .dark .close-button {
      color: #9ca3af;
    }

    .dark .close-button:hover {
      color: #d1d5db;
    }

    .dark .diff-stats {
      background-color: #404040;
    }

    .dark .diff-lines {
      border-color: #555;
    }

    .dark .diff-line {
      border-color: #404040;
    }

    .dark .diff-line.added {
      background-color: #14532d;
    }

    .dark .diff-line.removed {
      background-color: #7f1d1d;
    }

    .dark .diff-line.context {
      background-color: #404040;
    }

    .dark .line-number {
      color: #9ca3af;
      border-color: #555;
    }

    .dark .diff-line.added .line-content {
      color: #bbf7d0;
    }

    .dark .diff-line.removed .line-content {
      color: #fecaca;
    }

    .dark .diff-line.context .line-content {
      color: #d1d5db;
    }

    .dark .no-diff {
      color: #9ca3af;
    }
  `]
})
export class DiffViewerComponent {
  @Input() fileName: string = '';
  @Input() diffFile: DiffFile | null = null;
  @Output() close = new EventEmitter<void>();

  diffLines: Array<{type: 'added' | 'removed' | 'context', lineNumber: string, content: string}> = [];

  ngOnInit() {
    console.log('DiffViewer ngOnInit called');
    this.parseDiff();
  }

  ngOnChanges() {
    console.log('DiffViewer ngOnChanges called');
    this.parseDiff();
  }

  parseDiff() {
    console.log('parseDiff called with diffFile:', this.diffFile);
    
    if (!this.diffFile?.changes) {
      console.log('No changes found in diffFile');
      this.diffLines = [];
      return;
    }

    const lines = this.diffFile.changes.split('\n');
    console.log('Parsed lines:', lines.length);
    
    this.diffLines = lines.map((line, index) => {
      let type: 'added' | 'removed' | 'context' = 'context';
      let lineNumber = (index + 1).toString();
      let content = line;

      if (line.startsWith('+')) {
        type = 'added';
        content = line.substring(1);
      } else if (line.startsWith('-')) {
        type = 'removed';
        content = line.substring(1);
      } else if (line.startsWith('@@')) {
        // Git diff header line
        lineNumber = '@@';
        content = line;
      }

      return { type, lineNumber, content };
    });
    
    console.log('Parsed diff lines:', this.diffLines.length);
  }

  onClose() {
    this.close.emit();
  }

  trackByLine(index: number, line: any): string {
    return `${line.type}-${index}`;
  }
}
