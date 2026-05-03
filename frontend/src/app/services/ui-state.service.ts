import { Injectable, computed, signal } from '@angular/core';
import { Commit, GitOptions, NlInterpretation } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  // filters / query
  readonly filters = signal<GitOptions>({ page: 1, pageSize: 100 });

  // commits & status
  readonly commits = signal<Commit[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(100);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly authors = signal<string[]>([]);
  readonly branches = signal<string[]>([]);
  readonly tags = signal<string[]>([]);

  readonly selectedHash = signal<string | null>(null);
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

  patchFilters(patch: Partial<GitOptions>) {
    this.filters.update((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  selectHash(hash: string | null) {
    this.selectedHash.set(hash);
  }

  selectByOffset(delta: number) {
    const list = this.commits();
    if (list.length === 0) return;
    const current = this.selectedHash();
    const idx = current ? (this.commitIndex().get(current)?.index ?? -1) : -1;
    let next = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : idx + delta;
    next = Math.max(0, Math.min(list.length - 1, next));
    this.selectedHash.set(list[next].hash);
  }
}
