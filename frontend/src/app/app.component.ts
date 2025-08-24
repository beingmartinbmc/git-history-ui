import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { CommitListComponent } from './components/commit-list/commit-list.component';
import { CommitGraphComponent } from './components/commit-graph/commit-graph.component';
import { CommitDetailComponent } from './components/commit-detail/commit-detail.component';
import { GitService } from './services/git.service';
import { Commit, DiffFile, GitOptions } from './models/git.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    CommitListComponent,
    CommitGraphComponent,
    CommitDetailComponent
  ],
  template: `
    <div class="app-container">
      <!-- Header -->
      <header class="header">
        <div class="container">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-4">
              <h1 class="app-title">
                📊 Git History UI
              </h1>
              <div class="flex items-center space-x-2">
                <button [class]="currentView === 'graph' ? 'btn btn-primary' : 'btn btn-secondary'"
                        (click)="switchView('graph')">
                  Graph View
                </button>
                <button [class]="currentView === 'list' ? 'btn btn-primary' : 'btn btn-secondary'"
                        (click)="switchView('list')">
                  List View
                </button>
              </div>
            </div>
            <div class="flex items-center space-x-4">
              <button (click)="toggleDarkMode()" class="btn btn-secondary">
                {{ darkMode ? '☀️' : '🌙' }}
              </button>
              <div class="search-container">
                <input type="text" [(ngModel)]="searchQuery" (input)="onSearch()" placeholder="Search commits..." 
                       class="search-input">
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Filters -->
      <div class="filters">
        <div class="container">
          <div class="flex items-center space-x-4">
            <div class="filter-group">
              <label>Author:</label>
              <select [(ngModel)]="selectedAuthor" (change)="onAuthorFilter()" class="filter-select">
                <option value="">All authors</option>
                <option *ngFor="let author of authors" [value]="author">{{ author }}</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Since:</label>
              <select [(ngModel)]="selectedSince" (change)="onSinceFilter()" class="filter-select">
                <option value="">All time</option>
                <option *ngFor="let tag of tags" [value]="tag">{{ tag }}</option>
              </select>
            </div>
            <div class="filter-group">
              <label>File:</label>
              <input type="text" [(ngModel)]="fileFilter" (input)="onFileFilter()" placeholder="Filter by file..." 
                     class="filter-input">
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <main class="main-content">
        <div class="container">
          <!-- Loading -->
          <div *ngIf="loading" class="loading">
            <div class="spinner"></div>
            <span>Loading commits...</span>
          </div>

          <!-- Graph View -->
          <div *ngIf="!loading && currentView === 'graph'">
            <app-commit-graph [commits]="filteredCommits" (commitClick)="showCommitDetails($event)"></app-commit-graph>
          </div>

          <!-- List View -->
          <div *ngIf="!loading && currentView === 'list'">
            <app-commit-list [commits]="filteredCommits" (commitClick)="showCommitDetails($event)"></app-commit-list>
          </div>
        </div>
      </main>

      <!-- Commit Detail Modal -->
      <app-commit-detail *ngIf="showModal" 
                        [commit]="selectedCommit" 
                        [diffFiles]="diffFiles"
                        (close)="closeModal()"
                        (fileClick)="onFileClick($event)">
      </app-commit-detail>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      background-color: #f8f9fa;
    }

    .header {
      background-color: white;
      border-bottom: 1px solid #e5e7eb;
      padding: 1rem 0;
    }

    .app-title {
      font-size: 1.5rem;
      font-weight: bold;
      color: #111827;
    }

    .search-container {
      position: relative;
    }

    .search-input {
      width: 16rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background-color: white;
      font-size: 0.875rem;
    }

    .filters {
      background-color: white;
      border-bottom: 1px solid #e5e7eb;
      padding: 1rem 0;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .filter-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
    }

    .filter-select, .filter-input {
      padding: 0.25rem 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.25rem;
      background-color: white;
      font-size: 0.875rem;
    }

    .main-content {
      padding: 1.5rem 0;
    }

    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 3rem 0;
      gap: 0.75rem;
    }

    .spinner {
      width: 2rem;
      height: 2rem;
      border: 2px solid #e5e7eb;
      border-top: 2px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Dark mode styles */
    .dark .app-container {
      background-color: #1a1a1a;
    }

    .dark .header,
    .dark .filters {
      background-color: #2d2d2d;
      border-color: #404040;
    }

    .dark .app-title {
      color: #e0e0e0;
    }

    .dark .search-input,
    .dark .filter-select,
    .dark .filter-input {
      background-color: #404040;
      border-color: #555;
      color: #e0e0e0;
    }

    .dark .filter-group label {
      color: #d1d5db;
    }
  `]
})
export class AppComponent implements OnInit {
  commits: Commit[] = [];
  filteredCommits: Commit[] = [];
  authors: string[] = [];
  tags: string[] = [];
  
  currentView: 'list' | 'graph' = 'list';
  darkMode = false;
  loading = true;
  showModal = false;
  selectedCommit: Commit | null = null;
  diffFiles: DiffFile[] = [];
  
  searchQuery = '';
  selectedAuthor = '';
  selectedSince = '';
  fileFilter = '';

  constructor(private gitService: GitService) {}

  ngOnInit() {
    this.loadCommits();
    this.loadTags();
    this.checkDarkMode();
  }

  loadCommits() {
    this.loading = true;
    this.gitService.getCommits().subscribe({
      next: (commits) => {
        this.commits = commits;
        this.filteredCommits = commits;
        this.authors = [...new Set(commits.map(c => c.author))];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading commits:', error);
        this.loading = false;
      }
    });
  }

  loadTags() {
    this.gitService.getTags().subscribe({
      next: (tags) => {
        this.tags = tags;
      },
      error: (error) => {
        console.error('Error loading tags:', error);
      }
    });
  }

  switchView(view: 'list' | 'graph') {
    this.currentView = view;
  }

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.documentElement.classList.toggle('dark', this.darkMode);
  }

  checkDarkMode() {
    this.darkMode = document.documentElement.classList.contains('dark');
  }

  onSearch() {
    this.applyFilters();
  }

  onAuthorFilter() {
    this.applyFilters();
  }

  onSinceFilter() {
    this.applyFilters();
  }

  onFileFilter() {
    this.applyFilters();
  }

  applyFilters() {
    let filtered = this.commits;

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(commit => 
        commit.message.toLowerCase().includes(query) ||
        commit.author.toLowerCase().includes(query) ||
        commit.hash.toLowerCase().includes(query)
      );
    }

    if (this.selectedAuthor) {
      filtered = filtered.filter(commit => commit.author === this.selectedAuthor);
    }

    if (this.selectedSince) {
      filtered = filtered.filter(commit => new Date(commit.date) >= new Date(this.selectedSince));
    }

    if (this.fileFilter) {
      filtered = filtered.filter(commit => 
        commit.files.some(f => f.toLowerCase().includes(this.fileFilter.toLowerCase()))
      );
    }

    this.filteredCommits = filtered;
  }

  showCommitDetails(commit: Commit) {
    this.selectedCommit = commit;
    this.gitService.getDiff(commit.hash).subscribe({
      next: (diff) => {
        this.diffFiles = diff;
        this.showModal = true;
      },
      error: (error) => {
        console.error('Error loading diff:', error);
        this.diffFiles = [];
        this.showModal = true;
      }
    });
  }

  closeModal() {
    this.showModal = false;
    this.selectedCommit = null;
    this.diffFiles = [];
  }

  onFileClick(file: string) {
    console.log('File clicked:', file);
    // TODO: Implement file diff viewer
  }
}
