import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Commit, FileHistoryPage } from '../../models/git.models';
import { FileHistoryComponent } from './file-history.component';

function commit(n: number): Commit {
  const hash = String(n).padStart(40, '0');
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: 'Ada',
    authorEmail: 'ada@example.com',
    date: '2026-01-01T00:00:00Z',
    message: `commit ${n}`,
    subject: `commit ${n}`,
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
  };
}

function historyPage(ids: number[], page: number, hasNext: boolean): FileHistoryPage {
  return { commits: ids.map(commit), page, pageSize: 100, hasNext, hasPrevious: page > 1 };
}

describe('FileHistoryComponent', () => {
  let fixture: ComponentFixture<FileHistoryComponent>;
  let component: FileHistoryComponent;
  let http: HttpTestingController;

  const rows = () => fixture.nativeElement.querySelectorAll('ul.commits li') as NodeListOf<Element>;
  const loadMore = () =>
    fixture.nativeElement.querySelector('button.load-more') as HTMLButtonElement | null;
  const historyRequest = () => http.expectOne((r) => r.url === '/api/file-history');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileHistoryComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ path: encodeURIComponent('src/a.ts') })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FileHistoryComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadFirstPage(page: FileHistoryPage) {
    http.expectOne((r) => r.url === '/api/file-stats').error(new ProgressEvent('error'));
    const req = historyRequest();
    expect(req.request.params.get('file')).toBe('src/a.ts');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
    req.flush(page);
    fixture.detectChanges();
  }

  it('loads the first page from the rename-aware endpoint, not /api/commits', () => {
    loadFirstPage(historyPage([3, 2, 1], 1, false));

    http.expectNone((r) => r.url === '/api/commits');
    expect(rows().length).toBe(3);
    expect(loadMore()).toBeNull();
  });

  it('appends the next page, dedupes by hash, and hides "Load more" once exhausted', () => {
    loadFirstPage(historyPage([3, 2], 1, true));
    expect(loadMore()?.textContent).toContain('Load more');

    loadMore()!.click();
    fixture.detectChanges();
    expect(loadMore()?.disabled).toBeTrue();
    expect(loadMore()?.textContent).toContain('Loading');
    loadMore()!.click(); // a second click while loading must not fire another request

    const next = historyRequest();
    expect(next.request.params.get('page')).toBe('2');
    expect(next.request.params.get('pageSize')).toBe('100');
    next.flush(historyPage([2, 1], 2, false)); // 2 overlaps the first page
    fixture.detectChanges();

    expect(component.commits().map((c) => c.subject)).toEqual(['commit 3', 'commit 2', 'commit 1']);
    expect(rows().length).toBe(3);
    expect(loadMore()).toBeNull();
  });

  it('keeps the loaded commits and offers a retry when loading more fails', () => {
    loadFirstPage(historyPage([2, 1], 1, true));

    loadMore()!.click();
    historyRequest().flush({ error: 'git blew up' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(rows().length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('git blew up');
    expect(loadMore()?.disabled).toBeFalse();

    loadMore()!.click();
    expect(historyRequest().request.params.get('page')).toBe('2');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('git blew up');
  });
});
