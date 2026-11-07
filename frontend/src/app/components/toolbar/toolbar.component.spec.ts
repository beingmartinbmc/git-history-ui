import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToolbarComponent } from './toolbar.component';
import { Checkout } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';

describe('ToolbarComponent', () => {
  let fixture: ComponentFixture<ToolbarComponent>;
  let component: ToolbarComponent;
  let state: UiStateService;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
    http = TestBed.inject(HttpTestingController);
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
      search: 'modern UI',
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
      search: undefined,
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

  it('cancels a pending search update when destroyed', fakeAsync(() => {
    component.onSearchInput('stale query');
    fixture.destroy();
    tick(250);

    expect(state.filters().search).toBeUndefined();
  }));

  it('offers a safely-targeted repository link so the project stays discoverable', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[href="https://github.com/beingmartinbmc/git-history-ui"]',
    ) as HTMLAnchorElement | null;

    expect(link).withContext('toolbar must link back to the repository').not.toBeNull();
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
  });

  describe('export', () => {
    let clicked: number;

    beforeEach(() => {
      clicked = 0;
      spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(() => void clicked++);
      state.filters.set({
        page: 3,
        pageSize: 100,
        branch: 'feature/ui',
        author: 'Ada',
        since: '2026-01-01',
        until: '2026-02-01',
        file: 'src/app.ts',
        search: 'login bug',
      });
    });

    it('sends every active filter plus searchMode=nl when natural-language search is on', () => {
      state.searchMode.set('nl');

      component.exportCommits();

      const req = http.expectOne((r) => r.url === '/api/export/commits');
      expect(req.request.params.keys().sort()).toEqual(
        ['author', 'branch', 'file', 'format', 'search', 'searchMode', 'since', 'until'].sort(),
      );
      expect(req.request.params.get('searchMode')).toBe('nl');
      expect(req.request.params.get('search')).toBe('login bug');
      expect(req.request.params.get('format')).toBe('csv');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['h\na']), { headers: { 'X-Export-Truncated': 'false' } });
      expect(clicked).toBe(1);
      expect(component.exportNotice()).toBeNull();
    });

    it('omits searchMode in classic mode', () => {
      component.exportCommits();

      const req = http.expectOne((r) => r.url === '/api/export/commits');
      expect(req.request.params.has('searchMode')).toBeFalse();
      expect(req.request.params.get('branch')).toBe('feature/ui');
      req.flush(new Blob(['h\na']), { headers: { 'X-Export-Truncated': 'false' } });
    });

    it('tells the user how many rows were exported when the server truncates', async () => {
      component.exportCommits();

      http
        .expectOne((r) => r.url === '/api/export/commits')
        .flush(new Blob(['h\na\nb\nc']), {
          headers: { 'X-Export-Truncated': 'true', 'X-Total-Commits': '12' },
        });
      // Blob.text() settles outside the zone, so wait for the signal rather than whenStable().
      for (let i = 0; i < 100 && !component.exportNotice(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(clicked).toBe(1);
      expect(component.exportNotice()).toContain('exported 3 of 12 commits');
      expect(component.exporting()).toBeFalse();
    });

    it('surfaces a failed export instead of failing silently', () => {
      component.exportCommits();

      http
        .expectOne((r) => r.url === '/api/export/commits')
        .flush(new Blob(['boom']), { status: 500, statusText: 'Server Error' });

      expect(clicked).toBe(0);
      expect(component.exportNotice()).toContain('Export failed');
      expect(component.exporting()).toBeFalse();
    });
  });

  describe('repository switcher', () => {
    const alpha: Checkout = { id: 'a', name: 'alpha', lastOpened: null, current: true };
    const beta: Checkout = {
      id: 'b',
      name: 'beta',
      lastOpened: '2026-01-01T00:00:00Z',
      current: false,
    };
    const select = () =>
      fixture.nativeElement.querySelector(
        'select[aria-label="Switch repository"]',
      ) as HTMLSelectElement | null;
    const choose = (id: string) => {
      const el = select()!;
      el.value = id;
      el.dispatchEvent(new Event('change'));
    };
    const listCheckouts = (checkouts: Checkout[]) => {
      http.expectOne('/api/checkouts').flush({ current: 'a', checkouts });
      fixture.detectChanges();
    };

    it('is hidden when only the current checkout exists', () => {
      listCheckouts([alpha]);

      expect(select()).toBeNull();
    });

    it('is hidden, without surfacing an error, when the server predates /api/checkouts', () => {
      http.expectOne('/api/checkouts').flush('nope', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(select()).toBeNull();
      expect(component.exportNotice()).toBeNull();
    });

    it('lists every checkout by name with the current one selected', () => {
      listCheckouts([alpha, beta]);

      const options = Array.from(select()!.options);
      expect(options.map((o) => o.textContent?.trim())).toEqual(['alpha', 'beta']);
      expect(select()!.value).toBe('a');
    });

    it('opens the chosen checkout, then navigates to the returned url', () => {
      const navigate = spyOn(component, 'navigate');
      listCheckouts([alpha, beta]);

      choose('b');

      const open = http.expectOne('/api/checkouts/b/open');
      expect(open.request.method).toBe('POST');
      expect(navigate).not.toHaveBeenCalled();
      open.flush({ url: 'http://127.0.0.1:4010/' });
      expect(navigate).toHaveBeenCalledOnceWith('http://127.0.0.1:4010/');
    });

    it('does nothing when the current checkout is re-selected', () => {
      const navigate = spyOn(component, 'navigate');
      listCheckouts([alpha, beta]);

      choose('a');

      http.expectNone((r) => r.url.endsWith('/open'));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('reverts the selection and says why when the server refuses', () => {
      const navigate = spyOn(component, 'navigate');
      listCheckouts([alpha, beta]);

      choose('b');
      http
        .expectOne('/api/checkouts/b/open')
        .flush({ error: 'Too many open repositories' }, { status: 429, statusText: 'Too Many' });

      expect(navigate).not.toHaveBeenCalled();
      expect(select()!.value).toBe('a');
      expect(component.exportNotice()).toBe('Too many open repositories');
    });

    it('refuses to navigate to a non-http(s) url', () => {
      const navigate = spyOn(component, 'navigate');
      listCheckouts([alpha, beta]);

      choose('b');
      http.expectOne('/api/checkouts/b/open').flush({ url: 'javascript:alert(1)' });

      expect(navigate).not.toHaveBeenCalled();
      expect(select()!.value).toBe('a');
      expect(component.exportNotice()).toContain('Could not open');
    });
  });
});
