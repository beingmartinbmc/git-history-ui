import type { GitService } from './gitService';

export interface Snapshot {
  at: string;
  ref: string | null;
  branches: Record<string, string>;
  tags: Record<string, string>;
}

/**
 * Get the repo state at a point in time: HEAD/branch/tag heads as of `atIso`.
 * Implementation: for each branch/tag ref, find the most recent commit
 * with committer date <= atIso (`git rev-list -1 --before=...`).
 *
 * Tags are typically immutable, but historically were placed at a different
 * commit so we still resolve them at the snapshot moment.
 */
export async function getSnapshot(
  gitService: GitService,
  atIso: string
): Promise<Snapshot> {
  const [branches, tags] = await Promise.all([
    gitService.getBranches(),
    gitService.getTags()
  ]);

  const branchEntries = await Promise.all(
    branches.map(async (b) => {
      const hash = await gitService.revAt(b, atIso).catch(() => null);
      return [b, hash] as const;
    })
  );
  const tagEntries = await Promise.all(
    tags.map(async (t) => {
      const hash = await gitService.revAt(t, atIso).catch(() => null);
      return [t, hash] as const;
    })
  );

  const branchMap: Record<string, string> = {};
  for (const [b, hash] of branchEntries) if (hash) branchMap[b] = hash;
  const tagMap: Record<string, string> = {};
  for (const [t, hash] of tagEntries) if (hash) tagMap[t] = hash;

  // HEAD-equivalent: commit on the default branch (HEAD) at the snapshot time.
  const head = await gitService.revAt('HEAD', atIso).catch(() => null);

  return {
    at: atIso,
    ref: head,
    branches: branchMap,
    tags: tagMap
  };
}
