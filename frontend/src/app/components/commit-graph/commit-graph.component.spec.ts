import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Commit } from '../../models/git.models';
import { ThemeService } from '../../services/theme.service';
import { UiStateService } from '../../services/ui-state.service';
import { CommitGraphComponent } from './commit-graph.component';

describe('CommitGraphComponent', () => {
  let fixture: ComponentFixture<CommitGraphComponent>;
  let component: CommitGraphComponent;
  let state: UiStateService;
  let resizeCallback: ResizeObserverCallback;
  let disconnect: jasmine.Spy;
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(async () => {
    originalResizeObserver = window.ResizeObserver;
    disconnect = jasmine.createSpy('disconnect');
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnect();
      }
    } as typeof ResizeObserver;

    await TestBed.configureTestingModule({
      imports: [CommitGraphComponent],
    }).compileComponents();

    state = TestBed.inject(UiStateService);
    state.commits.set([commit()]);
    fixture = TestBed.createComponent(CommitGraphComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('provides a bounded selectable fallback and hides its canvas from assistive tech', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas').getAttribute('aria-hidden')).toBe('true');
    const fallback = fixture.nativeElement.querySelector('.accessible-data button');
    expect(fallback.textContent).toContain('A commit');
    fallback.click();
    expect(state.selectedHash()).toBe('a111111');
  });

  it('redraws for resize and theme changes and disconnects on destroy', () => {
    const draw = spyOn<any>(component, 'draw').and.callThrough();
    fixture.detectChanges();
    draw.calls.reset();

    resizeCallback([], {} as ResizeObserver);
    expect(draw).toHaveBeenCalled();

    draw.calls.reset();
    TestBed.inject(ThemeService).cycle();
    fixture.detectChanges();
    expect(draw).toHaveBeenCalled();

    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not rebuild layout when a multi-lane layout updates its lane count', fakeAsync(() => {
    state.commits.set([
      commit('merge111', { parents: ['left111', 'right11'], isMerge: true }),
      commit('left111'),
      commit('right11'),
    ]);
    const scheduleLayout = spyOn<any>(component, 'scheduleLayout').and.callThrough();

    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    tick();

    expect(component.graphSummary()).toContain('2 lanes');
    expect(scheduleLayout).toHaveBeenCalledTimes(1);
  }));
});

function commit(hash = 'a111111', overrides: Partial<Commit> = {}): Commit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: 'Ada',
    authorEmail: 'ada@example.com',
    date: '2026-01-01T00:00:00Z',
    message: 'A commit',
    subject: 'A commit',
    body: '',
    parents: [],
    branches: ['main'],
    tags: [],
    isMerge: false,
    ...overrides,
  };
}
