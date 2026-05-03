import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommitListComponent } from './commit-list.component';
import { Commit } from '../../models/git.models';
import { UiStateService } from '../../services/ui-state.service';

describe('CommitListComponent', () => {
  let fixture: ComponentFixture<CommitListComponent>;
  let component: CommitListComponent;
  let state: UiStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommitListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CommitListComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(UiStateService);
  });

  it('joins branch and tag refs for the hover card', () => {
    const c = commit('abc1234', {
      tags: ['v1.0.0'],
      branches: ['main', 'origin/main'],
    });

    expect(component.refsFor(c)).toBe('v1.0.0, main, origin/main');
  });

  it('selects commits and keeps keyboard navigation bounded', () => {
    const commits = [commit('a111111'), commit('b222222')];
    state.commits.set(commits);

    component.select(commits[0]);
    expect(state.selectedHash()).toBe('a111111');

    component.onKey(new KeyboardEvent('keydown', { key: 'j' }));
    expect(state.selectedHash()).toBe('b222222');

    component.onKey(new KeyboardEvent('keydown', { key: 'j' }));
    expect(state.selectedHash()).toBe('b222222');

    component.onKey(new KeyboardEvent('keydown', { key: 'k' }));
    expect(state.selectedHash()).toBe('a111111');
  });

  it('computes stable lane colors from branches or parents', () => {
    const c = commit('abc1234', { branches: ['feature/a'], parents: ['parent'] });

    expect(component.laneColor(c)).toBe(component.laneColor(c));
    expect(component.trackByHash(0, c)).toBe('abc1234');
  });

  function commit(hash: string, overrides: Partial<Commit> = {}): Commit {
    return {
      hash,
      shortHash: hash.slice(0, 7),
      author: 'Ada',
      authorEmail: 'ada@example.com',
      date: '2026-01-01T00:00:00.000Z',
      message: 'subject',
      subject: 'subject',
      body: '',
      parents: [],
      branches: [],
      tags: [],
      isMerge: false,
      ...overrides,
    };
  }
});
