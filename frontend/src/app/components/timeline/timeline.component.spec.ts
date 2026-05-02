import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      snapshot: jasmine.createSpy('snapshot').and.returnValue(of({
        at: '2026-01-01T00:00:00.000Z',
        ref: 'old-ref',
        branches: { main: 'head-ref', release: 'old-ref' },
        tags: { 'v1.0.0': 'old-ref' }
      })),
      rangeDiff: jasmine.createSpy('rangeDiff').and.returnValue(of([
        {
          file: 'src/app.ts',
          status: 'modified',
          additions: 4,
          deletions: 2,
          changes: '@@ -1 +1 @@\n-old\n+new'
        }
      ]))
    };

    await TestBed.configureTestingModule({
      imports: [TimelineComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TimelineService, useValue: timelineApi }
      ]
    }).compileComponents();

    state = TestBed.inject(UiStateService);
    state.commits.set([
      commit('head-ref', '2026-02-01T00:00:00.000Z'),
      commit('middle-ref', '2026-01-15T00:00:00.000Z'),
      commit('old-ref', '2026-01-01T00:00:00.000Z')
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

  it('loads snapshot diff and selects the first changed file', () => {
    fixture.detectChanges();

    expect(timelineApi.snapshot).toHaveBeenCalled();
    expect(timelineApi.rangeDiff).toHaveBeenCalledWith('old-ref', 'head-ref');
    expect(component.selectedFile()?.file).toBe('src/app.ts');
  });

  it('formats branch, tag, and diff status entries for snapshot cards', () => {
    const snapshot = {
      at: '2026-01-01T00:00:00.000Z',
      ref: 'old-ref',
      branches: { main: 'head-ref' },
      tags: { 'v1.0.0': 'old-ref' }
    };

    expect(component.branchEntries(snapshot)).toEqual([{ name: 'main', hash: 'head-ref' }]);
    expect(component.tagEntries(snapshot)).toEqual([{ name: 'v1.0.0', hash: 'old-ref' }]);
    expect(component.statusLabel('modified')).toBe('mod');
    expect(component.statusLabel('added')).toBe('add');
  });

  function commit(hash: string, date: string): Commit {
    return {
      hash,
      shortHash: hash.slice(0, 7),
      author: 'Ada',
      authorEmail: 'ada@example.com',
      date,
      message: 'test commit',
      subject: 'test commit',
      body: '',
      parents: [],
      branches: [],
      tags: [],
      isMerge: false
    };
  }
});
