/**
 * Centralized concurrency limiter for git subprocess spawning.
 * Prevents CPU spikes from dozens of concurrent git processes
 * when the UI fans out diffs, blame, and impact in parallel.
 */
const DEFAULT_MAX_CONCURRENT = 4;
export const MAX_PENDING_GIT_JOBS = 100;

export class GitQueueFullError extends Error {
  constructor() {
    super('Git process queue is full');
    this.name = 'GitQueueFullError';
  }
}

type Job<T> = {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export class GitProcessQueue {
  private running = 0;
  private queue: Job<unknown>[] = [];
  private maxConcurrent: number;

  constructor(maxConcurrent = DEFAULT_MAX_CONCURRENT) {
    this.maxConcurrent = maxConcurrent;
  }

  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.queue.length >= MAX_PENDING_GIT_JOBS) {
      return Promise.reject(new GitQueueFullError());
    }
    return new Promise<T>((resolve, reject) => {
      const job = { fn, resolve, reject, signal } as Job<unknown>;
      if (signal) {
        job.onAbort = () => {
          const index = this.queue.indexOf(job);
          if (index < 0) return;
          this.queue.splice(index, 1);
          this.cleanup(job);
          reject(abortError());
        };
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      this.queue.push(job);
      this.drain();
    });
  }

  private drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.cleanup(job);
      this.running++;
      job
        .fn()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  private cleanup(job: Job<unknown>) {
    if (job.signal && job.onAbort) {
      job.signal.removeEventListener('abort', job.onAbort);
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }
}

export const gitQueue = new GitProcessQueue();

function abortError(): Error {
  const error = new Error('Git queue job aborted');
  error.name = 'AbortError';
  return error;
}
