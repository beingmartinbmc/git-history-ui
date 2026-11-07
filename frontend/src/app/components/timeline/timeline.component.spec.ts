import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TimelineComponent } from './timeline.component';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { Commit } from '../../models/git.models';

describe('TimelineComponent', () => {
  let fixture: ComponentFixture<TimelineComponent>;
  let component: TimelineComponent;
  let state: UiStateService;
  let git: {
    getCommits: jasmine.Spy;
    getSnapshot: jasmine.Spy;
    getRangeDiffFiles: jasmine.Spy;
    getRangeDiffFile: jasmine.Spy;
  };
  let route: { snapshot: { queryParamMap: ReturnType<typeof convertToParamMap> } };

  beforeEach(async () => {
    route = { snapshot: { queryParamMap: convertToParamMap({}) } };
    git = {
      getCommits: jasmine.createSpy('getCommits'),
      getSnapshot: jasmine.createSpy('getSnapshot').and.returnValue(
        of({
          at: '2026-01-01T00:00:00.000Z',
          ref: 'old-ref',
          branches: { main: 'head-ref', release: 'old-ref' },
          tags: { 'v1.0.0': 'old-ref' },
        }),
      ),
      getRangeDiffFiles: jasmine.createSpy('getRangeDiffFiles').and.returnValue(
        of({
          files: [
            { file: 'src/app.ts', status: 'modified', additions: 4, deletions: 2 },
            { file: 'src/util.ts', status: 'added', additions: 9, deletions: 0 },
          ],
          totalLines: 15,
          isLarge: false,
        }),
      ),
      getRangeDiffFile: jasmine
        .createSpy('getRangeDiffFile')
        .and.callFake((_from: string, _to: string, file: string) =>
          of({
            file,
            status: 'modified',
            additions: 4,
            deletions: 2,
            changes: '@@ -1 +1 @@\n-old\n+new',
          }),
        ),
    };

    await TestBed.configureTestingModule({
      imports: [TimelineComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GitService, useValue: git },
        { provide: ActivatedRoute, useValue: route },
      ],
    }).compileComponents();

    state = TestBed.inject(UiStateService);
    state.commits.set([
      commit('head-ref', '2026-02-01T00:00:00.000Z', 'Grace', 'latest work'),
      commit('middle-ref', '2026-01-15T00:00:00.000Z', 'Ada', 'middle work'),
      commit('old-ref', '2026-01-01T00:00:00.000Z', 'Ada', 'old work'),
    ]);

    fixture = TestBed.createComponent(TimelineComponent);
    component = fixture.componentInstance;
  });

  it('computes the custom rail percentage from the selected tick', () => {
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.getAttribute('aria-label')).toBe('Repository moment');
    expect(slider.getAttribute('aria-describedby')).toBe('timeline-instructions');
    const target = Math.floor((component.ticks().length - 1) / 2);

    component.onTickChange(target);

    expect(component.tickPct()).toBe(Math.round((target / (component.ticks().length - 1)) * 100));
  });

  it('starts at the latest tick instead of computing an old range diff', fakeAsync(() => {
    fixture.detectChanges();

    expect(component.tickIndex()).toBe(component.ticks().length - 1);
    tick(181);

    expect(git.getSnapshot).toHaveBeenCalledWith('2026-02-01T00:00:00.000Z');
  }));

  it('loads snapshot diff and selects the first changed file', fakeAsync(() => {
    fixture.detectChanges();
    tick(181);
    fixture.detectChanges();

    expect(git.getSnapshot).toHaveBeenCalled();
    expect(git.getRangeDiffFiles).toHaveBeenCalledWith('old-ref', 'HEAD');
    expect(git.getRangeDiffFile).toHaveBeenCalledOnceWith('old-ref', 'HEAD', 'src/app.ts');
    expect(component.selectedFile()?.file).toBe('src/app.ts');
    const file = fixture.nativeElement.querySelector('.files .file') as HTMLButtonElement;
    expect(file.tagName).toBe('BUTTON');
    expect(file.getAttribute('aria-pressed')).toBe('true');
  }));

  it('fetches a file body only when that file is selected', fakeAsync(() => {
    fixture.detectChanges();
    tick(181);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      '.files .file',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    fixture.detectChanges();

    expect(git.getRangeDiffFile).toHaveBeenCalledTimes(2);
    expect(git.getRangeDiffFile).toHaveBeenCalledWith('old-ref', 'HEAD', 'src/util.ts');
    expect(component.selectedFile()?.file).toBe('src/util.ts');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  }));

  it('reports a failed file body without keeping the previous patch', fakeAsync(() => {
    fixture.detectChanges();
    tick(181);

    git.getRangeDiffFile.and.returnValue(throwError(() => ({ error: { error: 'gone' } })));
    component.selectFile(component.diff()![1]);

    expect(component.selectedFile()).toBeNull();
    expect(component.diffError()).toBe('gone');
    expect(component.loadingFile()).toBeFalse();
  }));

  it('formats branch, tag, and diff status entries for snapshot cards', () => {
    const snapshot = {
      at: '2026-01-01T00:00:00.000Z',
      ref: 'old-ref',
      branches: { main: 'head-ref' },
      tags: { 'v1.0.0': 'old-ref' },
    };

    expect(component.branchEntries(snapshot)).toEqual([{ name: 'main', hash: 'head-ref' }]);
    expect(component.tagEntries(snapshot)).toEqual([{ name: 'v1.0.0', hash: 'old-ref' }]);
    expect(component.statusLabel('modified')).toBe('mod');
    expect(component.statusLabel('added')).toBe('add');
  });

  it('shows author breakdown and recent commits for the selected time window', () => {
    fixture.detectChanges();
    component.onTickChange(0);
    fixture.detectChanges();

    expect(component.authorBreakdown()).toEqual([{ author: 'Ada', count: 1 }]);
    expect(component.momentSummary()).toContain('1 commit by 1 author');
    expect(component.recentCommits()[0].hash).toBe('old-ref');
    expect(component.initials('Grace Hopper')).toBe('GH');
  });

  it('selects the snapshot commit from the commit-at-this-point card', fakeAsync(() => {
    fixture.detectChanges();
    tick(181);
    fixture.detectChanges();

    expect(component.headCommit()?.hash).toBe('old-ref');
    component.selectCommit(component.headCommit()!);

    expect(state.selectedHash()).toBe('old-ref');
  }));

  it('does not refetch commits when history already loaded them', () => {
    fixture.detectChanges();

    expect(git.getCommits).not.toHaveBeenCalled();
    expect(component.loadingCommits()).toBeFalse();
  });

  describe('cold /timeline visit', () => {
    function coldPage(commits: Commit[]) {
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

    function createCold() {
      state.commits.set([]);
      fixture = TestBed.createComponent(TimelineComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    }

    it('loads commits with URL-hydrated filters and renders the slider', fakeAsync(() => {
      route.snapshot.queryParamMap = convertToParamMap({
        since: '2026-01-01',
        until: '2026-02-01',
        branch: 'main',
        author: 'Ada',
        file: 'src/app.ts',
        search: 'ignored',
      });
      git.getCommits.and.returnValue(
        of(
          coldPage([
            commit('head-ref', '2026-02-01T00:00:00.000Z'),
            commit('old-ref', '2026-01-01T00:00:00.000Z'),
          ]),
        ),
      );

      createCold();

      expect(git.getCommits).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          since: '2026-01-01',
          until: '2026-02-01',
          branch: 'main',
          author: 'Ada',
          file: 'src/app.ts',
          page: 1,
        }),
      );
      expect(git.getCommits.calls.mostRecent().args[0].search).toBeUndefined();
      expect(state.filters().branch).toBe('main');
      expect(state.commits().length).toBe(2);
      expect(component.ticks().length).toBeGreaterThan(0);
      expect(component.loadingCommits()).toBeFalse();
      tick(181);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input[type="range"]')).not.toBeNull();
    }));

    it('renders an empty result without throwing', () => {
      git.getCommits.and.returnValue(of(coldPage([])));

      expect(() => createCold()).not.toThrow();
      expect(component.ticks().length).toBe(0);
    });

    it('shows the load error', () => {
      git.getCommits.and.returnValue(throwError(() => ({ error: { error: 'repo missing' } })));

      createCold();

      expect(component.commitsError()).toBe('repo missing');
      expect(fixture.nativeElement.textContent).toContain('repo missing');
    });
  });

  function commit(hash: string, date: string, author = 'Ada', subject = 'test commit'): Commit {
    return {
      hash,
      shortHash: hash.slice(0, 7),
      author,
      authorEmail: `${author.toLowerCase()}@example.com`,
      date,
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
