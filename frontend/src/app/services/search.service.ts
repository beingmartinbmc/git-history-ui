import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NlSearchResponse } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private http = inject(HttpClient);
  private base = '/api';

  naturalLanguage(query: string, page = 1, pageSize = 100): Observable<NlSearchResponse> {
    const params = new HttpParams()
      .set('q', query)
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<NlSearchResponse>(`${this.base}/search`, { params });
  }
}
