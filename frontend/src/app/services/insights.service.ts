import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BreakageAnalysis, CommitImpact, FileStats, InsightsBundle } from '../models/git.models';
import { ObservableCache, TTL } from './observable-cache';

@Injectable({ providedIn: 'root' })
export class InsightsService {
  private http = inject(HttpClient);
  private base = '/api';
  private cache = new ObservableCache(100);

  bundle(
    opts: { since?: string; until?: string; maxCommits?: number } = {},
  ): Observable<InsightsBundle> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined && v !== null) params = params.set(k, String(v));
    }
    return this.cache.get(
      `insights:${params.toString()}`,
      () => this.http.get<InsightsBundle>(`${this.base}/insights`, { params }),
      TTL.VOLATILE,
    );
  }

  fileStats(file: string): Observable<FileStats> {
    const params = new HttpParams().set('file', file);
    return this.cache.get(
      `file-stats:${file}`,
      () => this.http.get<FileStats>(`${this.base}/file-stats`, { params }),
      TTL.VOLATILE,
    );
  }

  impact(hash: string): Observable<CommitImpact> {
    return this.cache.get(
      `impact:${hash}`,
      () => this.http.get<CommitImpact>(`${this.base}/impact/${hash}`),
      TTL.IMMUTABLE,
    );
  }

  breakage(file: string, opts: { limit?: number } = {}): Observable<BreakageAnalysis> {
    let params = new HttpParams().set('file', file);
    if (opts.limit !== undefined) params = params.set('limit', String(opts.limit));
    return this.cache.get(
      `breakage:${params.toString()}`,
      () => this.http.get<BreakageAnalysis>(`${this.base}/breakage`, { params }),
      TTL.VOLATILE,
    );
  }

  summarizeDiff(text: string): Observable<{ summary: string; provider: string }> {
    return this.http.post<{ summary: string; provider: string }>(`${this.base}/summarize-diff`, {
      text,
    });
  }

  explainCommit(hash: string): Observable<{ summary: string; provider: string }> {
    return this.cache.get(
      `explain:${hash}`,
      () =>
        this.http.post<{ summary: string; provider: string }>(
          `${this.base}/explain-commit/${hash}`,
          {},
        ),
      TTL.IMMUTABLE,
    );
  }

  invalidate(): void {
    this.cache.clear();
  }
}
