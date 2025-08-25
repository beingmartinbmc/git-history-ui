import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { CommitListComponent } from './components/commit-list/commit-list.component';
import { CommitGraphComponent } from './components/commit-graph/commit-graph.component';
import { CommitDetailComponent } from './components/commit-detail/commit-detail.component';
import { DiffViewerComponent } from './components/diff-viewer/diff-viewer.component';
import { ColorPaletteSelectorComponent } from './components/color-palette-selector/color-palette-selector.component';
import { GitService } from './services/git.service';
import { Commit, DiffFile, GitOptions } from './models/git.models';
import { ColorPaletteId, COLOR_PALETTES, DARK_COLOR_PALETTES } from './models/color-palette.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    CommitListComponent,
    CommitGraphComponent,
    CommitDetailComponent,
    DiffViewerComponent,
    ColorPaletteSelectorComponent
  ],
  template: `
    <div class="app-container">
      <!-- Header -->
      <header class="header" [style.background-color]="darkMode ? '#2d2d2d' : 'white'" [style.border-bottom-color]="darkMode ? '#404040' : '#e5e7eb'">
        <div class="container">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-4">
              <h1 class="app-title" [style.color]="darkMode ? '#e0e0e0' : '#111827'">
                📊 Git History UI
              </h1>
              <div class="flex items-center" style="gap: 0.5rem;">
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
              <app-color-palette-selector 
                [selectedPalette]="selectedColorPalette"
                [darkMode]="darkMode"
                (paletteChange)="onColorPaletteChange($event)">
              </app-color-palette-selector>
              <button (click)="toggleDarkMode()" class="btn btn-secondary">
                {{ darkMode ? '☀️' : '🌙' }}
              </button>
              <div class="search-container">
                <input type="text" [(ngModel)]="searchQuery" (input)="onSearch()" placeholder="Search commits..." 
                       class="search-input"
                       [style.background-color]="darkMode ? '#404040' : 'white'"
                       [style.color]="darkMode ? '#e0e0e0' : '#111827'"
                       [style.border-color]="darkMode ? '#555' : '#d1d5db'">
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Filters -->
      <div class="filters" [style.background-color]="darkMode ? '#2d2d2d' : 'white'" [style.border-bottom-color]="darkMode ? '#404040' : '#e5e7eb'">
        <div class="container">
          <div class="flex items-center space-x-4">
            <div class="filter-group">
              <label [style.color]="darkMode ? '#d1d5db' : '#374151'">Author:</label>
              <select [(ngModel)]="selectedAuthor" (change)="onAuthorFilter()" class="filter-select"
                      [style.background-color]="darkMode ? '#404040' : 'white'"
                      [style.color]="darkMode ? '#e0e0e0' : '#111827'"
                      [style.border-color]="darkMode ? '#555' : '#d1d5db'">
                <option value="">All authors</option>
                <option *ngFor="let author of authors" [value]="author">{{ author }}</option>
              </select>
            </div>
            <div class="filter-group">
              <label [style.color]="darkMode ? '#d1d5db' : '#374151'">Since:</label>
              <input type="date" 
                     [(ngModel)]="selectedSince" 
                     (change)="onSinceFilter()" 
                     class="filter-input date-picker"
                     [style.background-color]="darkMode ? '#404040' : 'white'"
                     [style.color]="darkMode ? '#e0e0e0' : '#111827'"
                     [style.border-color]="darkMode ? '#555' : '#d1d5db'"
                     [style.caret-color]="darkMode ? '#e0e0e0' : '#111827'"
                     placeholder="Select date">
            </div>
            <div class="filter-group">
              <label [style.color]="darkMode ? '#d1d5db' : '#374151'">File:</label>
              <input type="text" [(ngModel)]="fileFilter" (input)="onFileFilter()" placeholder="Filter by file..." 
                     class="filter-input"
                     [style.background-color]="darkMode ? '#404040' : 'white'"
                     [style.color]="darkMode ? '#e0e0e0' : '#111827'"
                     [style.border-color]="darkMode ? '#555' : '#d1d5db'">
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <main class="main-content" [style.background-color]="darkMode ? '#1a1a1a' : '#f8f9fa'">
        <div class="container">
          <!-- Loading -->
          <div *ngIf="loading" class="loading" [style.color]="darkMode ? '#e0e0e0' : '#374151'">
            <div class="spinner"></div>
            <span>Loading commits...</span>
          </div>

          <!-- Graph View -->
          <div *ngIf="!loading && currentView === 'graph'">
            <app-commit-graph 
              [commits]="filteredCommits" 
              [colorPalette]="getCurrentPalette()"
              (commitClick)="showCommitDetails($event)">
            </app-commit-graph>
          </div>

          <!-- List View -->
          <div *ngIf="!loading && currentView === 'list'">
            <app-commit-list 
              [commits]="filteredCommits" 
              [colorPalette]="getCurrentPalette()"
              [currentPage]="currentPage"
              [pageSize]="pageSize"
              [totalCommits]="totalCommits"
              [totalPages]="totalPages"
              (commitClick)="showCommitDetails($event)"
              (pageChange)="onPageChange($event)"
              (pageSizeChange)="onPageSizeChange($event)">
            </app-commit-list>
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

      <!-- Diff Viewer Modal -->
      <div *ngIf="showDiffModal" class="modal-overlay" (click)="closeDiffModal()">
        <div class="modal-container" (click)="$event.stopPropagation()">
          <app-diff-viewer 
            [fileName]="selectedFileName"
            [diffFile]="selectedDiffFile"
            (close)="closeDiffModal()">
          </app-diff-viewer>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      background-color: #f8f9fa;
      transition: background-color 0.2s ease;
    }

    .dark .app-container {
      background-color: #1a1a1a;
    }

    .header {
      background-color: white;
      border-bottom: 1px solid #e5e7eb;
      padding: 1rem 0;
      transition: background-color 0.2s ease, border-bottom-color 0.2s ease;
    }

    .app-title {
      font-size: 1.5rem;
      font-weight: bold;
      color: #111827;
      transition: color 0.2s ease;
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

    .date-picker {
      min-width: 200px;
      transition: all 0.2s ease;
    }

    .date-picker::-webkit-calendar-picker-indicator {
      filter: invert(0.5);
      cursor: pointer;
      transition: filter 0.2s ease;
    }

    .dark .date-picker::-webkit-calendar-picker-indicator {
      filter: invert(1);
    }

    /* Dark mode styles for date picker */
    .dark .date-picker {
      background-color: #404040 !important;
      color: #e0e0e0 !important;
      border-color: #555 !important;
    }

    .dark .filter-input.date-picker {
      background-color: #404040 !important;
      color: #e0e0e0 !important;
      border-color: #555 !important;
    }

    .dark .date-picker:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    /* Light mode styles for date picker */
    .date-picker:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    /* Calendar popup styling (for browsers that support it) */
    .date-picker::-webkit-datetime-edit {
      color: inherit;
    }

    .date-picker::-webkit-datetime-edit-fields-wrapper {
      color: inherit;
    }

    .date-picker::-webkit-datetime-edit-text {
      color: inherit;
    }

    .date-picker::-webkit-datetime-edit-month-field,
    .date-picker::-webkit-datetime-edit-day-field,
    .date-picker::-webkit-datetime-edit-year-field {
      color: inherit;
    }

    .date-picker::-webkit-datetime-edit-hour-field,
    .date-picker::-webkit-datetime-edit-minute-field,
    .date-picker::-webkit-datetime-edit-second-field {
      color: inherit;
    }

    .main-content {
      padding: 1.5rem 0;
      transition: background-color 0.2s ease;
    }

    .dark .main-content {
      background-color: #1a1a1a;
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

    .dark .spinner {
      border-color: #404040;
      border-top-color: #3b82f6;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

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
      background-color: transparent;
      max-width: 90vw;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
    }

    /* Dark mode styles */
    .dark .app-container {
      background-color: #1a1a1a !important;
    }

    .dark .header {
      background-color: #2d2d2d !important;
      border-bottom-color: #404040 !important;
    }

    .dark .filters {
      background-color: #2d2d2d !important;
      border-bottom-color: #404040 !important;
    }

    .dark .app-title {
      color: #e0e0e0 !important;
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

    /* Graph container dark mode */
    .dark .graph-container {
      background-color: #2d2d2d;
      color: #e0e0e0;
    }

    /* SVG dark mode support */
    .dark svg {
      background-color: transparent;
    }
  `]
})
export class AppComponent implements OnInit {
  commits: Commit[] = [];
  filteredCommits: Commit[] = [];
  authors: string[] = [];
  tags: string[] = [];
  
