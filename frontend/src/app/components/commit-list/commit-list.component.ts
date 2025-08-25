import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Commit } from '../../models/git.models';
import { ColorPalette } from '../../models/color-palette.models';

@Component({
  selector: 'app-commit-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="commit-list" [style.background-color]="getBackgroundColor()" [style.min-height]="'100vh'">
      <!-- Pagination Info -->
      <div class="pagination-info" 
           [style.color]="getColor('text', '#6b7280')"
           [style.margin-bottom]="'1rem'">
        <span>Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ commits.length }} commits</span>
        <div class="page-size-controls">
          <label [style.margin-right]="'0.5rem'">Page size:</label>
          <select [value]="pageSize" 
                  (change)="onPageSizeChange($event)"
                  [style.background-color]="getColor('background', 'white')"
                  [style.color]="getColor('text', '#111827')"
                  [style.border-color]="getColor('border', '#d1d5db')"
                  [style.padding]="'0.25rem 0.5rem'"
                  [style.border-radius]="'0.25rem'"
                  [style.font-size]="'0.875rem'">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      <!-- Commit Items -->
      <div *ngFor="let commit of paginatedCommits" 
           class="commit-item"
           [style.background-color]="getColor('background', 'white')"
           [style.border-color]="getColor('border', '#e5e7eb')"
           [style.color]="getColor('text', '#111827')"
           (click)="onCommitClick(commit)">
        <div class="commit-header">
          <div class="commit-info">
            <div class="commit-meta">
              <span class="commit-hash" [style.color]="getColor('text', '#6b7280')">{{ commit.hash.substring(0, 8) }}</span>
              <span class="commit-author" [style.color]="getColor('text', '#374151')">{{ commit.author }}</span>
              <span class="commit-date" [style.color]="getColor('text', '#6b7280')">{{ formatDate(commit.date) }}</span>
            </div>
            <h3 class="commit-message" [style.color]="getColor('text', '#111827')">{{ commit.message }}</h3>
            <div class="commit-stats" [style.color]="getColor('text', '#6b7280')">
              <span>{{ commit.files.length }} files changed</span>
              <span *ngIf="commit.branches.length > 0">
                Branch: {{ commit.branches[0] }}
              </span>
              <span *ngIf="commit.tags.length > 0">
                Tag: {{ commit.tags[0] }}
              </span>
            </div>
          </div>
          <div class="commit-actions">
            <button class="btn btn-primary" 
                    [style.background-color]="getColor('primary', '#3b82f6')"
                    [style.color]="getColor('text', 'white')"
                    (click)="onCommitClick(commit); $event.stopPropagation()">
              View
            </button>
          </div>
        </div>
      </div>
      
      <!-- Pagination Controls -->
      <div class="pagination-controls" 
           [style.margin-top]="'2rem'"
           [style.display]="'flex'"
           [style.justify-content]="'center'"
           [style.align-items]="'center'"
           [style.gap]="'1rem'">
        
        <!-- Previous Page -->
        <button class="pagination-btn"
                [disabled]="currentPage === 1"
                (click)="goToPage(currentPage - 1)">
          ← Previous
        </button>
        
        <!-- Page Info -->
        <div class="page-info">
          <span>Page</span>
          <span class="current-page">{{ currentPage }}</span>
          <span>of</span>
          <span class="total-pages">{{ totalPages }}</span>
        </div>
        
        <!-- Next Page -->
        <button class="pagination-btn"
                [disabled]="currentPage === totalPages"
                (click)="goToPage(currentPage + 1)">
          Next →
        </button>
      </div>
      
      <!-- No results message -->
      <div *ngIf="commits.length === 0" 
           class="no-results"
           [style.color]="getColor('text', '#6b7280')"
           [style.text-align]="'center'"
           [style.padding]="'2rem'">
        No commits found matching your search criteria.
      </div>
    </div>
  `,
  styles: [`
    .commit-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 100vh;
      padding: 1rem 0;
      transition: background-color 0.2s ease;
    }

    .commit-item {
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s;
    }

    .commit-item:hover {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .commit-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .commit-info {
      flex: 1;
    }

    .commit-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .commit-hash {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .commit-author {
      font-size: 0.875rem;
      color: #374151;
    }

    .commit-date {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .commit-message {
      font-size: 1.125rem;
      font-weight: 500;
      color: #111827;
      margin-bottom: 0.5rem;
    }

    .commit-stats {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .commit-actions {
      display: flex;
      gap: 0.5rem;
    }

    .no-results {
      font-size: 1rem;
      font-style: italic;
    }

    /* Remove hardcoded dark mode styles to let dynamic styling work */
    /* All styling is now handled by dynamic [style] bindings */
    
    .pagination-btn {
      padding: 0.5rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background-color: white;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 100px;
      text-align: center;
    }
    
    .pagination-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      background-color: #f9fafb;
    }
    
    .pagination-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .pagination-btn:disabled {
      background-color: #f3f4f6;
      color: #9ca3af;
      cursor: not-allowed;
      opacity: 0.6;
    }
    
    .page-info {
      user-select: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .current-page {
      color: #3b82f6;
      font-weight: 600;
    }
    
    .total-pages {
      color: #6b7280;
    }
  `]
})
export class CommitListComponent implements OnInit, OnDestroy {
  @Input() commits: Commit[] = [];
  @Input() colorPalette?: ColorPalette;
  @Output() commitClick = new EventEmitter<Commit>();
  
  // Pagination properties
  @Input() currentPage: number = 1;
  @Input() pageSize: number = 25;
  @Input() totalCommits: number = 0;
  @Input() totalPages: number = 1;
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();
  
  private observer?: MutationObserver;

  ngOnInit() {
    this.setupDarkModeObserver();
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  onCommitClick(commit: Commit) {
    this.commitClick.emit(commit);
  }

  // Pagination methods
  get paginatedCommits(): Commit[] {
    return this.commits;
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + this.pageSize, this.totalCommits);
  }



  goToPage(page: number) {
    console.log('goToPage called with:', page);
    console.log('Current page:', this.currentPage);
    console.log('Total pages:', this.totalPages);
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      console.log('Emitting pageChange event with page:', page);
      this.pageChange.emit(page);
    } else {
      console.log('Page change rejected:', { page, currentPage: this.currentPage, totalPages: this.totalPages });
    }
  }

  onPageSizeChange(event: any) {
    const newPageSize = parseInt(event.target.value);
    this.pageSizeChange.emit(newPageSize);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  private setupDarkModeObserver() {
    // Observe changes to the document element's class list
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Force change detection when dark mode changes
          // This will trigger a re-render with the correct background color
          setTimeout(() => {
            // Trigger change detection
            this.getBackgroundColor();
          }, 0);
        }
      });
    });

    // Start observing the document element for class changes
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  getColor(colorKey: keyof ColorPalette['colors'], defaultValue: string): string {
    return this.colorPalette?.colors[colorKey] || defaultValue;
  }

  getBackgroundColor(): string {
    // Use transparent background so it inherits from the parent container
    // This allows the list to blend with the main content background
    return 'transparent';
  }
}
