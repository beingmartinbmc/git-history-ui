import { Injectable, computed, signal } from '@angular/core';
import { ParamMap, Params } from '@angular/router';
import { Commit, GitOptions, NlInterpretation } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  private commitQueryKey: 'commit' | 'at' = 'commit';

  // filters / query
  readonly filters = signal<GitOptions>({ page: 1, pageSize: 100 });

  // commits & status
  readonly commits = signal<Commit[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(100);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly hasNext = signal(false);
  readonly error = signal<string | null>(null);

  readonly authors = signal<string[]>([]);
  readonly branches = signal<string[]>([]);
  readonly tags = signal<string[]>([]);

  readonly selectedHash = signal<string | null>(null);
  readonly mobileDetailOpen = signal(false);
  readonly activeFilePath = signal<string | null>(null);
  readonly focusedPrNumber = signal<number | null>(null);
  readonly commitIndex = computed(() => {
    const map = new Map<string, { commit: Commit; index: number }>();
    this.commits().forEach((commit, index) => map.set(commit.hash, { commit, index }));
    return map;
  });
  readonly selected = computed<Commit | null>(() => {
    const hash = this.selectedHash();
    if (!hash) return null;
    return this.commitIndex().get(hash)?.commit ?? null;
  });

  // overlays
  readonly paletteOpen = signal(false);
  readonly shortcutsOpen = signal(false);

  // viewport for graph
  readonly graphVisible = signal(true);

  // commit list view: 'flat' = traditional list, 'grouped' = PR/feature groups
  readonly viewMode = signal<'flat' | 'grouped'>('flat');

  // search mode: 'classic' (literal grep) or 'nl' (natural language)
  readonly searchMode = signal<'classic' | 'nl'>('classic');
  readonly nlInterpretation = signal<NlInterpretation | null>(null);

  /** Set by AppComponent; called by CommitListComponent when user scrolls to end or clicks Load More. */
  onLoadMore: (() => void) | null = null;

  patchFilters(patch: Partial<GitOptions>) {
    this.filters.update((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  hydrateQuery(params: ParamMap): string | null {
    const commit = normalizeCommitParam(params.get('commit') || params.get('at'));
    this.commitQueryKey = params.has('at') && !params.has('commit') ? 'at' : 'commit';
    const nextFilters: GitOptions = {
      page: 1,
      pageSize: this.filters().pageSize ?? 100,
      branch: valueOrUndefined(params.get('branch')),
      author: valueOrUndefined(params.get('author')),
      search: valueOrUndefined(params.get('search')),
      file: valueOrUndefined(params.get('file')),
      since: valueOrUndefined(params.get('since')),
      until: valueOrUndefined(params.get('until')),
    };
    if (!sameFilters(this.filters(), nextFilters)) this.filters.set(nextFilters);
    this.selectedHash.set(commit);
    this.mobileDetailOpen.set(Boolean(commit));
    this.activeFilePath.set(valueOrNull(params.get('activeFile')));
    this.searchMode.set(params.get('searchMode') === 'nl' ? 'nl' : 'classic');

    const pr = params.get('pr');
    this.focusedPrNumber.set(pr && /^\d+$/.test(pr) ? Number(pr) : null);
    this.viewMode.set(
      params.get('mode') === 'grouped' || this.focusedPrNumber() ? 'grouped' : 'flat',
    );
    return commit;
  }

  queryParams(): Params {
    const filters = this.filters();
    const commit = this.selectedHash();
    return {
      commit: this.commitQueryKey === 'commit' ? commit : null,
      at: this.commitQueryKey === 'at' ? commit : null,
      pr: this.focusedPrNumber(),
      branch: filters.branch ?? null,
      author: filters.author ?? null,
      search: filters.search ?? null,
      file: filters.file ?? null,
      since: filters.since ?? null,
      until: filters.until ?? null,
      searchMode: this.searchMode() === 'nl' ? 'nl' : null,
      mode: this.viewMode() === 'grouped' ? 'grouped' : null,
      activeFile: this.activeFilePath(),
    };
  }

  selectHash(hash: string | null) {
    this.selectedHash.set(hash);
    this.mobileDetailOpen.set(Boolean(hash));
  }

  selectByOffset(delta: number) {
    const list = this.commits();
    if (list.length === 0) return;
    const current = this.selectedHash();
    const idx = current ? (this.commitIndex().get(current)?.index ?? -1) : -1;
    let next = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : idx + delta;
    next = Math.max(0, Math.min(list.length - 1, next));
    this.selectHash(list[next].hash);
  }
}

function valueOrUndefined(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function valueOrNull(value: string | null): string | null {
  return value?.trim() || null;
}

function normalizeCommitParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[0-9a-f]{4,40}$/i.test(trimmed) ? trimmed : null;
}

function sameFilters(a: GitOptions, b: GitOptions): boolean {
  return (
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.branch === b.branch &&
    a.author === b.author &&
    a.search === b.search &&
    a.file === b.file &&
    a.since === b.since &&
    a.until === b.until
  );
}