  // Pagination properties
  currentPage = 1;
  pageSize = 25;
  totalCommits = 0;
  totalPages = 1;
  hasNext = false;
  hasPrevious = false;
  
  currentView: 'list' | 'graph' = 'list';
  darkMode = false;
  selectedColorPalette: ColorPaletteId = 'default';
  loading = true;
  showModal = false;
  selectedCommit: Commit | null = null;
  diffFiles: DiffFile[] = [];
  
  // Diff viewer properties
  showDiffModal = false;
  selectedFileName = '';
  selectedDiffFile: DiffFile | null = null;
  
  searchQuery = '';
  selectedAuthor = '';
  selectedSince = '';
  fileFilter = '';

  constructor(private gitService: GitService) {}

  ngOnInit() {
    this.initializeDarkMode();
    this.initializeColorPalette();
    this.loadCommits();
    this.loadTags();
    this.checkDarkMode();
  }

  loadCommits(page: number = 1) {
    this.loading = true;
    this.currentPage = page;
    
    const options: GitOptions = {
      page: page,
      pageSize: this.pageSize
    };
    
    // Add filters if they exist
    if (this.selectedAuthor) options.author = this.selectedAuthor;
    if (this.selectedSince) options.since = this.selectedSince;
    if (this.fileFilter) options.file = this.fileFilter;
    // Note: Search query will need to be handled server-side if we want to implement it

    this.gitService.getCommits(options).subscribe({
      next: (result) => {
        this.commits = result.commits;
        this.filteredCommits = result.commits;
        this.totalCommits = result.total;
        this.totalPages = result.totalPages;
        this.hasNext = result.hasNext;
        this.hasPrevious = result.hasPrevious;
        this.currentPage = result.page;
        this.pageSize = result.pageSize;
        
        // Update authors list (this might need to be loaded separately for all authors)
        this.authors = [...new Set(result.commits.map(c => c.author))];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading commits:', error);
        this.loading = false;
      }
    });
  }

