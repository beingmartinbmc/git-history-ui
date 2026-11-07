import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AppComponent } from './app.component';
import { Commit, NlSearchResponse, PaginatedCommits } from './models/git.models';
import { GitService } from './services/git.service';
import { UiStateService } from './services/ui-state.service';

@Component({ standalone: true, template: '' })
class EmptyRouteComponent {}

describe('AppComponent deep links', () => {
  let fixture: ComponentFixture<AppComponent>;
  let state: UiStateService;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let git: jasmine.SpyObj<GitService>;
  let eventSources: FakeEventSource[];
  let originalEventSource: typeof EventSource;

  beforeEach(async () => {
    eventSources = [];
    originalEventSource = window.EventSource;
    window.EventSource = class {
      onerror: ((event: Event) => void) | null = null;
      constructor() {
        eventSources.push(this as unknown as FakeEventSource);
      }
      addEventListener() {}
      close() {
        (this as unknown as FakeEventSource).closed = true;
      }
    } as unknown as typeof EventSource;
    queryParams = new BehaviorSubject(convertToParamMap({}));
    git = jasmine.createSpyObj<GitService>('GitService', [
      'streamCommits',
      'getCommits',
      'getCommit',
      'getAuthors',
      'getBranches',
      'getTags',
      'getCheckouts',
      'getIndexStatus',
      'buildIndex',
      'rebuildIndex',
      'cancelIndexBuild',
      'naturalLanguage',
    ]);
    git.streamCommits.and.returnValue(of(page([commit('head-ref', 'latest')])));
    git.getCommits.and.returnValue(of(page([commit('head-ref', 'latest')])));
    git.getAuthors.and.returnValue(of([]));
    git.getBranches.and.returnValue(of([]));
    git.getTags.and.returnValue(of([]));
    git.getCheckouts.and.returnValue(of({ current: '', checkouts: [] }));
    git.getIndexStatus.and.returnValue(of(indexStatus()));
    git.buildIndex.and.returnValue(of(indexStatus()));
    git.rebuildIndex.and.returnValue(of(indexStatus()));
    git.cancelIndexBuild.and.returnValue(of(indexStatus()));
    git.naturalLanguage.and.returnValue(of(nlPage([])));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: '', component: EmptyRouteComponent },
          { path: 'insights', component: EmptyRouteComponent },
        ]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        { provide: GitService, useValue: git },
      ],
    }).compileComponents();

    await TestBed.inject(Router).navigateByUrl('/');
    state = TestBed.inject(UiStateService);
  });

  afterEach(() => {
    window.EventSource = originalEventSource;
  });

  it('hydrates filters before issuing the first commits request', fakeAsync(() => {
    queryParams.next(
      convertToParamMap({
        branch: 'feature/deep-link',
        author: 'Ada',
        search: 'race fix',
        file: 'src/app.ts',
        since: '2026-01-01',
        until: '2026-02-01',
      }),
    );

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(git.streamCommits).toHaveBeenCalledTimes(1);
    expect(git.streamCommits).toHaveBeenCalledWith(
      jasmine.objectContaining({
        branch: 'feature/deep-link',
        author: 'Ada',
        search: 'race fix',
        file: 'src/app.ts',
        since: '2026-01-01',
        until: '2026-02-01',
      }),
    );
    expect(git.streamCommits).not.toHaveBeenCalledWith(
      jasmine.objectContaining({ branch: undefined, author: undefined }),
    );
  }));

  it('restores commit aliases, PR mode, search mode, and active file state', fakeAsync(() => {
    const shared = commit('9761', 'shared commit');
    git.streamCommits.and.returnValue(of(page([shared])));
    queryParams.next(
      convertToParamMap({
        at: shared.hash,
        pr: '42',
        mode: 'grouped',
        searchMode: 'nl',
        activeFile: 'src/deep-link.ts',
      }),
    );

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(state.selectedHash()).toBe(shared.hash);
    expect(state.focusedPrNumber()).toBe(42);
    expect(state.viewMode()).toBe('grouped');
    expect(state.searchMode()).toBe('nl');
    expect(state.activeFilePath()).toBe('src/deep-link.ts');
    expect(state.mobileDetailOpen()).toBeTrue();
    expect(state.queryParams()['at']).toBe(shared.hash);
    expect(state.queryParams()['commit']).toBeNull();
  }));

  it('keeps the mobile list visible for the automatic initial selection', fakeAsync(() => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(state.selectedHash()).toBe('head-ref');
    expect(state.mobileDetailOpen()).toBeFalse();
  }));

  it('does not load commits or open EventSource outside history', fakeAsync(() => {
    const router = TestBed.inject(Router);
    router.navigateByUrl('/insights');
    tick();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(git.streamCommits).not.toHaveBeenCalled();
    expect(git.getCommits).not.toHaveBeenCalled();
    expect(eventSources.length).toBe(0);
  }));

  it('closes EventSource when navigating away from history', fakeAsync(() => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();
    expect(eventSources.length).toBe(1);

    TestBed.inject(Router).navigateByUrl('/insights');
    tick();
    fixture.detectChanges();

    expect(eventSources[0].closed).toBeTrue();
  }));

  it('selects a shared commit from the loaded page without fetching it again', fakeAsync(() => {
    const shared = commit('976170e159376e64d135d7eec9f1884f681a8ce8', 'shared commit');
    git.streamCommits.and.returnValue(of(page([shared, commit('head-ref', 'latest')])));
    queryParams.next(convertToParamMap({ commit: shared.shortHash }));

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick(250);
    fixture.detectChanges();
    tick();

    expect(state.selectedHash()).toBe(shared.hash);
    expect(git.getCommit).not.toHaveBeenCalled();
  }));

  it('fetches and pins a shared commit that is outside the loaded page', fakeAsync(() => {
    const shared = commit('976170e159376e64d135d7eec9f1884f681a8ce8', 'shared commit');
    git.getCommit.and.returnValue(of(shared));
    queryParams.next(convertToParamMap({ commit: shared.hash }));

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick(250);
    fixture.detectChanges();
    tick();

    expect(git.getCommit).toHaveBeenCalledWith(shared.hash);
    expect(state.selectedHash()).toBe(shared.hash);
    expect(state.commits()[0].hash).toBe(shared.hash);
  }));

  it('pages natural-language results through /api/search on Load more', fakeAsync(() => {
    git.naturalLanguage.and.callFake((_q, opts) =>
      of({
        ...nlPage([commit(`nl-${opts?.page ?? 1}`, 'nl hit')]),
        page: opts?.page ?? 1,
        hasNext: (opts?.page ?? 1) === 1,
      }),
    );
    queryParams.next(convertToParamMap({ searchMode: 'nl', search: 'login bug', author: 'Ada' }));

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();
    expect(state.hasNext()).toBeTrue();

    fixture.componentInstance.loadMore();
    tick();

    expect(git.naturalLanguage).toHaveBeenCalledWith(
      'login bug',
      jasmine.objectContaining({ page: 2, author: 'Ada' }),
    );
    expect(git.getCommits).not.toHaveBeenCalled();
    expect(state.commits().map((c) => c.hash)).toEqual(['nl-1', 'nl-2']);
    expect(state.page()).toBe(2);
  }));

  it('pages classic results through /api/commits on Load more', fakeAsync(() => {
    git.streamCommits.and.returnValue(of({ ...page([commit('c1', 'one')]), hasNext: true }));
    git.getCommits.and.returnValue(of({ ...page([commit('c2', 'two')]), page: 2 }));
    queryParams.next(convertToParamMap({ search: 'login bug' }));

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    fixture.componentInstance.loadMore();
    tick();

    expect(git.getCommits).toHaveBeenCalledWith(
      jasmine.objectContaining({ page: 2, search: 'login bug' }),
    );
    expect(git.naturalLanguage).not.toHaveBeenCalled();
    expect(state.commits().map((c) => c.hash)).toEqual(['c1', 'c2']);
  }));

  function page(commits: Commit[]): PaginatedCommits {
    return {
      commits,
      total: commits.length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    };
  }

  function nlPage(commits: Commit[]): NlSearchResponse {
    return {
      ...page(commits),
      truncated: false,
      availableTotal: commits.length,
      parsedQuery: {
        keywords: [],
        expandedKeywords: [],
        rawQuery: '',
      },
      usedLlm: false,
      llmProvider: 'heuristic',
    };
  }

  function indexStatus() {
    return {
      available: true,
      total: 0,
      running: false,
      progress: {
        phase: 'idle' as const,
        indexed: 0,
        startedAt: null,
        updatedAt: null,
      },
    };
  }

  function commit(hash: string, subject: string): Commit {
    return {
      hash,
      shortHash: hash.slice(0, 7),
      author: 'Ada',
      authorEmail: 'ada@example.com',
      date: '2026-01-01T00:00:00.000Z',
      message: subject,
      subject,
      body: '',
      parents: [],
      branches: [],
      tags: [],
      isMerge: false,
    };
  }
});

