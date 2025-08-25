import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Commit, DiffFile, BlameLine, GitOptions, PaginatedCommits } from '../models/git.models';

@Injectable({
  providedIn: 'root'
})
export class GitService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) { }

  getCommits(options: GitOptions = {}): Observable<PaginatedCommits> {
    const params = new URLSearchParams();
    if (options.file) params.set('file', options.file);
    if (options.since) params.set('since', options.since);
    if (options.author) params.set('author', options.author);
    if (options.page) params.set('page', options.page.toString());
    if (options.pageSize) params.set('pageSize', options.pageSize.toString());

    return this.http.get<PaginatedCommits>(`${this.apiUrl}/commits?${params.toString()}`);
  }

  getCommit(hash: string): Observable<Commit> {
    return this.http.get<Commit>(`${this.apiUrl}/commit/${hash}`);
  }

  getDiff(hash: string): Observable<DiffFile[]> {
    return this.http.get<DiffFile[]>(`${this.apiUrl}/diff/${hash}`);
  }

  getBlame(filePath: string): Observable<BlameLine[]> {
    return this.http.get<BlameLine[]>(`${this.apiUrl}/blame/${encodeURIComponent(filePath)}`);
  }

  getTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/tags`);
  }

  getBranches(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/branches`);
  }
}