  onPageChange(page: number) {
    this.loadCommits(page);
  }

  onPageSizeChange(pageSize: number) {
    this.pageSize = pageSize;
    this.loadCommits(1); // Reset to first page when changing page size
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
    document.body.classList.toggle('dark', this.darkMode);
    
    // Save preference to localStorage
    localStorage.setItem('darkMode', this.darkMode.toString());
    
    // Debug logging
    console.log('Dark mode toggled:', this.darkMode);
    console.log('Document element classes:', document.documentElement.classList.toString());
    console.log('Body classes:', document.body.classList.toString());
    
    // Force a style refresh by triggering a reflow
    document.body.offsetHeight;
  }

  checkDarkMode() {
    this.darkMode = document.documentElement.classList.contains('dark');
  }

  initializeDarkMode() {
    // Check if user has a saved preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      this.darkMode = savedDarkMode === 'true';
      if (this.darkMode) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      }
    }
  }

  initializeColorPalette() {
    // Check if user has a saved color palette preference
    const savedPalette = localStorage.getItem('colorPalette');
    if (savedPalette && Object.keys(COLOR_PALETTES).includes(savedPalette)) {
      this.selectedColorPalette = savedPalette as ColorPaletteId;
    }
  }

  onColorPaletteChange(paletteId: ColorPaletteId) {
    this.selectedColorPalette = paletteId;
    localStorage.setItem('colorPalette', paletteId);
  }

  getCurrentPalette() {
    const palettes = this.darkMode ? DARK_COLOR_PALETTES : COLOR_PALETTES;
    return palettes[this.selectedColorPalette];
  }

  onSearch() {
    this.loadCommits(1); // Reset to first page when searching
  }

  onAuthorFilter() {
    this.loadCommits(1); // Reset to first page when filtering
  }

  onSinceFilter() {
    this.loadCommits(1); // Reset to first page when filtering
    console.log('Date picker dark mode:', this.darkMode);
    console.log('Document dark class:', document.documentElement.classList.contains('dark'));
  }

  onFileFilter() {
    this.loadCommits(1); // Reset to first page when filtering
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
    console.log('Available diff files:', this.diffFiles);
    
    // Find the diff file for the selected file
    const diffFile = this.diffFiles.find(df => df.file === file);
    console.log('Found diff file:', diffFile);
    
    if (diffFile) {
      this.selectedFileName = file;
      this.selectedDiffFile = diffFile;
      this.showDiffModal = true;
      console.log('Diff modal should be visible now');
    } else {
      console.warn('No diff found for file:', file);
    }
  }

  closeDiffModal() {
    this.showDiffModal = false;
    this.selectedFileName = '';
    this.selectedDiffFile = null;
  }
}
