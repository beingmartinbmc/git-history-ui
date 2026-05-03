import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

interface CacheEntry<T> {
  value: Observable<T>;
  expiresAt: number;
}

/**
 * Bounded TTL+LRU observable cache. Entries are deduplicated via
 * `shareReplay({ bufferSize: 1, refCount: false })` so concurrent callers
 * share the in-flight request. Expired entries are recreated on next access.
 *
 * Two knobs per call:
 *   - `ttlMs`: how long the cached value is considered fresh.
 *     Defaults are intentionally per-resource (commit/diff/blame are
 *     content-addressed so live "forever"; lists like /commits, /branches
 *     can drift, so they get short TTLs).
 *   - `maxEntries`: cap on the cache size (FIFO eviction).
 */
export class ObservableCache {
  private map = new Map<string, CacheEntry<unknown>>();

  constructor(private maxEntries = 200) {}

  get<T>(key: string, create: () => Observable<T>, ttlMs: number): Observable<T> {
    const now = Date.now();
    const hit = this.map.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expiresAt > now) return hit.value;
    if (hit) this.map.delete(key);
    const value = create().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.map.set(key, { value, expiresAt: now + ttlMs });
    if (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    return value;
  }

  invalidate(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Standard TTLs used across services. "Immutable" data is keyed by an
 * identifier that uniquely fingerprints the response (e.g. a commit hash
 * or a `from..to` range), so it can live for a long time. "Volatile"
 * data describes lists and aggregations that change as the repo evolves.
 */
export const TTL = {
  IMMUTABLE: 30 * 60_000,
  VOLATILE: 60_000,
  SHORT: 15_000,
} as const;
