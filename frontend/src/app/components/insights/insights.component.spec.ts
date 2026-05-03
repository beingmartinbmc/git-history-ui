import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { InsightsComponent } from './insights.component';
import { InsightsBundle } from '../../models/git.models';

describe('InsightsComponent', () => {
  let fixture: ComponentFixture<InsightsComponent>;
  let component: InsightsComponent;
  let http: HttpTestingController;
  let router: { navigate: jasmine.Spy };

  beforeEach(async () => {
    router = { navigate: jasmine.createSpy('navigate') };

    await TestBed.configureTestingModule({
      imports: [InsightsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads and renders KPI cards for the insights bundle', () => {
    fixture.detectChanges();
    http.expectOne('/api/insights?maxCommits=500').flush(bundleFixture());
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Commits analyzed');
    expect(text).toContain('42');
    expect(text).toContain('Contributors');
    expect(text).toContain('Ada');
    expect(component.topContributor(component.bundle()!)).toBe('Ada');
  });

  it('navigates summary widgets to the top hotspot and risk file', () => {
    const bundle = bundleFixture();

    component.openTopHotspot(bundle);
    component.openTopRisk(bundle);

    expect(router.navigate).toHaveBeenCalledWith(['/file', encodeURIComponent('src/hot.ts')]);
    expect(router.navigate).toHaveBeenCalledWith(['/file', encodeURIComponent('src/risky.ts')]);
  });

  it('shows a stable contributor fallback when contributor data is empty', () => {
    const bundle = bundleFixture({ topContributors: [] });

    expect(component.topContributor(bundle)).toBe('No author data');
  });

  it('renders contributor ownership, hotspot help, and risk explanations', () => {
    fixture.detectChanges();
    http.expectOne('/api/insights?maxCommits=500').flush(bundleFixture());
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ownership');
    expect(text).toContain('active Jan 1 - Jan 20, 2026');
    expect(text).toContain('Size = commit frequency');
    expect(text).toContain('Review priority');
    expect(text).toContain('Low');
    expect(text).toContain('Medium');
    expect(text).toContain('High');
  });

  it('formats contributor initials, avatar colors, and risk meters', () => {
    expect(component.initials('Ada Lovelace')).toBe('AL');
    expect(component.initials('Ada')).toBe('AD');
    expect(component.avatarColor(7)).toBe('#06b6d4');
    expect(component.riskPct(0.005)).toBe(4);
    expect(component.riskPct(2)).toBe(100);
    expect(component.riskScore(0.91)).toBe('91');
    expect(component.riskLevel(0.2)).toBe('low');
    expect(component.riskLevel(0.5)).toBe('medium');
    expect(component.riskLevel(0.9)).toBe('high');
  });

  function bundleFixture(overrides: Partial<InsightsBundle> = {}): InsightsBundle {
    return {
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-01-31T00:00:00.000Z',
      totalCommits: 42,
      totalAuthors: 3,
      topContributors: [
        {
          author: 'Ada',
          email: 'ada@example.com',
          commits: 20,
          firstCommit: '2026-01-01T00:00:00.000Z',
          lastCommit: '2026-01-20T00:00:00.000Z',
        },
      ],
      hotspots: [
        {
          file: 'src/hot.ts',
          commits: 12,
          additions: 100,
          deletions: 40,
          lastTouched: '2026-01-20T00:00:00.000Z',
          authors: 2,
        },
      ],
      churnByDay: [
        { date: '2026-01-01', commits: 3, additions: 20, deletions: 4 },
        { date: '2026-01-02', commits: 5, additions: 50, deletions: 10 },
      ],
      riskyFiles: [
        {
          file: 'src/risky.ts',
          riskScore: 0.91,
          reason: 'High churn and multiple authors',
          commits: 10,
          authors: 3,
          churn: 140,
        },
      ],
      ...overrides,
    };
  }
});
