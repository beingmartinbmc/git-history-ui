import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';
import { CommitListComponent } from '../commit-list/commit-list.component';
import { HomeShellComponent } from './home-shell.component';

@Component({ selector: 'app-commit-graph', standalone: true, template: '' })
class StubGraphComponent {}

@Component({ selector: 'app-commit-detail', standalone: true, template: 'Commit detail' })
class StubDetailComponent {}

@Component({ selector: 'app-grouped-list', standalone: true, template: '' })
class StubGroupedComponent {}

describe('HomeShellComponent mobile navigation', () => {
  let fixture: ComponentFixture<HomeShellComponent>;
  let state: UiStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeShellComponent],
    })
      .overrideComponent(HomeShellComponent, {
        set: {
          imports: [
            CommonModule,
            CommitListComponent,
            StubGraphComponent,
            StubDetailComponent,
            StubGroupedComponent,
          ],
        },
      })
      .compileComponents();

    state = TestBed.inject(UiStateService);
    state.commits.set([commit('a111111'), commit('b222222')]);
    state.total.set(2);
    state.selectedHash.set('a111111');
    fixture = TestBed.createComponent(HomeShellComponent);
    fixture.detectChanges();
  });

  it('starts on the list, opens details, and restores selected-row focus on Back', fakeAsync(() => {
    const listPane = fixture.nativeElement.querySelector('.pane.list') as HTMLElement;
    const detailPane = fixture.nativeElement.querySelector('.pane.detail') as HTMLElement;
    expect(listPane.classList.contains('mobile-detail-open')).toBeFalse();
    expect(detailPane.classList.contains('mobile-detail-open')).toBeFalse();

    const commitList = fixture.debugElement.query(By.directive(CommitListComponent))
      .componentInstance as CommitListComponent;
    const focusSelected = spyOn(commitList, 'focusSelected');
    commitList.select(state.commits()[1]);
    fixture.detectChanges();

    expect(state.mobileDetailOpen()).toBeTrue();
    expect(detailPane.classList.contains('mobile-detail-open')).toBeTrue();

    (fixture.nativeElement.querySelector('.mobile-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    flushMicrotasks();

    expect(state.mobileDetailOpen()).toBeFalse();
    expect(focusSelected).toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(CommitListComponent)).componentInstance).toBe(
      commitList,
    );
  }));

  it('shows detail immediately for a hydrated commit deep link', () => {
    state.hydrateQuery(
      new MapParamMap({
        commit: 'b222222',
      }),
    );
    fixture.detectChanges();

    expect(state.mobileDetailOpen()).toBeTrue();
    expect(
      (fixture.nativeElement.querySelector('.pane.detail') as HTMLElement).classList.contains(
        'mobile-detail-open',
      ),
    ).toBeTrue();
  });
});

class MapParamMap {
  readonly keys: string[];

  constructor(private values: Record<string, string>) {
    this.keys = Object.keys(values);
  }

  has(name: string): boolean {
    return name in this.values;
  }

  get(name: string): string | null {
    return this.values[name] ?? null;
  }

  getAll(name: string): string[] {
    const value = this.get(name);
    return value === null ? [] : [value];
  }
}

function commit(hash: string): Commit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: 'Ada',
    authorEmail: 'ada@example.com',
    date: '2026-01-01T00:00:00.000Z',
    message: hash,
    subject: hash,
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
  };
}
