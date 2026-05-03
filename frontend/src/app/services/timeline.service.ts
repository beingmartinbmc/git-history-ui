import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DiffFile, SnapshotResponse } from '../models/git.models';
import { ObservableCache, TTL } from './observable-cache';

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private http = inject(HttpClient);
  private base = '/api';
  private cache = new ObservableCache(100);

  snapshot(atIso: string): Observable<SnapshotResponse> {
    const params = new HttpParams().set('at', atIso);
    return this.cache.get(
      `snapshot:${atIso}`,
      () => this.http.get<SnapshotResponse>(`${this.base}/snapshot`, { params }),
      TTL.IMMUTABLE,
    );
  }

  rangeDiff(from: string, to: string): Observable<DiffFile[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.cache.get(
      `range:${from}:${to}`,
      () => this.http.get<DiffFile[]>(`${this.base}/diff`, { params }),
      TTL.IMMUTABLE,
    );
  }

  invalidate(): void {
    this.cache.clear();
  }
}
