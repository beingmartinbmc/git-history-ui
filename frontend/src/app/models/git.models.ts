export interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  subject: string;
  body: string;
  parents: string[];
  branches: string[];
  tags: string[];
  isMerge: boolean;
}

export type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'binary';

export interface DiffFile {
  file: string;
  oldFile?: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  changes: string;
}

export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  date: string;
  content: string;
}

export interface GitOptions {
  file?: string;
  since?: string;
  until?: string;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCommits {
  commits: Commit[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
