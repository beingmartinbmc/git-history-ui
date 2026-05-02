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

export interface NlInterpretation {
  keywords: string[];
  expandedKeywords: string[];
  author?: string;
  since?: string;
  until?: string;
  rawQuery: string;
}

export interface NlSearchResponse extends PaginatedCommits {
  parsedQuery: NlInterpretation;
  usedLlm: boolean;
  llmProvider: 'heuristic' | 'anthropic' | 'openai';
}

export interface CommitGroup {
  id: string;
  title: string;
  prNumber?: number;
  source: 'merge' | 'squash' | 'conventional' | 'standalone';
  scope?: string;
  type?: string;
  commits: string[];
  filesTouched: number;
  additions: number;
  deletions: number;
  firstDate: string;
  lastDate: string;
  authors: string[];
  pr?: PrInfo;
}

export interface PrInfo {
  number: number;
  title: string;
  author: string;
  url: string;
  labels: string[];
  state: 'open' | 'closed' | 'merged';
}

export interface SnapshotResponse {
  at: string;
  ref: string | null;
  branches: Record<string, string>;
  tags: Record<string, string>;
}

export interface FileStats {
  file: string;
  firstSeen: string;
  lastTouched: string;
  totalCommits: number;
  contributors: string[];
}

export interface CommitImpact {
  hash: string;
  files: string[];
  modules: string[];
  dependencyRipple: Array<{ from: string; to: string }>;
  relatedCommits: Array<{ hash: string; subject: string; date: string }>;
}

export interface InsightsBundle {
  windowStart: string | null;
  windowEnd: string | null;
  totalCommits: number;
  totalAuthors: number;
  topContributors: Array<{
    author: string;
    email: string;
    commits: number;
    firstCommit: string;
    lastCommit: string;
  }>;
  hotspots: Array<{
    file: string;
    commits: number;
    additions: number;
    deletions: number;
    lastTouched: string;
    authors: number;
  }>;
  churnByDay: Array<{ date: string; commits: number; additions: number; deletions: number }>;
  riskyFiles: Array<{
    file: string;
    riskScore: number;
    reason: string;
    commits: number;
    authors: number;
    churn: number;
  }>;
}

export interface AnnotationComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommitAnnotations {
  hash: string;
  comments: AnnotationComment[];
}
