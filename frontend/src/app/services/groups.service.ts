import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CommitGroup } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private http = inject(HttpClient);
  private base = '/api';

  list(opts: { since?: string; until?: string; author?: string } = {}): Observable<CommitGroup[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v) params = params.set(k, String(v));
    }
    return this.http.get<CommitGroup[]>(`${this.base}/groups`, { params });
  }
}
