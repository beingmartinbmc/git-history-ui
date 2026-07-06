/**
 * Centralized concurrency limiter for git subprocess spawning.
 * Prevents CPU spikes from dozens of concurrent git processes
 * when the UI fans out diffs, blame, and impact in parallel.
 */
const DEFAULT_MAX_CONCURRENT = 4;

type Job<T> = {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

export class GitProcessQueue {
  private running = 0;
  private queue: Job<unknown>[] = [];
  private maxConcurrent: number;

  constructor(maxConcurrent = DEFAULT_MAX_CONCURRENT) {
    this.maxConcurrent = maxConcurrent;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject } as Job<unknown>);
      this.drain();
    });
  }

  private drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
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

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }
}

export const gitQueue = new GitProcessQueue();
