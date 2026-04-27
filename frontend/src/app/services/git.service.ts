import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BlameLine,
  Commit,
  DiffFile,
  GitOptions,
  PaginatedCommits
} from '../models/git.models';

@Injectable({ providedIn: 'root' })
export class GitService {
  private http = inject(HttpClient);
  private base = '/api';

  getCommits(options: GitOptions = {}): Observable<PaginatedCommits> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(options)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return this.http.get<PaginatedCommits>(`${this.base}/commits`, { params });
  }

  getCommit(hash: string): Observable<Commit> {
    return this.http.get<Commit>(`${this.base}/commit/${hash}`);
  }

  getDiff(hash: string): Observable<DiffFile[]> {
    return this.http.get<DiffFile[]>(`${this.base}/diff/${hash}`);
  }

  getBlame(filePath: string): Observable<BlameLine[]> {
    const params = new HttpParams().set('file', filePath);
    return this.http.get<BlameLine[]>(`${this.base}/blame`, { params });
  }

  getTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/tags`);
  }

  getBranches(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/branches`);
  }

  getAuthors(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/authors`);
  }
}
