import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WrappedStats } from '../../models/git.models';
import { WrappedCardRenderer } from '../../services/wrapped-card-renderer';
import { WrappedComponent } from './wrapped.component';

describe('WrappedComponent', () => {
  let fixture: ComponentFixture<WrappedComponent>;
  let component: WrappedComponent;
  let http: HttpTestingController;
  let renderer: { toDataUrl: jasmine.Spy; toBlob: jasmine.Spy };

  beforeEach(async () => {
    renderer = {
      toDataUrl: jasmine.createSpy('toDataUrl').and.returnValue('data:image/png;base64,AAAA'),
      toBlob: jasmine.createSpy('toBlob').and.resolveTo(new Blob(['x'], { type: 'image/png' })),
    };

    await TestBed.configureTestingModule({
      imports: [WrappedComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WrappedCardRenderer, useValue: renderer },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WrappedComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function flushWrapped(overrides: Partial<WrappedStats> = {}): void {
    const year = new Date().getFullYear();
    const req = http.expectOne(`/api/wrapped?year=${year}`);
    req.flush(statsFixture(overrides));
  }

  it('loads stats and renders a preview image', () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();

    expect(component.stats()?.totalCommits).toBe(420);
    expect(renderer.toDataUrl).toHaveBeenCalled();
    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('.preview-wrap img');
    expect(img?.getAttribute('src')).toContain('data:image/png');
  });

  it('surfaces a friendly error when the request fails', () => {
    fixture.detectChanges();
    const year = new Date().getFullYear();
    http
      .expectOne(`/api/wrapped?year=${year}`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.error()).toBe('boom');
  });

  it('renders a blob and triggers a download', async () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();

    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(URL, 'revokeObjectURL');

    await component.download();

    expect(renderer.toBlob).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(component.status()).toBe('Saved your card.');
  });

  function statsFixture(overrides: Partial<WrappedStats> = {}): WrappedStats {
    return {
      label: String(new Date().getFullYear()),
      windowStart: '2026-01-01',
      windowEnd: '2026-12-31',
      totalCommits: 420,
      totalAuthors: 7,
      totalAdditions: 12000,
      totalDeletions: 4000,
      totalFilesTouched: 250,
      nightOwlPercent: 18.5,
      weekendWarriorPercent: 12,
      topContributors: [
        { author: 'Ada', email: 'ada@x.io', commits: 200, additions: 8000, deletions: 2000 },
        { author: 'Linus', email: 'l@x.io', commits: 120, additions: 3000, deletions: 1500 },
      ],
      topFiles: [{ file: 'src/main.ts', commits: 40, churn: 900 }],
      topWords: [{ word: 'refactor', count: 30 }],
      superlatives: {
        biggestCommit: {
          hash: 'abc',
          shortHash: 'abc1234',
          subject: 'big change',
          author: 'Ada',
          churn: 1200,
        },
        busiestDay: { date: '2026-03-01', commits: 12 },
        busiestHour: { hour: 23, commits: 40 },
        longestStreakDays: 9,
      },
      ...overrides,
    };
  }
});
