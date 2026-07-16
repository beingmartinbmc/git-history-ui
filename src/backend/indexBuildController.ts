import { type IndexProgress, type IndexStats, SqliteIndex } from './cache/sqliteIndex';

interface IndexStatus extends IndexStats {
  running: boolean;
  progress: IndexProgress;
}

export function createIndexBuildController(index: SqliteIndex) {
  let controller: AbortController | null = null;
  let running: Promise<IndexStats> | null = null;

  const status = async (): Promise<IndexStatus> => ({
    ...(await index.stats()),
    running: !!running,
    progress: index.getProgress()
  });

  const begin = (force = false): Promise<IndexStats> => {
    if (running) return running;
    if (force) index.invalidate();
    controller = new AbortController();
    const tracked = index
      .build({ signal: controller.signal })
      .catch((err) => {
        if (controller?.signal.aborted) return index.stats();
        throw err;
      })
      .finally(() => {
        if (running === tracked) {
          running = null;
          controller = null;
        }
      });
    running = tracked;
    // Background callers return before the build settles. Keep the tracked
    // promise rejectable for wait=true while marking that rejection handled.
    void tracked.catch(() => undefined);
    return tracked;
  };

  const start = async (force = false): Promise<IndexStatus> => {
    begin(force);
    return status();
  };

  const buildAndWait = async (): Promise<IndexStatus> => {
    await begin();
    return status();
  };

  const cancel = async (): Promise<IndexStatus> => {
    controller?.abort();
    if (running) await running.catch(() => undefined);
    return status();
  };

  return { status, start, buildAndWait, cancel };
}
