import { Observable } from 'rxjs';
import { ObservableCache } from './observable-cache';

describe('ObservableCache', () => {
  it('deduplicates concurrent subscribers and cancels after the final unsubscribe', () => {
    const cache = new ObservableCache();
    let subscriptions = 0;
    let unsubscriptions = 0;
    const source = new Observable<number>(() => {
      subscriptions++;
      return () => unsubscriptions++;
    });
    const cached = cache.get('request', () => source, 1_000);

    const first = cached.subscribe();
    const second = cached.subscribe();
    expect(subscriptions).toBe(1);

    first.unsubscribe();
    expect(unsubscriptions).toBe(0);

    second.unsubscribe();
    expect(unsubscriptions).toBe(1);
  });
});
