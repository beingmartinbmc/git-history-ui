import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GitOptions, NlSearchResponse } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private http = inject(HttpClient);
  private base = '/api';

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
    return this.http.get<NlSearchResponse>(`${this.base}/search`, { params: withFilters });
  }
}
