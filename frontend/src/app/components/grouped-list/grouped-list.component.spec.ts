import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CommitGroup } from '../../models/git.models';
import { GitService } from '../../services/git.service';
import { UiStateService } from '../../services/ui-state.service';
import { GroupedListComponent } from './grouped-list.component';

describe('GroupedListComponent', () => {
  let fixture: ComponentFixture<GroupedListComponent>;
  let component: GroupedListComponent;
  let state: UiStateService;
  let git: { getGroups: jasmine.Spy };

  beforeEach(async () => {
    git = {
      getGroups: jasmine.createSpy('getGroups').and.returnValue(of(groups())),
    };

    await TestBed.configureTestingModule({
      imports: [GroupedListComponent],
      providers: [{ provide: GitService, useValue: git }],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupedListComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
  });

  it('expands and selects the requested PR deeplink group', () => {
    state.focusedPrNumber.set(42);

    fixture.detectChanges();

    const target = component.groups()?.find((g) => g.prNumber === 42);
    expect(target).toBeDefined();
    expect(component.isExpanded(target!.id)).toBeTrue();
    expect(state.selectedHash()).toBe('c42a');
    expect(state.focusedPrNumber()).toBe(42);
    expect(fixture.nativeElement.querySelector('.commit')?.tagName).toBe('BUTTON');
  });

  it('keeps only the latest filter response', fakeAsync(() => {
    const first = new Subject<CommitGroup[]>();
    const second = new Subject<CommitGroup[]>();
    git.getGroups.calls.reset();
    git.getGroups.and.returnValues(first.asObservable(), second.asObservable());

    state.patchFilters({ author: 'Ada' });
    fixture.detectChanges();
    tick();
    state.patchFilters({ author: 'Grace' });
    fixture.detectChanges();
    tick();

    first.next([group('stale', 7, ['old'])]);
    expect(component.groups()?.some((item) => item.id === 'stale') ?? false).toBeFalse();

    second.next([group('fresh', 8, ['new'])]);
    expect(component.groups()?.map((item) => item.id)).toEqual(['fresh']);
  }));

  it('shows an error and retries the current request', fakeAsync(() => {
    git.getGroups.and.returnValue(throwError(() => new Error('offline')));
    state.patchFilters({ branch: 'main' });
    fixture.detectChanges();
    tick();

    expect(component.error()).toBe('offline');

    git.getGroups.and.returnValue(of([]));
    component.retry();
    fixture.detectChanges();
    tick();

    expect(component.error()).toBeNull();
    expect(component.groups()).toEqual([]);
  }));
});

function groups(): CommitGroup[] {
  return [group('pr-1', 1, ['c1']), group('pr-42', 42, ['c42a', 'c42b'])];
}

function group(id: string, prNumber: number, commits: string[]): CommitGroup {
  return {
    id,
    title: `PR #${prNumber}`,
    prNumber,
    source: 'squash',
    commits,
    filesTouched: 1,
    additions: 1,
    deletions: 0,
    firstDate: '2026-01-01T00:00:00Z',
    lastDate: '2026-01-01T00:00:00Z',
    authors: ['Ada'],
  };
}
