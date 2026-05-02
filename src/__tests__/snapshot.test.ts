import { getSnapshot } from '../backend/snapshot';
import type { GitService } from '../backend/gitService';

function fakeGitService(opts: {
  branches: string[];
  tags: string[];
  rev: (ref: string, at: string) => string | null | Promise<string | null | never>;
}): GitService {
  return {
    getBranches: async () => opts.branches,
    getTags: async () => opts.tags,
    revAt: async (ref: string, at: string) => {
      const result = await opts.rev(ref, at);
      if (result === undefined) throw new Error('boom');
      return result;
    }
  } as unknown as GitService;
}

describe('getSnapshot', () => {
  it('resolves all known refs at the snapshot time', async () => {
    const svc = fakeGitService({
      branches: ['main', 'feature'],
      tags: ['v1.0.0'],
      rev: (ref) => ({ main: 'aaa', feature: 'bbb', 'v1.0.0': 'ccc', HEAD: 'aaa' }[ref] ?? null)
    });
    const snap = await getSnapshot(svc, '2026-01-01');
    expect(snap.at).toBe('2026-01-01');
    expect(snap.ref).toBe('aaa');
    expect(snap.branches).toEqual({ main: 'aaa', feature: 'bbb' });
    expect(snap.tags).toEqual({ 'v1.0.0': 'ccc' });
  });

  it('skips refs that have no commit before the snapshot', async () => {
    const svc = fakeGitService({
      branches: ['main', 'new-branch'],
      tags: [],
      rev: (ref) => (ref === 'new-branch' ? null : 'aaa')
    });
    const snap = await getSnapshot(svc, '2020-01-01');
    expect(snap.branches).toEqual({ main: 'aaa' });
    expect(snap.ref).toBe('aaa');
  });

  it('treats throwing revAt() as no-such-ref', async () => {
    const svc = fakeGitService({
      branches: ['main', 'broken'],
      tags: ['t1'],
      rev: (ref) => {
        if (ref === 'broken') throw new Error('bad');
        if (ref === 't1') throw new Error('bad');
        return 'h';
      }
    });
    const snap = await getSnapshot(svc, '2026-05-01');
    expect(snap.branches).toEqual({ main: 'h' });
    expect(snap.tags).toEqual({});
  });

  it('returns null HEAD if the repo is empty at that time', async () => {
    const svc = fakeGitService({ branches: [], tags: [], rev: () => null });
    const snap = await getSnapshot(svc, '2026-05-01');
    expect(snap.ref).toBeNull();
    expect(snap.branches).toEqual({});
  });
});
