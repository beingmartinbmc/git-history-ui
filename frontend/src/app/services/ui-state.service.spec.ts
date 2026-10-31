import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { UiStateService } from './ui-state.service';

describe('UiStateService.hydrateQuery', () => {
  let state: UiStateService;

  beforeEach(() => {
    state = TestBed.inject(UiStateService);
  });

  it('keeps the mobile detail closed when the URL echoes the current selection', () => {
    state.selectedHash.set('abc1234');
    state.mobileDetailOpen.set(false);

    expect(state.hydrateQuery(convertToParamMap({ commit: 'abc1234' }))).toBe('abc1234');

    expect(state.selectedHash()).toBe('abc1234');
    expect(state.mobileDetailOpen()).toBeFalse();
  });

  it('opens the detail for a different commit and closes it when cleared', () => {
    state.hydrateQuery(convertToParamMap({ commit: 'abc1234' }));
    expect(state.mobileDetailOpen()).toBeTrue();

    state.hydrateQuery(convertToParamMap({}));
    expect(state.selectedHash()).toBeNull();
    expect(state.mobileDetailOpen()).toBeFalse();
  });
});
