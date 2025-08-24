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
}

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async getCommits(options: GitOptions = {}): Promise<Commit[]> {
    try {
      const logOptions = {
        maxCount: options.limit || 100
      };

      let log: LogResult<DefaultLogFields>;

      if (options.file) {
        log = await this.git.log({
          ...logOptions,
          file: options.file
        });
      } else if (options.since) {
        log = await this.git.log({
          ...logOptions,
          from: options.since
        });
      } else if (options.author) {
        log = await this.git.log({
          ...logOptions,
          author: options.author
        });
      } else {
        log = await this.git.log(logOptions);
      }

      const commits: Commit[] = await Promise.all(
        log.all.map(async (commit) => {
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

      return commits;
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

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }
        const fileMatch = line.match(/b\/(.+)$/);
        currentFile = {
          file: fileMatch ? fileMatch[1] : '',
          additions: 0,
          deletions: 0,
          changes: ''
        };
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        if (currentFile) currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        if (currentFile) currentFile.deletions++;
      }
    }

    if (currentFile) {
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
