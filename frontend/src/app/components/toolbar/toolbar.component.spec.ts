import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToolbarComponent } from './toolbar.component';
import { UiStateService } from '../../services/ui-state.service';

describe('ToolbarComponent', () => {
  let fixture: ComponentFixture<ToolbarComponent>;
  let component: ToolbarComponent;
  let state: UiStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
  });

  it('prioritizes local branches over remote branches', () => {
    state.branches.set(['origin/main', 'feature/ui-refresh', 'origin/feature/ui-refresh']);

    expect(component.branchOptions()).toEqual(['feature/ui-refresh']);
  });

  it('falls back to remote branches when no local branches are available', () => {
    state.branches.set(['origin/main', 'origin/release']);

    expect(component.branchOptions()).toEqual(['origin/main', 'origin/release']);
    expect(component.shortBranch('origin/main')).toBe('main');
  });

  it('renders active filter chips and clears all filters in one action', () => {
    state.filters.set({
      page: 7,
      pageSize: 100,
      branch: 'feature/ui-refresh',
      author: 'Ada',
      since: '2026-01-01',
      until: '2026-02-01',
      file: 'src/app.ts',
      search: 'modern UI'
    });

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(component.activeFilterCount()).toBe(6);
    expect(text).toContain('branch: feature/ui-refresh');
    expect(text).toContain('author: Ada');
    expect(text).toContain('search: modern UI');

    component.clearFilters();

    expect(state.filters()).toEqual({
      page: 1,
      pageSize: 100,
      branch: undefined,
      author: undefined,
      since: undefined,
      until: undefined,
      file: undefined,
      search: undefined
    });
    expect(component.activeFilterCount()).toBe(0);
  });

  it('debounces search updates from the command search box', fakeAsync(() => {
    component.onSearchInput('impact graph');
    tick(249);
    expect(state.filters().search).toBeUndefined();

    tick(1);

    expect(state.filters().search).toBe('impact graph');
    expect(state.filters().page).toBe(1);
  }));
});
