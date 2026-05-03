import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GitOptions, NlSearchResponse } from '../models/git.models';
import { ObservableCache, TTL } from './observable-cache';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private http = inject(HttpClient);
  private base = '/api';
  private cache = new ObservableCache(50);

  naturalLanguage(query: string, options: GitOptions = {}): Observable<NlSearchResponse> {
    const params = new HttpParams()
      .set('q', query)
      .set('page', String(options.page ?? 1))
      .set('pageSize', String(options.pageSize ?? 100));
    let withFilters = params;
    for (const key of ['author', 'since', 'until', 'branch', 'file'] as const) {
      const value = options[key];
      if (value) withFilters = withFilters.set(key, String(value));
    }
    return this.cache.get(
      `nl:${withFilters.toString()}`,
      () => this.http.get<NlSearchResponse>(`${this.base}/search`, { params: withFilters }),
      TTL.SHORT,
    );
  }

  invalidate(): void {
    this.cache.clear();
  }
}
