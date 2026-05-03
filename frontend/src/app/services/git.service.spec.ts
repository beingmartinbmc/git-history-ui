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
