import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeService } from '../../services/theme.service';
import { ChurnChartComponent } from './churn-chart.component';

describe('ChurnChartComponent', () => {
  let fixture: ComponentFixture<ChurnChartComponent>;
  let component: ChurnChartComponent;
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
      imports: [ChurnChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChurnChartComponent);
    component = fixture.componentInstance;
    component.data = [
      { date: '2026-01-01', commits: 2, additions: 10, deletions: 3 },
      { date: '2026-01-02', commits: 1, additions: 4, deletions: 2 },
    ];
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('exposes a bounded table summary and keeps the SVG decorative', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain(
      '3 commits, 14 additions, 5 deletions',
    );
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('redraws for resize and theme changes and disconnects on destroy', () => {
    const render = spyOn<any>(component, 'render').and.callThrough();
    fixture.detectChanges();
    render.calls.reset();

    resizeCallback([], {} as ResizeObserver);
    expect(render).toHaveBeenCalled();

    render.calls.reset();
    TestBed.inject(ThemeService).cycle();
    fixture.detectChanges();
    expect(render).toHaveBeenCalled();

    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });
});
