import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HotspotsTreemapComponent } from './hotspots-treemap.component';

describe('HotspotsTreemapComponent', () => {
  let fixture: ComponentFixture<HotspotsTreemapComponent>;
  let component: HotspotsTreemapComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HotspotsTreemapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HotspotsTreemapComponent);
    component = fixture.componentInstance;
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
  });

  it('shows an empty state with no hotspot data', () => {
    component.data = [];

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain('No hotspots');
  });
});
