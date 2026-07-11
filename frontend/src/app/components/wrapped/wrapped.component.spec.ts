import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { WrappedStats } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { WrappedCardRenderer } from '../../services/wrapped-card-renderer';
import {
  WrappedComponent,
  sanitizeFileNamePart,
  wrappedCaption,
  wrappedSocialUrl,
} from './wrapped.component';

describe('WrappedComponent', () => {
  let fixture: ComponentFixture<WrappedComponent>;
  let component: WrappedComponent;
  let http: HttpTestingController;
  let renderer: { toDataUrl: jasmine.Spy; toBlob: jasmine.Spy };
  let git: {
    getRepository: jasmine.Spy;
    getAuthorIdentities: jasmine.Spy;
  };
  let routeSnapshot: { queryParamMap: ReturnType<typeof convertToParamMap> };

  beforeEach(async () => {
    renderer = {
      toDataUrl: jasmine.createSpy('toDataUrl').and.returnValue('data:image/png;base64,AAAA'),
      toBlob: jasmine.createSpy('toBlob').and.resolveTo(new Blob(['x'], { type: 'image/png' })),
    };
    git = {
      getRepository: jasmine.createSpy('getRepository').and.returnValue(
        of({
          name: 'widgets/core',
          remoteUrl: null,
          webUrl: null,
          currentBranch: 'main',
          defaultBranch: 'main',
          currentAuthor: { name: 'Ada', email: 'ada@x.io' },
        }),
      ),
      getAuthorIdentities: jasmine.createSpy('getAuthorIdentities').and.returnValue(
        of([
          { name: 'Ada', email: 'ada@x.io' },
          { name: 'Linus', email: 'l@x.io' },
        ]),
      ),
    };
    routeSnapshot = { queryParamMap: convertToParamMap({}) };

    await TestBed.configureTestingModule({
      imports: [WrappedComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WrappedCardRenderer, useValue: renderer },
        { provide: GitService, useValue: git },
        { provide: ActivatedRoute, useValue: { snapshot: routeSnapshot } },
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
    const req = http.expectOne(`/api/wrapped?year=${year}&author=ada@x.io`);
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

  it('populates the author dropdown from the git service', () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();

    expect(git.getAuthorIdentities).toHaveBeenCalled();
    expect(component.authors()).toEqual([
      { name: 'Ada', email: 'ada@x.io' },
      { name: 'Linus', email: 'l@x.io' },
    ]);
    const options: HTMLOptionElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.controls select'),
    )
      .flatMap((sel) => Array.from((sel as HTMLSelectElement).options))
      .filter((o) => o.value === 'ada@x.io' || o.value === 'l@x.io');
    expect(options.length).toBe(2);
  });

  it('reloads stats with an author filter when the dropdown changes', () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();

    component.setAuthor('l@x.io');
    const year = new Date().getFullYear();
    const req = http.expectOne(`/api/wrapped?year=${year}&author=l@x.io`);
    req.flush(statsFixture());

    expect(component.author()).toBe('l@x.io');
  });

  it('restores wrapped year, author, template, and palette from a portable link', () => {
    const initial = http.expectOne(`/api/wrapped?year=${new Date().getFullYear()}&author=ada@x.io`);
    fixture.destroy();
    expect(initial.cancelled).toBeTrue();
    routeSnapshot.queryParamMap = convertToParamMap({
      year: '2025',
      author: 'ada@x.io',
      template: 'minimal',
      palette: 'sunset',
    });

    fixture = TestBed.createComponent(WrappedComponent);
    component = fixture.componentInstance;
    expect(component.year()).toBe(2025);
    expect(component.author()).toBe('ada@x.io');
    expect(component.template()).toBe('minimal');
    expect(component.paletteId()).toBe('sunset');
    http.expectOne('/api/wrapped?year=2025&author=ada@x.io').flush(statsFixture());
  });

  it('re-renders the preview with the chosen template and palette (no refetch)', () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();
    renderer.toDataUrl.calls.reset();

    component.setTemplate('minimal');
    component.setPalette('sunset');

    expect(component.template()).toBe('minimal');
    expect(component.paletteId()).toBe('sunset');
    // Selecting a style must not re-hit the API…
    http.expectNone(() => true);
    // …but must re-render the card with the new options.
    const lastArgs = renderer.toDataUrl.calls.mostRecent().args;
    expect(lastArgs[2]).toEqual({ template: 'minimal', paletteId: 'sunset' });
  });

  it('passes the selected template and palette through to the exported blob', async () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();

    component.setTemplate('bold');
    component.setPalette('forest');

    spyOn(HTMLAnchorElement.prototype, 'click');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(URL, 'revokeObjectURL');

    await component.download();

    const blobArgs = renderer.toBlob.calls.mostRecent().args;
    expect(blobArgs[2]).toEqual({ template: 'bold', paletteId: 'forest' });
  });

  it('ignores the previous request when the year changes again before it resolves', () => {
    fixture.detectChanges();
    const year = new Date().getFullYear();
    const firstReq = http.expectOne(`/api/wrapped?year=${year}&author=ada@x.io`);

    component.setYear(year - 1);
    const secondReq = http.expectOne(`/api/wrapped?year=${year - 1}&author=ada@x.io`);

    expect(firstReq.cancelled).toBeTrue();
    expect(component.stats()).toBeNull();

    secondReq.flush(statsFixture({ totalCommits: 999 }));
    fixture.detectChanges();

    expect(component.stats()?.totalCommits).toBe(999);
  });

  it('unsubscribes the pending request when destroyed', () => {
    fixture.detectChanges();
    const year = new Date().getFullYear();
    const req = http.expectOne(`/api/wrapped?year=${year}&author=ada@x.io`);

    fixture.destroy();

    expect(req.cancelled).toBeTrue();
    expect(component.stats()).toBeNull();
  });

  it('surfaces a friendly error and retries', () => {
    fixture.detectChanges();
    const year = new Date().getFullYear();
    http
      .expectOne(`/api/wrapped?year=${year}&author=ada@x.io`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.error()).toBe('boom');

    component.retry();
    http.expectOne(`/api/wrapped?year=${year}&author=ada@x.io`).flush(statsFixture());
    fixture.detectChanges();

    expect(component.error()).toBeNull();
    expect(component.stats()?.totalCommits).toBe(420);
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

  it('uses repository identity for the preview and sanitized download filename', async () => {
    fixture.detectChanges();
    flushWrapped();
    fixture.detectChanges();
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(URL, 'revokeObjectURL');

    await component.download();

    expect(renderer.toDataUrl).toHaveBeenCalledWith(
      jasmine.anything(),
      'widgets/core',
      jasmine.anything(),
    );
    const anchor = clickSpy.calls.mostRecent().object as HTMLAnchorElement;
    expect(anchor.download).toContain('widgets-core');
  });

  it('defaults to all contributors when repository author identity is missing', () => {
    const pending = http.expectOne(`/api/wrapped?year=${new Date().getFullYear()}&author=ada@x.io`);
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
    git.getRepository.and.returnValue(
      of({
        name: 'local',
        remoteUrl: null,
        webUrl: null,
        currentBranch: null,
        defaultBranch: null,
        currentAuthor: { name: null, email: null },
      }),
    );

    fixture = TestBed.createComponent(WrappedComponent);
    component = fixture.componentInstance;
    expect(component.author()).toBe('');
    http.expectOne(`/api/wrapped?year=${new Date().getFullYear()}`).flush(statsFixture());
  });

  it('distinguishes contributors with the same name by exact email', () => {
    const pending = http.expectOne(`/api/wrapped?year=${new Date().getFullYear()}&author=ada@x.io`);
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
    git.getAuthorIdentities.and.returnValue(
      of([
        { name: 'Alex', email: 'alex@one.test' },
        { name: 'Alex', email: 'alex@two.test' },
      ]),
    );

    fixture = TestBed.createComponent(WrappedComponent);
    component = fixture.componentInstance;
    const req = http.expectOne(`/api/wrapped?year=${new Date().getFullYear()}&author=ada@x.io`);
    req.flush(statsFixture());
    fixture.detectChanges();
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.controls select')[1].options,
      (option: HTMLOptionElement) => option.text.trim(),
    );
    expect(labels).toContain('Alex <alex@one.test>');
    expect(labels).toContain('Alex <alex@two.test>');
  });

  it('builds bounded encoded social captions', () => {
    fixture.detectChanges();
    flushWrapped();
    const caption = wrappedCaption(statsFixture({ totalCommits: 999 }), 'widgets', 280);
    expect(caption).toContain('widgets');
    expect(caption).toContain('#GitWrapped');
    expect(caption.length).toBeLessThanOrEqual(280);
    expect(wrappedSocialUrl('bluesky', caption)).toContain(encodeURIComponent(caption));
    expect(sanitizeFileNamePart('widgets/core "beta"')).toBe('widgets-core-beta');
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
