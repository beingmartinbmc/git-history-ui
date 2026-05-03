import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AnnotationComment } from '../models/git.models';
import { ObservableCache, TTL } from './observable-cache';

@Injectable({ providedIn: 'root' })
export class AnnotationsService {
  private http = inject(HttpClient);
  private base = '/api';
  private cache = new ObservableCache(200);

  list(hash: string): Observable<AnnotationComment[]> {
    return this.cache.get(
      hash,
      () => this.http.get<AnnotationComment[]>(`${this.base}/annotations/${hash}`),
      TTL.VOLATILE,
    );
  }

  add(hash: string, author: string, body: string): Observable<AnnotationComment> {
    return this.http
      .post<AnnotationComment>(`${this.base}/annotations/${hash}`, { author, body })
      .pipe(tap(() => this.cache.invalidate(hash)));
  }

  remove(hash: string, id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/annotations/${hash}/${id}`)
      .pipe(tap(() => this.cache.invalidate(hash)));
  }
}
