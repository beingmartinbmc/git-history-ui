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

// Mirrors the layout constants in commit-graph.component.ts.
const ROW_H = 34;
const PAD_Y = 16;

describe('CommitGraphComponent edge culling (benchmark)', () => {
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(async () => {
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    await TestBed.configureTestingModule({ imports: [CommitGraphComponent] }).compileComponents();
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  // Linear history, a short merge edge every 10 rows and a long-lived edge every 5,000 rows.
  function syntheticHistory(n: number): Commit[] {
    return Array.from({ length: n }, (_, i) => {
      const parents: string[] = [];
      if (i + 1 < n) parents.push(`h${i + 1}`);
      if (i % 10 === 0 && i + 5 < n) parents.push(`h${i + 5}`);
      if (i % 5000 === 0 && i + 2000 < n) parents.push(`h${i + 2000}`);
      return commit(`h${i}`, { parents, isMerge: parents.length > 1, branches: [] });
    });
  }

  // The pre-index algorithm: scan every child row up to maxRow, keep parents at or below minRow.
  function legacyEdges(commits: Commit[], minRow: number, maxRow: number) {
    const rowOf = new Map(commits.map((c, row) => [c.hash, row] as const));
    const edges: Array<[number, number]> = [];
    let examined = 0;
    for (let i = 0; i <= maxRow; i++) {
      for (const parent of commits[i].parents) {
        examined++;
        const target = rowOf.get(parent);
        if (target === undefined || target < minRow) continue;
        edges.push([i, target]);
      }
    }
    return { edges, examined };
  }

  [50_000, 100_000].forEach((n) => {
    it(`draws only edges that reach the viewport for ${n.toLocaleString()} commits`, async () => {
      const commits = syntheticHistory(n);
      const state = TestBed.inject(UiStateService);
      const fixture = TestBed.createComponent(CommitGraphComponent);
      const component = fixture.componentInstance;
      const scroll = component.scrollRef.nativeElement;
      let scrollTop = 0;
      Object.defineProperty(scroll, 'scrollTop', { configurable: true, get: () => scrollTop });
      Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 600 });
      Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 400 });

      const layoutStart = performance.now();
      state.commits.set(commits);
      fixture.detectChanges();
      const indexMs = performance.now() - layoutStart;
      while ((component as any).nodes.length < n) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const layoutMs = performance.now() - layoutStart;

      scrollTop = Math.floor(n * 0.8) * ROW_H;
      const drawn: Array<[number, number]> = [];
      const drawEdge = spyOn<any>(component, 'drawEdge').and.callFake(
        (_ctx: unknown, _x1: number, y1: number, _x2: number, y2: number) => {
          const row = (y: number) => (y - PAD_Y - ROW_H / 2) / ROW_H;
          drawn.push([row(y1), row(y2)]);
        },
      );
      const drawStart = performance.now();
      (component as any).draw();
      const firstDrawMs = performance.now() - drawStart;

      const buffer = ROW_H * 4;
      const minRow = Math.max(0, Math.floor((scrollTop - PAD_Y - buffer) / ROW_H));
      const maxRow = Math.min(n - 1, Math.ceil((scrollTop + 600 - PAD_Y + buffer) / ROW_H));
      const legacyStart = performance.now();
      const legacy = legacyEdges(commits, minRow, maxRow);
      const legacyMs = performance.now() - legacyStart;
      const totalEdges = commits.reduce((sum, c) => sum + c.parents.length, 0);

      // Each edge is stroked twice (shadow, then colour): collapse the pairs.
      const paired = drawn.filter((_, i) => i % 2 === 0);
      expect(drawEdge.calls.count()).toBe(legacy.edges.length * 2);
      expect(paired).toEqual(legacy.edges);
      expect(component.lastEdgesVisited).toBeGreaterThanOrEqual(legacy.edges.length);
      expect(component.lastEdgesVisited).toBeLessThan(totalEdges / 20);
      expect(component.lastEdgesVisited).toBeLessThan(legacy.examined / 20);

      console.log(
        `[commit-graph bench] n=${n} edges=${totalEdges} drawn=${legacy.edges.length} ` +
          `visited=${component.lastEdgesVisited} legacyExamined=${legacy.examined} | ` +
          `index+start=${indexMs.toFixed(1)}ms fullLayout=${layoutMs.toFixed(0)}ms ` +
          `deepDraw=${firstDrawMs.toFixed(2)}ms legacyScanOnly=${legacyMs.toFixed(2)}ms`,
      );
    }, 120_000);
  });
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
