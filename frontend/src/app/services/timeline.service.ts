import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DiffFile, SnapshotResponse } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private http = inject(HttpClient);
  private base = '/api';

  snapshot(atIso: string): Observable<SnapshotResponse> {
    const params = new HttpParams().set('at', atIso);
    return this.http.get<SnapshotResponse>(`${this.base}/snapshot`, { params });
  }

  rangeDiff(from: string, to: string): Observable<DiffFile[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<DiffFile[]>(`${this.base}/diff`, { params });
  }
}
