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
      <div *ngFor="let commit of commits" 
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
  `]
})
export class CommitListComponent implements OnInit, OnDestroy {
  @Input() commits: Commit[] = [];
  @Input() colorPalette?: ColorPalette;
  @Output() commitClick = new EventEmitter<Commit>();
  
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
