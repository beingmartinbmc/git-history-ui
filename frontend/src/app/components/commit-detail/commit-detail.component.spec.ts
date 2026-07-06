import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { Commit, CommitImpact } from '../../models/git.models';
import { AnnotationsService } from '../../services/annotations.service';
import { GitService } from '../../services/git.service';
import { InsightsService } from '../../services/insights.service';
import { UiStateService } from '../../services/ui-state.service';
import { CommitDetailComponent } from './commit-detail.component';

function makeCommit(hash: string): Commit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: 'Ada',
    authorEmail: 'ada@x.io',
    date: '2026-01-01T00:00:00Z',
    message: `subject ${hash}`,
    subject: `subject ${hash}`,
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
  };
}

function makeImpact(hash: string, files: string[]): CommitImpact {
  return { hash, files, modules: [], dependencyRipple: [], relatedCommits: [] };
}

describe('CommitDetailComponent', () => {
  let fixture: ComponentFixture<CommitDetailComponent>;
  let component: CommitDetailComponent;
  let state: UiStateService;
  let git: { getDiffFiles: jasmine.Spy; getDiffFile: jasmine.Spy };
  let insights: { impact: jasmine.Spy; explainCommit: jasmine.Spy };

  beforeEach(async () => {
    git = {
      getDiffFiles: jasmine
        .createSpy('getDiffFiles')
        .and.returnValue(of({ files: [], totalLines: 0, isLarge: false })),
      getDiffFile: jasmine.createSpy('getDiffFile').and.returnValue(of(null)),
    };
    const annotations = {
      list: jasmine.createSpy('list').and.returnValue(of([])),
      add: jasmine.createSpy('add'),
      remove: jasmine.createSpy('remove'),
    };
    insights = {
      impact: jasmine.createSpy('impact'),
      explainCommit: jasmine.createSpy('explainCommit'),
    };

    await TestBed.configureTestingModule({
      imports: [CommitDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GitService, useValue: git },
        { provide: InsightsService, useValue: insights },
        { provide: AnnotationsService, useValue: annotations },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommitDetailComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
  });

  it('ignores a stale impact response when a newer impact request is already in flight', () => {
    state.commits.set([makeCommit('aaa'), makeCommit('bbb')]);
    state.selectHash('aaa');
    fixture.detectChanges();

    const first = new Subject<CommitImpact>();
    const second = new Subject<CommitImpact>();
    insights.impact.and.returnValues(first.asObservable(), second.asObservable());

    component.onLoadImpact();
    component.onLoadImpact();

    // The first request was superseded and unsubscribed; its late response
    // must not be applied.
    first.next(makeImpact('aaa', ['stale.ts']));
    first.complete();
    expect(component.impact()).toBeNull();

    second.next(makeImpact('aaa', ['fresh.ts']));
    second.complete();
    expect(component.impact()?.files).toEqual(['fresh.ts']);
    expect(component.loadingImpact()).toBeFalse();
  });

  it('cancels a pending impact request when the selected commit changes', () => {
    state.commits.set([makeCommit('aaa'), makeCommit('bbb')]);
    state.selectHash('aaa');
    fixture.detectChanges();

    const pending = new Subject<CommitImpact>();
    insights.impact.and.returnValue(pending.asObservable());
    component.onLoadImpact();

    state.selectHash('bbb');
    fixture.detectChanges();

    pending.next(makeImpact('aaa', ['old-commit.ts']));
    pending.complete();

    expect(component.impact()).toBeNull();
  });

  it('cancels a pending explain request when the selected commit changes', () => {
    state.commits.set([makeCommit('aaa'), makeCommit('bbb')]);
    state.selectHash('aaa');
    fixture.detectChanges();

    const pending = new Subject<{ summary: string; provider: string }>();
    insights.explainCommit.and.returnValue(pending.asObservable());
    component.onExplain();

    state.selectHash('bbb');
    fixture.detectChanges();

    pending.next({ summary: 'stale explanation', provider: 'heuristic' });
    pending.complete();

    expect(component.explanation()).toBeNull();
    expect(component.explaining()).toBeFalse();
  });

  it('restores activeFile query state after diff metadata loads', () => {
    state.activeFilePath.set('b.ts');
    state.commits.set([makeCommit('aaa')]);
    git.getDiffFiles.and.returnValue(
      of({
        files: [
          { file: 'a.ts', status: 'modified', additions: 1, deletions: 0 },
          { file: 'b.ts', status: 'modified', additions: 2, deletions: 0 },
        ],
        totalLines: 3,
        isLarge: false,
      }),
    );
    git.getDiffFile.and.callFake((_hash: string, file: string) =>
      of({ file, status: 'modified', additions: 1, deletions: 0, changes: '' }),
    );

    state.selectHash('aaa');
    fixture.detectChanges();

    expect(component.activeFileIndex()).toBe(1);
    expect(git.getDiffFile).toHaveBeenCalledWith('aaa', 'b.ts');
    expect(state.activeFilePath()).toBeNull();
  });

  it('cancels stale lazy diff requests when another file is selected', () => {
    state.commits.set([makeCommit('aaa')]);
    git.getDiffFiles.and.returnValue(
      of({
        files: [
          { file: 'a.ts', status: 'modified', additions: 1, deletions: 0 },
          { file: 'b.ts', status: 'modified', additions: 2, deletions: 0 },
        ],
        totalLines: 3,
        isLarge: false,
      }),
    );
    const first = new Subject<any>();
    const second = new Subject<any>();
    git.getDiffFile.and.returnValues(first.asObservable(), second.asObservable());

    state.selectHash('aaa');
    fixture.detectChanges();
    component.selectFile({
      file: 'b.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      changes: '',
    });
    fixture.detectChanges();

    first.next({ file: 'a.ts', status: 'modified', additions: 1, deletions: 0, changes: 'stale' });
    expect(component.activeFile()).toBeNull();

    second.next({ file: 'b.ts', status: 'modified', additions: 2, deletions: 0, changes: 'fresh' });
    expect(component.activeFile()?.file).toBe('b.ts');
  });

  it('unsubscribes pending manual requests when destroyed', () => {
    state.commits.set([makeCommit('aaa')]);
    state.selectHash('aaa');
    fixture.detectChanges();

    const impact = new Subject<CommitImpact>();
    const explain = new Subject<{ summary: string; provider: string }>();
    insights.impact.and.returnValue(impact.asObservable());
    insights.explainCommit.and.returnValue(explain.asObservable());
    component.onLoadImpact();
    component.onExplain();

    expect(impact.observed).toBeTrue();
    expect(explain.observed).toBeTrue();
    fixture.destroy();
    expect(impact.observed).toBeFalse();
    expect(explain.observed).toBeFalse();
  });
});