describe('AppComponent URL round-trip (real router)', () => {
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = window.EventSource;
    window.EventSource = class {
      onerror = null;
      addEventListener() {}
      close() {}
    } as unknown as typeof EventSource;
  });

  afterEach(() => {
    window.EventSource = originalEventSource;
  });

  it('keeps all loaded rows and the closed mobile detail after selecting a commit post Load more', async () => {
    const rows = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => rowCommit(from + i));
    const respond = (commits: Commit[], pageNo: number, hasNext: boolean): PaginatedCommits => ({
      commits,
      total: 200,
      page: pageNo,
      pageSize: 100,
      totalPages: 2,
      hasNext,
      hasPrevious: pageNo > 1,
    });
    const git = jasmine.createSpyObj<GitService>('GitService', [
      'streamCommits',
      'getCommits',
      'getCommit',
      'getAuthors',
      'getBranches',
      'getTags',
      'getCheckouts',
      'getIndexStatus',
      'invalidate',
    ]);
    git.streamCommits.and.returnValue(of(respond(rows(0, 100), 1, true)));
    git.getCommits.and.returnValue(of(respond(rows(100, 200), 2, false)));
    git.getAuthors.and.returnValue(of([]));
    git.getBranches.and.returnValue(of([]));
    git.getTags.and.returnValue(of([]));
    git.getCheckouts.and.returnValue(of({ current: '', checkouts: [] }));
    git.getIndexStatus.and.returnValue(
      of({
        available: true,
        total: 0,
        running: false,
        progress: { phase: 'idle' as const, indexed: 0, startedAt: null, updatedAt: null },
      }),
    );

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: '', component: EmptyRouteComponent }]),
        { provide: GitService, useValue: git },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    const state = TestBed.inject(UiStateService);
    await router.navigateByUrl('/');

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.loadMore();
    expect(state.commits().length).toBe(200);

    state.selectedHash.set(rowCommit(150).hash);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.url).toContain(`commit=${rowCommit(150).hash}`);
    expect(state.commits().length).toBe(200);
    expect(state.page()).toBe(2);
    expect(state.selectedHash()).toBe(rowCommit(150).hash);
    expect(state.mobileDetailOpen()).toBeFalse();
    expect(git.getCommits).toHaveBeenCalledTimes(1);
  });

  function rowCommit(n: number): Commit {
    const hash = (0x100000 + n).toString(16).padStart(40, 'a');
    return {
      hash,
      shortHash: hash.slice(0, 7),
      author: 'Ada',
      authorEmail: 'ada@example.com',
      date: '2026-01-01T00:00:00.000Z',
      message: `c${n}`,
      subject: `c${n}`,
      body: '',
      parents: [],
      branches: [],
      tags: [],
      isMerge: false,
    };
  }
});

interface FakeEventSource {
  closed?: boolean;
}
