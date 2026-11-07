import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImpactGraphComponent } from './impact-graph.component';
import { CommitImpact } from '../../models/git.models';
import { ThemeService } from '../../services/theme.service';

describe('ImpactGraphComponent', () => {
  let fixture: ComponentFixture<ImpactGraphComponent>;
  let component: ImpactGraphComponent;
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
      imports: [ImpactGraphComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ImpactGraphComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('renders the layered columns with full file labels and visible connection paths', () => {
    component.impact = impactFixture();

    fixture.detectChanges();

    const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg');
    const text = svg.textContent ?? '';
    expect(text).toContain('Modules');
    expect(text).toContain('Changed files');
    expect(text).toContain('Import dependencies');
    expect(text).toContain('KafkaRetryConfig.java');
    expect(text).toContain('VoiceMessageKafkaListener.java');
    expect(text).not.toContain('KafkaRetryConfig...');
    expect(svg.querySelectorAll('path.impact-link.imports').length).toBe(1);
    expect(svg.querySelectorAll('path.impact-link.in-module').length).toBe(1);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThanOrEqual(1120);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.textContent as string).toContain('1 changed files');
  });

  it('shows an empty state when no impact graph data exists', () => {
    component.impact = {
      hash: 'h',
      files: [],
      modules: [],
      dependencyRipple: [],
      relatedCommits: [],
    };

    fixture.detectChanges();

    expect(component.hasData).toBeFalse();
    expect(fixture.nativeElement.textContent as string).toContain('No graph data');
  });

  it('lists files that import the change under a "could break" heading', () => {
    component.impact = {
      ...impactFixture(),
      dependents: [{ from: 'src/Caller.java', to: 'src/main/java/KafkaRetryConfig.java' }],
    };

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Could break: files that import this change');
    expect(text).toContain('src/Caller.java → src/main/java/KafkaRetryConfig.java');
    expect(text).toContain('1 dependents');
  });

  it('hides the "could break" section when dependents are empty or absent (older servers)', () => {
    const shown = (): boolean =>
      (fixture.nativeElement.textContent as string).includes('Could break');
    const dependents = [{ from: 'src/Caller.java', to: 'src/main/java/KafkaRetryConfig.java' }];

    // setInput (not direct assignment) so the OnPush view re-renders between steps.
    fixture.componentRef.setInput('impact', { ...impactFixture(), dependents });
    fixture.detectChanges();
    expect(shown()).toBeTrue();

    fixture.componentRef.setInput('impact', { ...impactFixture(), dependents: [] });
    fixture.detectChanges();
    expect(shown()).toBeFalse();

    fixture.componentRef.setInput('impact', { ...impactFixture(), dependents });
    fixture.detectChanges();
    fixture.componentRef.setInput('impact', impactFixture());
    fixture.detectChanges();
    expect(shown()).toBeFalse();
  });

  it('redraws on host resize and disconnects its observer', () => {
    const render = spyOn<any>(component, 'render').and.callThrough();
    component.impact = impactFixture();
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

  function impactFixture(): CommitImpact {
    return {
      hash: 'h',
      files: ['src/main/java/KafkaRetryConfig.java'],
      modules: ['src/main/java'],
      dependencyRipple: [
        {
          from: 'src/main/java/KafkaRetryConfig.java',
          to: 'src/main/java/VoiceMessageKafkaListener.java',
        },
      ],
      relatedCommits: [],
    };
  }
});
