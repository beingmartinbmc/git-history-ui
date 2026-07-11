import {
  GitProcessQueue,
  GitQueueFullError,
  MAX_PENDING_GIT_JOBS
} from '../backend/gitProcessQueue';

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

  it('rejects new jobs with a typed error when the pending backlog is full', async () => {
    const q = new GitProcessQueue(1);
    let release!: () => void;
    const active = q.run(() => new Promise<void>((resolve) => (release = resolve)));
    const pending = Array.from({ length: MAX_PENDING_GIT_JOBS }, () =>
      q.run(() => Promise.resolve())
    );

    await expect(q.run(() => Promise.resolve())).rejects.toBeInstanceOf(GitQueueFullError);
    expect(q.pending).toBe(MAX_PENDING_GIT_JOBS);

    release();
    await Promise.all([active, ...pending]);
    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
  });

  it('rejects pre-aborted jobs without enqueueing them', async () => {
    const q = new GitProcessQueue(1);
    const controller = new AbortController();
    controller.abort();

    await expect(q.run(() => Promise.resolve(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
  });

  it('removes an aborted queued job and continues draining', async () => {
    const q = new GitProcessQueue(1);
    let release!: () => void;
    const active = q.run(() => new Promise<void>((resolve) => (release = resolve)));
    const controller = new AbortController();
    const cancelledFn = jest.fn(() => Promise.resolve('cancelled'));
    const cancelled = q.run(cancelledFn, controller.signal);
    const next = q.run(() => Promise.resolve('next'));

    expect(q.pending).toBe(2);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelledFn).not.toHaveBeenCalled();
    expect(q.pending).toBe(1);

    release();
    await expect(next).resolves.toBe('next');
    await active;
    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
  });

  it('cleans up queued abort listeners when a job starts', async () => {
    const q = new GitProcessQueue(1);
    let release!: () => void;
    const active = q.run(() => new Promise<void>((resolve) => (release = resolve)));
    const controller = new AbortController();
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
    const queued = q.run(() => Promise.resolve('done'), controller.signal);

    release();
    await active;
    await expect(queued).resolves.toBe('done');
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
