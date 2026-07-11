import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HotspotsTreemapComponent } from './hotspots-treemap.component';
import { ThemeService } from '../../services/theme.service';

describe('HotspotsTreemapComponent', () => {
  let fixture: ComponentFixture<HotspotsTreemapComponent>;
  let component: HotspotsTreemapComponent;
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
      imports: [HotspotsTreemapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HotspotsTreemapComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('renders a churn legend and emits the clicked file', () => {
    component.data = [
      {
        file: 'src/hot.ts',
        commits: 10,
        additions: 100,
        deletions: 40,
        authors: 2,
      },
      {
        file: 'src/cold.ts',
        commits: 2,
        additions: 4,
        deletions: 1,
        authors: 1,
      },
    ];
    spyOn(component.fileClick, 'emit');

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('lower churn');
    expect(text).toContain('higher churn');
    const title = fixture.nativeElement.querySelector('title')?.textContent ?? '';
    expect(title).toContain('Changed in');

    fixture.nativeElement.querySelector('g.cell')?.dispatchEvent(new MouseEvent('click'));
    expect(component.fileClick.emit).toHaveBeenCalledWith('src/hot.ts');
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.accessible-data button').length).toBe(2);
  });

  it('shows an empty state with no hotspot data', () => {
    component.data = [];

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain('No hotspots');
  });

  it('redraws on host resize and disconnects its observer', () => {
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
