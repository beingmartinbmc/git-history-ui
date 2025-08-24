export interface Commit {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  parents: string[];
  branches: string[];
  tags: string[];
}

export interface DiffFile {
  file: string;
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
  author?: string;
  limit?: number;
}

export interface CommitNode {
  id: string;
  x: number;
  y: number;
  commit: Commit;
}
