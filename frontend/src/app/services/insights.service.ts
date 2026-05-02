import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CommitImpact, FileStats, InsightsBundle } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class InsightsService {
  private http = inject(HttpClient);
  private base = '/api';

  bundle(opts: { since?: string; until?: string; maxCommits?: number } = {}): Observable<InsightsBundle> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined && v !== null) params = params.set(k, String(v));
    }
    return this.http.get<InsightsBundle>(`${this.base}/insights`, { params });
  }

  fileStats(file: string): Observable<FileStats> {
    const params = new HttpParams().set('file', file);
    return this.http.get<FileStats>(`${this.base}/file-stats`, { params });
  }

  impact(hash: string): Observable<CommitImpact> {
    return this.http.get<CommitImpact>(`${this.base}/impact/${hash}`);
  }

  summarizeDiff(text: string): Observable<{ summary: string; provider: string }> {
    return this.http.post<{ summary: string; provider: string }>(`${this.base}/summarize-diff`, { text });
  }

  explainCommit(hash: string): Observable<{ summary: string; provider: string }> {
    return this.http.post<{ summary: string; provider: string }>(`${this.base}/explain-commit/${hash}`, {});
  }
}
