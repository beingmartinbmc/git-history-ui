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
  atIso: string,
  opts: { signal?: AbortSignal } = {}
): Promise<Snapshot> {
  const refs = await gitService.refsAt(atIso, opts);
  return {
    at: atIso,
    ref: refs.head,
    branches: refs.branches,
    tags: refs.tags
  };
}
