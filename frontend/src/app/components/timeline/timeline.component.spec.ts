import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { TimelineComponent } from './timeline.component';
import { TimelineService } from '../../services/timeline.service';
import { UiStateService } from '../../services/ui-state.service';
import { Commit } from '../../models/git.models';

describe('TimelineComponent', () => {
  let fixture: ComponentFixture<TimelineComponent>;
  let component: TimelineComponent;
  let state: UiStateService;
  let timelineApi: {
    snapshot: jasmine.Spy;
    rangeDiff: jasmine.Spy;
  };

  beforeEach(async () => {
    timelineApi = {
      snapshot: jasmine.createSpy('snapshot').and.returnValue(
        of({
          at: '2026-01-01T00:00:00.000Z',
          ref: 'old-ref',
          branches: { main: 'head-ref', release: 'old-ref' },
          tags: { 'v1.0.0': 'old-ref' },
        }),
      ),
      rangeDiff: jasmine.createSpy('rangeDiff').and.returnValue(
        of([
          {
            file: 'src/app.ts',
            status: 'modified',
            additions: 4,
            deletions: 2,
            changes: '@@ -1 +1 @@\n-old\n+new',
          },
        ]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [TimelineComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TimelineService, useValue: timelineApi },
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
    const target = Math.floor((component.ticks().length - 1) / 2);

    component.onTickChange(target);

    expect(component.tickPct()).toBe(Math.round((target / (component.ticks().length - 1)) * 100));
  });

  it('loads snapshot diff and selects the first changed file', fakeAsync(() => {
    fixture.detectChanges();
    tick(181);
    fixture.detectChanges();

    expect(timelineApi.snapshot).toHaveBeenCalled();
    expect(timelineApi.rangeDiff).toHaveBeenCalledWith('old-ref', 'head-ref');
    expect(component.selectedFile()?.file).toBe('src/app.ts');
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
