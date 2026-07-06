import { GitProcessQueue } from '../backend/gitProcessQueue';

describe('GitProcessQueue', () => {
  it('runs jobs up to the concurrency limit', async () => {
    const q = new GitProcessQueue(2);
    const order: number[] = [];
    const gate = (id: number, ms: number) =>
      q.run(
        () =>
          new Promise<number>((resolve) => {
            order.push(id);
            setTimeout(() => resolve(id), ms);
          })
      );

    const p1 = gate(1, 30);
    const p2 = gate(2, 30);
    const p3 = gate(3, 10);

    // 1 and 2 start immediately; 3 is queued
    expect(q.active).toBe(2);
    expect(q.pending).toBe(1);

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([1, 2, 3]);
    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
  });

  it('propagates errors without blocking the queue', async () => {
    const q = new GitProcessQueue(1);
    const failing = q.run(() => Promise.reject(new Error('boom')));
    const passing = q.run(() => Promise.resolve('ok'));

    await expect(failing).rejects.toThrow('boom');
    await expect(passing).resolves.toBe('ok');
  });

  it('defaults to 4 concurrent slots', () => {
    const q = new GitProcessQueue();
    const jobs = Array.from({ length: 6 }, (_, i) =>
      q.run(() => new Promise((r) => setTimeout(() => r(i), 50)))
    );
    expect(q.active).toBe(4);
    expect(q.pending).toBe(2);
    return Promise.all(jobs);
  });
});
