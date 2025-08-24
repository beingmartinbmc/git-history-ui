import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Commit, DiffFile } from '../../models/git.models';

@Component({
  selector: 'app-commit-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" (click)="onClose()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">Commit Details</h3>
          <button (click)="onClose()" class="close-button">
            <svg class="close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div class="modal-content" *ngIf="commit">
          <div class="commit-details">
            <div class="commit-header">
              <div class="commit-meta">
                <span class="commit-hash">{{ commit.hash }}</span>
                <span class="commit-author">by {{ commit.author }}</span>
                <span class="commit-date">{{ formatDate(commit.date) }}</span>
              </div>
              <h3 class="commit-message">{{ commit.message }}</h3>
            </div>
            
            <div class="commit-sections">
              <div class="section">
                <h4 class="section-title">Files Changed</h4>
                <div class="file-list">
                  <div *ngFor="let file of commit.files" class="file-item">
                    <span class="file-name">{{ file }}</span>
                    <button class="btn btn-primary" (click)="onFileClick(file)">
                      View Diff
                    </button>
                  </div>
                </div>
              </div>
              
              <div class="section" *ngIf="diffFiles.length > 0">
                <h4 class="section-title">Diff Summary</h4>
                <div class="diff-summary">
                  <div *ngFor="let file of diffFiles" class="diff-item">
                    <div class="diff-file-name">{{ file.file }}</div>
                    <div class="diff-stats">
                      +{{ file.additions }} -{{ file.deletions }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }

    .modal-container {
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      max-width: 64rem;
      width: 100%;
      max-height: 100vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
    }

    .close-button {
      color: #6b7280;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
    }

    .close-button:hover {
      color: #374151;
    }

    .close-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .modal-content {
      padding: 1.5rem;
    }

    .commit-header {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 1rem;
      margin-bottom: 1rem;
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
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
    }

    .commit-sections {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    .section-title {
      font-size: 1.125rem;
      font-weight: 500;
      color: #111827;
      margin-bottom: 0.75rem;
    }

    .file-list, .diff-summary {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .file-item, .diff-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem;
      background-color: #f9fafb;
      border-radius: 0.25rem;
    }

    .file-name, .diff-file-name {
      font-size: 0.875rem;
      color: #374151;
    }

    .diff-stats {
      font-size: 0.75rem;
      color: #6b7280;
    }

    /* Dark mode styles */
    .dark .modal-container {
      background-color: #2d2d2d;
      color: #e0e0e0;
    }

    .dark .modal-header {
      border-color: #404040;
    }

    .dark .modal-title {
      color: #e0e0e0;
    }

    .dark .close-button {
      color: #9ca3af;
    }

    .dark .close-button:hover {
      color: #d1d5db;
    }

    .dark .commit-header {
      border-color: #404040;
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

    .dark .section-title {
      color: #e0e0e0;
    }

    .dark .file-item,
    .dark .diff-item {
      background-color: #404040;
    }

    .dark .file-name,
    .dark .diff-file-name {
      color: #d1d5db;
    }

    .dark .diff-stats {
      color: #9ca3af;
    }

    @media (max-width: 768px) {
      .commit-sections {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CommitDetailComponent {
  @Input() commit: Commit | null = null;
  @Input() diffFiles: DiffFile[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() fileClick = new EventEmitter<string>();

  onClose() {
    this.close.emit();
  }

  onFileClick(file: string) {
    this.fileClick.emit(file);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}
