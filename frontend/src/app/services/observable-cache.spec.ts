import { Observable, of } from 'rxjs';
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

  it('evicts the least recently used entry, not the oldest inserted', () => {
    const cache = new ObservableCache(2);
    let creates = 0;
    const make = () => {
      creates++;
      return of(creates);
    };
    cache.get('a', make, 1_000);
    cache.get('b', make, 1_000);
    cache.get('a', make, 1_000); // touch a
    cache.get('c', make, 1_000); // evicts b
    expect(creates).toBe(3);

    cache.get('a', make, 1_000);
    expect(creates).toBe(3);
    cache.get('b', make, 1_000);
    expect(creates).toBe(4);
  });
});
