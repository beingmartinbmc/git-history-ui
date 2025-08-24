import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Commit } from '../../models/git.models';

@Component({
  selector: 'app-commit-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="commit-list">
      <div *ngFor="let commit of commits" 
           class="commit-item"
           (click)="onCommitClick(commit)">
        <div class="commit-header">
          <div class="commit-info">
            <div class="commit-meta">
              <span class="commit-hash">{{ commit.hash.substring(0, 8) }}</span>
              <span class="commit-author">{{ commit.author }}</span>
              <span class="commit-date">{{ formatDate(commit.date) }}</span>
            </div>
            <h3 class="commit-message">{{ commit.message }}</h3>
            <div class="commit-stats">
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
            <button class="btn btn-primary" (click)="onCommitClick(commit); $event.stopPropagation()">
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .commit-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
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

    /* Dark mode styles */
    .dark .commit-item {
      background-color: #2d2d2d;
      color: #e0e0e0;
    }

    .dark .commit-hash {
      color: #9ca3af;
    }

    .dark .commit-author {
      color: #d1d5db;
    }

    .dark .commit-date {
      color: #9ca3af;
    }

    .dark .commit-message {
      color: #e0e0e0;
    }

    .dark .commit-stats {
      color: #9ca3af;
    }
  `]
})
export class CommitListComponent {
  @Input() commits: Commit[] = [];
  @Output() commitClick = new EventEmitter<Commit>();

  onCommitClick(commit: Commit) {
    this.commitClick.emit(commit);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}
