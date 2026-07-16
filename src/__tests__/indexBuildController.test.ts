import { createIndexBuildController } from '../backend/indexBuildController';
import type { SqliteIndex } from '../backend/cache/sqliteIndex';

function fakeIndex(build: () => Promise<never>): SqliteIndex {
  return {
    build,
    stats: async () => ({
      available: true,
      total: 0,
      builtAt: null
    }),
    getProgress: () => ({
      phase: 'error',
      indexed: 0,
      startedAt: null,
      updatedAt: new Date().toISOString()
    }),
    invalidate: jest.fn()
  } as unknown as SqliteIndex;
}

describe('createIndexBuildController', () => {
  it('handles background build failures without hiding them from waiting callers', async () => {
    const background = createIndexBuildController(
      fakeIndex(async () => {
        throw new Error('disk full');
      })
    );
    await expect(background.start()).resolves.toMatchObject({ available: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(background.status()).resolves.toMatchObject({ running: false });

    const waiting = createIndexBuildController(
      fakeIndex(async () => {
        throw new Error('disk full');
      })
    );
    await expect(waiting.buildAndWait()).rejects.toThrow('disk full');
  });
});
