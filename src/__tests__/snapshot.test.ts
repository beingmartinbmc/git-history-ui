import { getSnapshot } from '../backend/snapshot';
import type { GitService } from '../backend/gitService';

function fakeGitService(refs: {
  head: string | null;
  branches: Record<string, string>;
  tags: Record<string, string>;
}): GitService {
  return {
    refsAt: async () => refs
  } as unknown as GitService;
}

describe('getSnapshot', () => {
  it('resolves all known refs at the snapshot time', async () => {
    const svc = fakeGitService({
      head: 'aaa',
      branches: { main: 'aaa', feature: 'bbb' },
      tags: { 'v1.0.0': 'ccc' }
    });
    const snap = await getSnapshot(svc, '2026-01-01');
    expect(snap.at).toBe('2026-01-01');
    expect(snap.ref).toBe('aaa');
    expect(snap.branches).toEqual({ main: 'aaa', feature: 'bbb' });
    expect(snap.tags).toEqual({ 'v1.0.0': 'ccc' });
  });

  it('preserves the concrete refsAt response', async () => {
    const svc = fakeGitService({
      head: 'aaa',
      branches: { main: 'aaa' },
      tags: {}
    });
    const snap = await getSnapshot(svc, '2020-01-01');
    expect(snap.branches).toEqual({ main: 'aaa' });
    expect(snap.ref).toBe('aaa');
  });

  it('returns null HEAD if the repo is empty at that time', async () => {
    const svc = fakeGitService({ head: null, branches: {}, tags: {} });
    const snap = await getSnapshot(svc, '2026-05-01');
    expect(snap.ref).toBeNull();
    expect(snap.branches).toEqual({});
  });
});
