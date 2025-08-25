import simpleGit, { SimpleGit, LogResult, DefaultLogFields } from 'simple-git';
import path from 'path';

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

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async getCommits(options: GitOptions = {}): Promise<PaginatedCommits> {
    try {
      const page = options.page || 1;
      const pageSize = options.pageSize || 25;
      const skip = (page - 1) * pageSize;
      
      // Get total count first (without limit)
      const countOptions = {
        maxCount: 0 // Get all commits for counting
      };

      let totalLog: LogResult<DefaultLogFields>;

      if (options.file) {
        totalLog = await this.git.log({
          ...countOptions,
          file: options.file
        });
      } else if (options.since) {
        totalLog = await this.git.log({
          ...countOptions,
          from: options.since
        });
      } else if (options.author) {
        totalLog = await this.git.log({
          ...countOptions,
          author: options.author
        });
      } else {
        totalLog = await this.git.log(countOptions);
      }

      const total = totalLog.all.length;
      const totalPages = Math.ceil(total / pageSize);

      // Get paginated commits
      // For pagination, we need to get all commits and then slice them
      // since simple-git doesn't support skip parameter properly
      const allLogOptions = {
        maxCount: 0 // Get all commits
      };

      let allLog: LogResult<DefaultLogFields>;

      if (options.file) {
        allLog = await this.git.log({
          ...allLogOptions,
          file: options.file
        });
      } else if (options.since) {
        allLog = await this.git.log({
          ...allLogOptions,
          from: options.since
        });
      } else if (options.author) {
        allLog = await this.git.log({
          ...allLogOptions,
          author: options.author
        });
      } else {
        allLog = await this.git.log(allLogOptions);
      }

      // Apply pagination manually
      const paginatedCommits = allLog.all.slice(skip, skip + pageSize);

      const commits: Commit[] = await Promise.all(
        paginatedCommits.map(async (commit) => {
          const [branches, tags] = await Promise.all([
            this.getBranchesForCommit(commit.hash),
            this.getTagsForCommit(commit.hash)
          ]);

          return {
            hash: commit.hash,
            author: commit.author_name,
            date: commit.date,
            message: commit.message,
            files: await this.getFilesForCommit(commit.hash),
            parents: [], // We'll get this from git show if needed
            branches,
            tags
          };
        })
      );

      return {
        commits,
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get commits: ${errorMessage}`);
    }
  }

  async getCommit(hash: string): Promise<Commit> {
    try {
      const log = await this.git.log({
        from: hash,
        to: hash,
        maxCount: 1
      });

      if (log.all.length === 0) {
        throw new Error('Commit not found');
      }

      const commit = log.all[0];
      const [branches, tags] = await Promise.all([
        this.getBranchesForCommit(hash),
        this.getTagsForCommit(hash)
      ]);

      return {
        hash: commit.hash,
        author: commit.author_name,
        date: commit.date,
        message: commit.message,
        files: await this.getFilesForCommit(hash),
        parents: [], // We'll get this from git show if needed
        branches,
        tags
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get commit: ${errorMessage}`);
    }
  }

  async getDiff(hash: string): Promise<DiffFile[]> {
    try {
      const diff = await this.git.diff([hash + '^', hash]);
      return this.parseDiff(diff);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get diff: ${errorMessage}`);
    }
  }

  async getBlame(filePath: string): Promise<BlameLine[]> {
    try {
      const blame = await this.git.raw(['blame', '--porcelain', filePath]);
      return this.parseBlame(blame);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get blame: ${errorMessage}`);
    }
  }

  async getTags(): Promise<string[]> {
    try {
      const tags = await this.git.tags();
      return tags.all;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get tags: ${errorMessage}`);
    }
  }

  async getBranches(): Promise<string[]> {
    try {
      const branches = await this.git.branch();
      return branches.all;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get branches: ${errorMessage}`);
    }
  }

  private async getFilesForCommit(hash: string): Promise<string[]> {
    try {
      const diff = await this.git.diff([hash + '^', hash, '--name-only']);
      return diff.split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  private async getBranchesForCommit(hash: string): Promise<string[]> {
    try {
      const branches = await this.git.branch(['--contains', hash]);
      return branches.all;
    } catch (error) {
      return [];
    }
  }

  private async getTagsForCommit(hash: string): Promise<string[]> {
    try {
      const tags = await this.git.raw(['tag', '--contains', hash]);
      return tags.split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  private parseDiff(diff: string): DiffFile[] {
    const files: DiffFile[] = [];
    const lines = diff.split('\n');
    let currentFile: DiffFile | null = null;
    let currentFileLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          currentFile.changes = currentFileLines.join('\n');
          files.push(currentFile);
        }
        const fileMatch = line.match(/b\/(.+)$/);
        currentFile = {
          file: fileMatch ? fileMatch[1] : '',
          additions: 0,
          deletions: 0,
          changes: ''
        };
        currentFileLines = [];
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        if (currentFile) currentFile.additions++;
        currentFileLines.push(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        if (currentFile) currentFile.deletions++;
        currentFileLines.push(line);
      } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++') || line.trim() === '') {
        // Include git diff headers and context lines
        currentFileLines.push(line);
      } else if (line.startsWith(' ')) {
        // Context lines (unchanged)
        currentFileLines.push(line);
      }
    }

    if (currentFile) {
      currentFile.changes = currentFileLines.join('\n');
      files.push(currentFile);
    }

    return files;
  }

  private parseBlame(blame: string): BlameLine[] {
    const lines: BlameLine[] = [];
    const blameLines = blame.split('\n');
    let currentLine: BlameLine | null = null;

    for (const line of blameLines) {
      if (line.startsWith('author ')) {
        if (currentLine) {
          lines.push(currentLine);
        }
        const hash = blameLines[blameLines.indexOf(line) - 1].split(' ')[0];
        const author = line.substring(7);
        const dateLine = blameLines[blameLines.indexOf(line) + 1];
        const date = dateLine.startsWith('author-time ') 
          ? new Date(parseInt(dateLine.substring(12)) * 1000).toISOString()
          : '';
        
        currentLine = {
          line: lines.length + 1,
          hash,
          author,
          date,
          content: ''
        };
      } else if (line.startsWith('\t') && currentLine) {
        currentLine.content = line.substring(1);
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}
