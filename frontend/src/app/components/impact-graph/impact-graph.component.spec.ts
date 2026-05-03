import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImpactGraphComponent } from './impact-graph.component';
import { CommitImpact } from '../../models/git.models';

describe('ImpactGraphComponent', () => {
  let fixture: ComponentFixture<ImpactGraphComponent>;
  let component: ImpactGraphComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImpactGraphComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ImpactGraphComponent);
    component = fixture.componentInstance;
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
