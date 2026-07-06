import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CommitGroup } from '../../models/git.models';
import { GroupsService } from '../../services/groups.service';
import { UiStateService } from '../../services/ui-state.service';
import { GroupedListComponent } from './grouped-list.component';

describe('GroupedListComponent', () => {
  let fixture: ComponentFixture<GroupedListComponent>;
  let component: GroupedListComponent;
  let state: UiStateService;
  let groupsApi: { list: jasmine.Spy };

  beforeEach(async () => {
    groupsApi = {
      list: jasmine.createSpy('list').and.returnValue(of(groups())),
    };

    await TestBed.configureTestingModule({
      imports: [GroupedListComponent],
      providers: [{ provide: GroupsService, useValue: groupsApi }],
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
  });
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
