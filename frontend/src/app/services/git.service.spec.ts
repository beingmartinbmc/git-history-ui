import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GitService } from './git.service';

describe('GitService', () => {
  let service: GitService;
  let http: HttpTestingController;
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = window.EventSource;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GitService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      writable: true,
      value: originalEventSource,
    });
  });

  it('loads repository identity and portable report contracts', () => {
    service.getRepository().subscribe();
    http.expectOne('/api/repository').flush({
      name: 'widgets',
      remoteUrl: 'https://github.com/acme/widgets',
      webUrl: 'https://github.com/acme/widgets',
      currentBranch: 'main',
      defaultBranch: 'main',
      currentAuthor: { name: 'Ada', email: 'ada@example.com' },
    });
    service.getAuthorIdentities().subscribe();
    http.expectOne('/api/authors/details').flush([{ name: 'Ada', email: 'ada@example.com' }]);

    service.getCommitReportMarkdown('abcdef1').subscribe();
    const report = http.expectOne('/api/report/abcdef1?format=markdown');
    expect(report.request.responseType).toBe('text');
    report.flush('# report');
  });

  it('posts view state for backend-generated portable links', () => {
    service.createPortableLink({ view: 'compare', from: 'main', to: 'next' }).subscribe();
    const request = http.expectOne('/api/share');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      viewState: { view: 'compare', from: 'main', to: 'next' },
    });
    request.flush({
      url: 'git-history-ui://open?v=1&repo=https%3A%2F%2Fgithub.com%2Fa%2Fb&view=compare',
      expiresAt: null,
      mode: 'portable',
    });
  });

  it('sends branch filters with grouped commit requests', () => {
    service
      .getGroups({
        since: '2026-01-01',
        until: '2026-02-01',
        author: 'Ada',
        branch: 'feature/ui-refresh',
      })
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/groups');
    expect(request.request.params.get('since')).toBe('2026-01-01');
    expect(request.request.params.get('until')).toBe('2026-02-01');
    expect(request.request.params.get('author')).toBe('Ada');
    expect(request.request.params.get('branch')).toBe('feature/ui-refresh');
    request.flush([]);
  });

  it('preserves natural-language search query construction', () => {
    service
      .naturalLanguage('login bug', {
        page: 2,
        pageSize: 25,
        author: 'Ada',
        branch: 'main',
        file: 'src/app.ts',
      })
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/search');
    expect(request.request.params.get('q')).toBe('login bug');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('author')).toBe('Ada');
    expect(request.request.params.get('branch')).toBe('main');
    expect(request.request.params.get('file')).toBe('src/app.ts');
    request.flush({
      commits: [],
      total: 0,
      page: 2,
      pageSize: 25,
      totalPages: 0,
      hasNext: false,
      hasPrevious: true,
      parsedQuery: { rawQuery: 'login bug', keywords: [], expandedKeywords: [] },
      usedLlm: false,
      llmProvider: 'heuristic',
    });
  });

  it('preserves snapshot and timeline range requests', () => {
    service.getSnapshot('2026-01-01T00:00:00.000Z').subscribe();
    const snapshot = http.expectOne('/api/snapshot?at=2026-01-01T00:00:00.000Z');
    expect(snapshot.request.params.get('at')).toBe('2026-01-01T00:00:00.000Z');
    snapshot.flush({ at: '2026-01-01T00:00:00.000Z', ref: null, branches: {}, tags: {} });

    service.getTimelineRangeDiff('old-ref', 'HEAD').subscribe();
    const range = http.expectOne('/api/diff?from=old-ref&to=HEAD');
    expect(range.request.params.get('from')).toBe('old-ref');
    expect(range.request.params.get('to')).toBe('HEAD');
    range.flush([]);
  });

  it('surfaces server-sent stream error messages', fakeAsync(() => {
    const source = installMockEventSource();
    let error: unknown;

    service.streamCommits().subscribe({
      error: (err) => {
        error = err;
      },
    });

    source.dispatch(
      'error',
      new MessageEvent('error', {
        data: JSON.stringify({ message: 'Not a git repository' }),
      }),
    );
    http.expectOne('/api/commits').flush(
      { error: 'Not a git repository' },
      {
        status: 500,
        statusText: 'Server Error',
      },
    );
    tick();

    expect(error).toEqual(jasmine.any(Error));
    expect((error as Error).message).toBe('Not a git repository');
    expect(source.closed).toBeTrue();
  }));

  it('falls back to the JSON commits endpoint when the stream fails', fakeAsync(() => {
    const source = installMockEventSource();
    let total = 0;
    let completed = false;

    service.streamCommits({ pageSize: 25 }).subscribe({
      next: (resp) => {
        total = resp.total;
      },
      complete: () => {
        completed = true;
      },
    });

    source.dispatch('error', new Event('error'));
    http.expectOne('/api/commits?pageSize=25').flush({
      commits: [],
      total: 7,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
    tick();

    expect(total).toBe(7);
    expect(completed).toBeTrue();
    expect(source.closed).toBeTrue();
  }));

  it('caps streamed commits at requested page size and uses done metadata', fakeAsync(() => {
    const source = installMockEventSource();
    let latestTotal = 0;
    let latestCount = 0;
    let hasNext = false;
    let completed = false;

    service.streamCommits({ pageSize: 2 }).subscribe({
      next: (resp) => {
        latestTotal = resp.total;
        latestCount = resp.commits.length;
        hasNext = resp.hasNext;
      },
      complete: () => {
        completed = true;
      },
    });

    for (let i = 0; i < 5; i++) {
      source.dispatch(
        'commit',
        new MessageEvent('commit', {
          data: JSON.stringify({
            hash: `h${i}`,
            shortHash: `h${i}`,
            author: 'a',
            authorEmail: 'a@x',
            date: '',
            message: '',
            subject: '',
            body: '',
            parents: [],
            branches: [],
            tags: [],
            isMerge: false,
          }),
        }),
      );
    }
    source.dispatch(
      'done',
      new MessageEvent('done', {
        data: JSON.stringify({
          total: 5,
          page: 1,
          pageSize: 2,
          totalPages: 3,
          hasNext: true,
          hasPrevious: false,
        }),
      }),
    );
    tick(140);

    expect(latestCount).toBe(2);
    expect(latestTotal).toBe(5);
    expect(hasNext).toBeTrue();
    expect(completed).toBeTrue();
    expect(source.closed).toBeTrue();
  }));

  function installMockEventSource(): MockEventSource {
    let instance: MockEventSource | null = null;
    class MockEventSourceCtor extends MockEventSource {
      constructor(url: string) {
        super(url);
        instance = this;
      }
    }
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      writable: true,
      value: MockEventSourceCtor,
    });
    return {
      get url() {
        return instance?.url ?? '';
      },
      get closed() {
        return instance?.closed ?? false;
      },
      dispatch(type: string, event: Event) {
        instance?.dispatch(type, event);
      },
    } as MockEventSource;
  }
});

class MockEventSource {
  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  closed = false;

  constructor(readonly url: string = '') {}

  addEventListener(type: string, listener: (event: Event) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  dispatch(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
