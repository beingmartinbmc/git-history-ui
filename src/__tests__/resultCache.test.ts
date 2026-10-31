import { ResultCache } from '../backend/cache/resultCache';

describe('ResultCache', () => {
  it('returns undefined for missing keys', () => {
    const cache = new ResultCache<string>();
    expect(cache.get('x')).toBeUndefined();
  });

  it('stores and retrieves a value within TTL', () => {
    const cache = new ResultCache<number>(10_000);
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('expires entries after TTL', () => {
    const cache = new ResultCache<number>(1); // 1ms TTL
    cache.set('a', 1);
    // Spin until expired
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* wait */
    }
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts oldest entry when max size exceeded', () => {
    const cache = new ResultCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('clear() removes all entries', () => {
    const cache = new ResultCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('key() produces deterministic keys regardless of param order', () => {
    const k1 = ResultCache.key({ b: 'two', a: 'one' });
    const k2 = ResultCache.key({ a: 'one', b: 'two' });
    expect(k1).toBe(k2);
  });

  it('key() excludes null/undefined/empty values', () => {
    const k = ResultCache.key({ a: 'one', b: undefined, c: null, d: '' });
    expect(k).toBe('a=one');
  });
});

describe('ResultCache.getOrCompute', () => {
  it('shares one in-flight computation per key', async () => {
    const cache = new ResultCache<number>();
    let calls = 0;
    const compute = async () => ++calls;
    const [a, b] = await Promise.all([
      cache.getOrCompute('k', compute),
      cache.getOrCompute('k', compute)
    ]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
  });

  it('does not cache a result computed before clear()', async () => {
    const cache = new ResultCache<string>();
    let release!: () => void;
    const slow = cache.getOrCompute('k', () => new Promise((r) => (release = () => r('stale'))));
    cache.clear();
    release();
    await expect(slow).resolves.toBe('stale');
    expect(cache.get('k')).toBeUndefined();
  });
});
