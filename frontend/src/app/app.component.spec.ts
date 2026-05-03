import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AppComponent } from './app.component';
import { Commit, NlSearchResponse, PaginatedCommits } from './models/git.models';
import { GitService } from './services/git.service';
import { SearchService } from './services/search.service';
import { UiStateService } from './services/ui-state.service';

describe('AppComponent deep links', () => {
  let fixture: ComponentFixture<AppComponent>;
  let state: UiStateService;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let git: jasmine.SpyObj<GitService>;

  beforeEach(async () => {
    queryParams = new BehaviorSubject(convertToParamMap({}));
    git = jasmine.createSpyObj<GitService>('GitService', [
      'streamCommits',
      'getCommits',
      'getCommit',
      'getAuthors',
      'getBranches',
      'getTags',
    ]);
    git.streamCommits.and.returnValue(of(page([commit('head-ref', 'latest')])));
    git.getCommits.and.returnValue(of(page([commit('head-ref', 'latest')])));
    git.getAuthors.and.returnValue(of([]));
    git.getBranches.and.returnValue(of([]));
    git.getTags.and.returnValue(of([]));

    const search = jasmine.createSpyObj<SearchService>('SearchService', ['naturalLanguage']);
    search.naturalLanguage.and.returnValue(of(nlPage([])));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        { provide: GitService, useValue: git },
        { provide: SearchService, useValue: search },
      ],
    }).compileComponents();

    state = TestBed.inject(UiStateService);
  });

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
      parsedQuery: {
        keywords: [],
        expandedKeywords: [],
        rawQuery: '',
      },
      usedLlm: false,
      llmProvider: 'heuristic',
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
