/**
 * Generic TTL-based result cache keyed by a string hash of the request params.
 * Used to avoid recomputing insights/groups/wrapped on repeated requests
 * (e.g. user flipping between tabs).
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15_000;
const DEFAULT_MAX_ENTRIES = 20;

export class ResultCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxEntries: number;
  private inflight = new Map<string, Promise<T>>();
  // Bumped by clear() so a computation that started before it can't cache stale data.
  private generation = 0;

  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.ttl = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.generation++;
  }

  /** Cached value, else the in-flight computation for `key`, else start one. */
  getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const p: Promise<T> = compute()
      .then((value) => {
        if (generation === this.generation) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === p) this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttl });
  }

  /** Build a cache key from a flat object of filter params. */
  static key(params: Record<string, string | number | boolean | undefined | null>): string {
    return Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }
}
