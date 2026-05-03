import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BlameLine, Commit, DiffFile, GitOptions, PaginatedCommits } from '../models/git.models';

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

  streamCommits(options: GitOptions = {}): Observable<PaginatedCommits> {
    return new Observable<PaginatedCommits>((subscriber) => {
      const url = new URL(`${window.location.origin}${this.base}/commits/stream`);
      for (const [k, v] of Object.entries(options)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }

      const source = new EventSource(url.toString());
      const commits: Commit[] = [];
      const pending: Commit[] = [];
      const page = Math.max(1, options.page ?? 1);
      const requestedPageSize = clamp(options.pageSize ?? 100, 1, 500);
      let total = 0;
      let doneMeta: Partial<PaginatedCommits> = {};
      let raf = 0;
      let completed = false;
      let fallbackSub: { unsubscribe(): void } | null = null;

      const emit = () => {
        raf = 0;
        if (!pending.length && !completed) return;
        if (pending.length) {
          commits.push(...pending.splice(0));
        }
        subscriber.next({
          commits: commits.slice(),
          total: completed ? total || commits.length : commits.length,
          page: doneMeta.page ?? page,
          pageSize: doneMeta.pageSize ?? requestedPageSize,
          totalPages: doneMeta.totalPages ?? 1,
          hasNext: doneMeta.hasNext ?? false,
          hasPrevious: doneMeta.hasPrevious ?? page > 1,
        });
        if (completed) {
          source.close();
          subscriber.complete();
        }
      };

      const scheduleEmit = () => {
        if (!raf) raf = requestAnimationFrame(emit);
      };

      source.addEventListener('commit', (event) => {
        if (commits.length + pending.length < requestedPageSize) {
          pending.push(JSON.parse((event as MessageEvent).data) as Commit);
        }
        scheduleEmit();
      });
      source.addEventListener('done', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as Partial<PaginatedCommits>;
        total = data.total ?? commits.length + pending.length;
        doneMeta = data;
        completed = true;
        scheduleEmit();
      });
      source.addEventListener('error', (event) => {
        source.close();
        if (raf) cancelAnimationFrame(raf);
        fallbackSub = this.getCommits(options).subscribe({
          next: (resp) => subscriber.next(resp),
          error: (err) => subscriber.error(hasStreamErrorMessage(event) ? streamError(event) : err),
          complete: () => subscriber.complete(),
        });
      });

      return () => {
        source.close();
        if (raf) cancelAnimationFrame(raf);
        fallbackSub?.unsubscribe();
      };
    });
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasStreamErrorMessage(event: Event): boolean {
  return event instanceof MessageEvent && typeof event.data === 'string' && event.data.length > 0;
}

function streamError(event: Event): Error {
  if (event instanceof MessageEvent && typeof event.data === 'string' && event.data) {
    try {
      const parsed = JSON.parse(event.data) as { message?: string; error?: string };
      const message = parsed.message || parsed.error;
      if (message) return new Error(message);
    } catch {
      return new Error(event.data);
    }
  }
  return new Error('Failed to load commits.');
}
