import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AnnotationComment } from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class AnnotationsService {
  private http = inject(HttpClient);
  private base = '/api';

  list(hash: string): Observable<AnnotationComment[]> {
    return this.http.get<AnnotationComment[]>(`${this.base}/annotations/${hash}`);
  }

  add(hash: string, author: string, body: string): Observable<AnnotationComment> {
    return this.http.post<AnnotationComment>(`${this.base}/annotations/${hash}`, { author, body });
  }

  remove(hash: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/annotations/${hash}/${id}`);
  }
}
