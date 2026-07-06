import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BlameLine,
  Commit,
  DiffFile,
  GitOptions,
  IndexStatus,
  PaginatedCommits,
} from '../models/git.models';
import { ObservableCache, TTL } from './observable-cache';

@Injectable({ providedIn: 'root' })
export class GitService {
  private http = inject(HttpClient);
  private base = '/api';
  private cache = new ObservableCache(200);

  getCommits(options: GitOptions = {}): Observable<PaginatedCommits> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(options)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return this.cache.get(
      `commits:${params.toString()}`,
      () => this.http.get<PaginatedCommits>(`${this.base}/commits`, { params }),
      TTL.VOLATILE,
    );
  }

  /** Drop all cached entries — call after operations that mutate repo state. */
  invalidate(): void {
    this.cache.clear();
  }

  streamCommits(options: GitOptions = {}): Observable<PaginatedCommits> {
    return new Observable<PaginatedCommits>((subscriber) => {
      const url = new URL(`${window.location.origin}${this.base}/commits/stream`);
      for (const [k, v] of Object.entries(options)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }

      const source = new EventSource(url.toString());
      const commits: Commit[] = [];
      const pending: Commit[] = [];
      const page = Math.max(1, options.page ?? 1);
      const requestedPageSize = clamp(options.pageSize ?? 100, 1, 500);
      let total = 0;
      let doneMeta: Partial<PaginatedCommits> = {};
      let raf = 0;
      let timer = 0;
      let completed = false;
      let fallbackSub: { unsubscribe(): void } | null = null;

      const emit = () => {
        raf = 0;
        if (!pending.length && !completed) return;
        if (pending.length) {
          commits.push(...pending.splice(0));
        }
        subscriber.next({
          commits: commits.slice(),
          total: completed ? total || commits.length : commits.length,
          page: doneMeta.page ?? page,
          pageSize: doneMeta.pageSize ?? requestedPageSize,
          totalPages: doneMeta.totalPages ?? 1,
          hasNext: doneMeta.hasNext ?? false,
          hasPrevious: doneMeta.hasPrevious ?? page > 1,
        });
        if (completed) {
          source.close();
          subscriber.complete();
        }
      };

      const scheduleEmit = () => {
        if (raf || timer) return;
        if (pending.length >= 50 || completed) {
          raf = requestAnimationFrame(emit);
          return;
        }
        timer = window.setTimeout(() => {
          timer = 0;
          raf = requestAnimationFrame(emit);
        }, 100);
      };

      source.addEventListener('commit', (event) => {
        if (commits.length + pending.length < requestedPageSize) {
          pending.push(JSON.parse((event as MessageEvent).data) as Commit);
        }
        scheduleEmit();
      });
      source.addEventListener('done', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as Partial<PaginatedCommits>;
        total = data.total ?? commits.length + pending.length;
        doneMeta = data;
        completed = true;
        scheduleEmit();
      });
      source.addEventListener('error', (event) => {
        source.close();
        if (raf) cancelAnimationFrame(raf);
        fallbackSub = this.getCommits(options).subscribe({
          next: (resp) => subscriber.next(resp),
          error: (err) => subscriber.error(hasStreamErrorMessage(event) ? streamError(event) : err),
          complete: () => subscriber.complete(),
        });
      });

      return () => {
        source.close();
        if (raf) cancelAnimationFrame(raf);
        if (timer) window.clearTimeout(timer);
        fallbackSub?.unsubscribe();
      };
    });
  }

  getCommit(hash: string): Observable<Commit> {
    return this.cache.get(
      `commit:${hash}`,
      () => this.http.get<Commit>(`${this.base}/commit/${hash}`),
      TTL.IMMUTABLE,
    );
  }

  getDiff(hash: string): Observable<DiffFile[]> {
    return this.cache.get(
      `diff:${hash}`,
      () => this.http.get<DiffFile[]>(`${this.base}/diff/${hash}`),
      TTL.IMMUTABLE,
    );
  }

  getBlame(filePath: string): Observable<BlameLine[]> {
    const params = new HttpParams().set('file', filePath);
    // Blame results depend on HEAD, so refresh sooner than per-commit data.
    return this.cache.get(
      `blame:${filePath}`,
      () => this.http.get<BlameLine[]>(`${this.base}/blame`, { params }),
      TTL.VOLATILE,
    );
  }

  getTags(): Observable<string[]> {
    return this.cache.get('tags', () => this.http.get<string[]>(`${this.base}/tags`), TTL.VOLATILE);
  }

  getBranches(): Observable<string[]> {
    return this.cache.get(
      'branches',
      () => this.http.get<string[]>(`${this.base}/branches`),
      TTL.VOLATILE,
    );
  }

  getAuthors(): Observable<string[]> {
    return this.cache.get(
      'authors',
      () => this.http.get<string[]>(`${this.base}/authors`),
      TTL.VOLATILE,
    );
  }

  getIndexStatus(): Observable<IndexStatus> {
    return this.http.get<IndexStatus>(`${this.base}/index/status`);
  }

  buildIndex(wait = false): Observable<IndexStatus> {
    const params = wait ? new HttpParams().set('wait', 'true') : undefined;
    return this.http.post<IndexStatus>(`${this.base}/index/build`, {}, { params });
  }

  rebuildIndex(): Observable<IndexStatus> {
    return this.http.post<IndexStatus>(`${this.base}/index/rebuild`, {});
  }

  cancelIndexBuild(): Observable<IndexStatus> {
    return this.http.post<IndexStatus>(`${this.base}/index/cancel`, {});
  }

  // Pickaxe: code content search
  pickaxeSearch(
    pattern: string,
    opts: {
      mode?: 'S' | 'G';
      author?: string;
      since?: string;
      until?: string;
      file?: string;
      branch?: string;
    } = {},
  ): Observable<{ commits: Commit[]; total: number }> {
    let params = new HttpParams().set('pattern', pattern);
    if (opts.mode) params = params.set('mode', opts.mode);
    if (opts.author) params = params.set('author', opts.author);
    if (opts.since) params = params.set('since', opts.since);
    if (opts.until) params = params.set('until', opts.until);
    if (opts.file) params = params.set('file', opts.file);
    if (opts.branch) params = params.set('branch', opts.branch);
    return this.http.get<{ commits: Commit[]; total: number }>(`${this.base}/pickaxe`, { params });
  }

  // Stash explorer
  getStashes(): Observable<Array<{ index: number; message: string; date: string; hash: string }>> {
    return this.http.get<Array<{ index: number; message: string; date: string; hash: string }>>(
      `${this.base}/stashes`,
    );
  }

  // Reflog explorer
  getReflog(
    limit = 50,
  ): Observable<
    Array<{ hash: string; shortHash: string; action: string; message: string; date: string }>
  > {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<
      Array<{ hash: string; shortHash: string; action: string; message: string; date: string }>
    >(`${this.base}/reflog`, { params });
  }

  // Range diff (for branch compare)
  getRangeDiff(from: string, to: string): Observable<import('../models/git.models').DiffFile[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<import('../models/git.models').DiffFile[]>(`${this.base}/diff`, {
      params,
    });
  }

  // Lazy diff: file list only (no change bodies)
  getDiffFiles(hash: string): Observable<{
    files: Array<{
      file: string;
      oldFile?: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
    totalLines: number;
    isLarge: boolean;
  }> {
    return this.http.get<{
      files: Array<{
        file: string;
        oldFile?: string;
        status: string;
        additions: number;
        deletions: number;
      }>;
      totalLines: number;
      isLarge: boolean;
    }>(`${this.base}/diff/${hash}/files`);
  }

  // Lazy diff: single file
  getDiffFile(hash: string, filePath: string): Observable<import('../models/git.models').DiffFile> {
    const params = new HttpParams().set('path', filePath);
    return this.http.get<import('../models/git.models').DiffFile>(
      `${this.base}/diff/${hash}/file`,
      { params },
    );
  }

  // Presets API
  getPresets(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/presets`);
  }

  savePreset(name: string, filters: Record<string, unknown>): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(`${this.base}/presets/${name}`, filters);
  }

  deletePreset(name: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/presets/${name}`);
  }

  // Export
  getExportUrl(type: 'commits' | 'insights' | 'wrapped', format = 'json'): string {
    return `${this.base}/export/${type}?format=${format}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasStreamErrorMessage(event: Event): boolean {
  return event instanceof MessageEvent && typeof event.data === 'string' && event.data.length > 0;
}

function streamError(event: Event): Error {
  if (event instanceof MessageEvent && typeof event.data === 'string' && event.data) {
    try {
      const parsed = JSON.parse(event.data) as { message?: string; error?: string };
      const message = parsed.message || parsed.error;
      if (message) return new Error(message);
    } catch {
      return new Error(event.data);
    }
  }
  return new Error('Failed to load commits.');
}
