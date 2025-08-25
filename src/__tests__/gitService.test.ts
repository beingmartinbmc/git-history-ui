import { GitService } from '../backend/gitService';

// Mock simple-git
const mockGit = {
  log: jest.fn(),
  tags: jest.fn(),
  branch: jest.fn(),
  diff: jest.fn(),
  raw: jest.fn(),
};

jest.mock('simple-git', () => {
  return jest.fn(() => mockGit);
});

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(() => {
    gitService = new GitService();
    jest.clearAllMocks();
  });

  describe('getCommits', () => {
    it('should return an array of commits', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          date: '2024-01-01',
          message: 'Test commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          refs: 'HEAD -> main',
          body: '',
          hash_abbrev: 'abc123',
          tree: 'def456',
          tree_abbrev: 'def456',
          parent: 'ghi789',
          parent_abbrev: 'ghi789'
        }
      ];

      mockGit.log.mockResolvedValue({ all: mockCommits });
      mockGit.diff.mockResolvedValue('');
      mockGit.branch.mockResolvedValue({ all: ['main'] });
      mockGit.raw.mockResolvedValue('');

      const commits = await gitService.getCommits();
      
      expect(commits).toHaveProperty('commits');
      expect(Array.isArray(commits.commits)).toBe(true);
      expect(commits.commits.length).toBeGreaterThan(0);
      expect(commits.commits[0]).toHaveProperty('hash');
      expect(commits.commits[0]).toHaveProperty('author');
      expect(commits.commits[0]).toHaveProperty('date');
      expect(commits.commits[0]).toHaveProperty('message');
    });

    it('should respect the pageSize parameter', async () => {
      const mockCommits = Array(3).fill(null).map((_, i) => ({
        hash: `hash${i}`,
        date: '2024-01-01',
        message: `Commit ${i}`,
        author_name: 'Test Author',
        author_email: 'test@example.com',
        refs: 'HEAD -> main',
        body: '',
        hash_abbrev: `hash${i}`,
        tree: 'def456',
        tree_abbrev: 'def456',
        parent: 'ghi789',
        parent_abbrev: 'ghi789'
      }));

      mockGit.log.mockResolvedValue({ all: mockCommits });

      const result = await gitService.getCommits({ pageSize: 3 });
      
      // The GitService should respect the pageSize parameter
      expect(result.commits.length).toBe(3);
      expect(result.pageSize).toBe(3);
    });

    it('should handle git log errors', async () => {
      mockGit.log.mockRejectedValue(new Error('Git error'));

      await expect(gitService.getCommits()).rejects.toThrow('Git error');
    });

    it('should handle empty commit list', async () => {
      mockGit.log.mockResolvedValue({ all: [] });

      const result = await gitService.getCommits();
      
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
      expect(result.commits.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle file filter option', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          date: '2024-01-01',
          message: 'Test commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          refs: 'HEAD -> main',
          body: '',
          hash_abbrev: 'abc123',
          tree: 'def456',
          tree_abbrev: 'def456',
          parent: 'ghi789',
          parent_abbrev: 'ghi789'
        }
      ];

      mockGit.log.mockResolvedValue({ all: mockCommits });

      const result = await gitService.getCommits({ file: 'src/app.js' });
      
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
      expect(result.commits.length).toBeGreaterThan(0);
    });

    it('should handle since filter option', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          date: '2024-01-01',
          message: 'Test commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          refs: 'HEAD -> main',
          body: '',
          hash_abbrev: 'abc123',
          tree: 'def456',
          tree_abbrev: 'def456',
          parent: 'ghi789',
          parent_abbrev: 'ghi789'
        }
      ];

      mockGit.log.mockResolvedValue({ all: mockCommits });

      const result = await gitService.getCommits({ since: 'v1.0.0' });
      
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
      expect(result.commits.length).toBeGreaterThan(0);
    });

    it('should handle author filter option', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          date: '2024-01-01',
          message: 'Test commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          refs: 'HEAD -> main',
          body: '',
          hash_abbrev: 'abc123',
          tree: 'def456',
          tree_abbrev: 'def456',
          parent: 'ghi789',
          parent_abbrev: 'ghi789'
        }
      ];

      mockGit.log.mockResolvedValue({ all: mockCommits });
      mockGit.diff.mockResolvedValue('');
      mockGit.branch.mockResolvedValue({ all: ['main'] });
      mockGit.raw.mockResolvedValue('');

      const result = await gitService.getCommits({ author: 'Test Author' });
      
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
      expect(result.commits.length).toBeGreaterThan(0);
    });

    it('should handle private method errors gracefully', async () => {
      const mockCommits = [
        {
          hash: 'abc123',
          date: '2024-01-01',
          message: 'Test commit',
          author_name: 'Test Author',
          author_email: 'test@example.com',
          refs: 'HEAD -> main',
          body: '',
          hash_abbrev: 'abc123',
          tree: 'def456',
          tree_abbrev: 'def456',
          parent: 'ghi789',
          parent_abbrev: 'ghi789'
        }
      ];

      mockGit.log.mockResolvedValue({ all: mockCommits });
      mockGit.diff.mockRejectedValue(new Error('Diff error'));
      mockGit.branch.mockRejectedValue(new Error('Branch error'));
      mockGit.raw.mockRejectedValue(new Error('Tag error'));

      const result = await gitService.getCommits();
      
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
      expect(result.commits.length).toBeGreaterThan(0);
      expect(result.commits[0].files).toEqual([]);
      expect(result.commits[0].branches).toEqual([]);
      expect(result.commits[0].tags).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      mockGit.log.mockRejectedValue('String error');

      await expect(gitService.getCommits()).rejects.toThrow('Failed to get commits: Unknown error');
    });
  });

  describe('getTags', () => {
    it('should return an array of tags', async () => {
      const mockTags = ['v1.0.0', 'v1.1.0', 'v2.0.0'];
      mockGit.tags.mockResolvedValue({ all: mockTags });

      const tags = await gitService.getTags();
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toEqual(mockTags);
    });

    it('should handle git tags errors', async () => {
      mockGit.tags.mockRejectedValue(new Error('Git tags error'));

      await expect(gitService.getTags()).rejects.toThrow('Git tags error');
    });

    it('should handle empty tags list', async () => {
      mockGit.tags.mockResolvedValue({ all: [] });

      const tags = await gitService.getTags();
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBe(0);
    });
  });

  describe('getBranches', () => {
    it('should return an array of branches', async () => {
      const mockBranches = ['main', 'develop', 'feature/test'];
      mockGit.branch.mockResolvedValue({ all: mockBranches });

      const branches = await gitService.getBranches();
      
      expect(Array.isArray(branches)).toBe(true);
      expect(branches).toEqual(mockBranches);
    });

    it('should handle git branch errors', async () => {
      mockGit.branch.mockRejectedValue(new Error('Git branch error'));

      await expect(gitService.getBranches()).rejects.toThrow('Git branch error');
    });

    it('should handle empty branches list', async () => {
      mockGit.branch.mockResolvedValue({ all: [] });

      const branches = await gitService.getBranches();
      
      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBe(0);
    });
  });

  describe('getDiff', () => {
    it('should return diff for a commit', async () => {
      const mockDiff = 'diff --git a/file.js b/file.js\nindex 123..456 100644\n--- a/file.js\n+++ b/file.js\n@@ -1,3 +1,4 @@\n line1\n+line2\n line3';
      mockGit.diff.mockResolvedValue(mockDiff);

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff[0]).toHaveProperty('file');
      expect(diff[0]).toHaveProperty('additions');
      expect(diff[0]).toHaveProperty('deletions');
      expect(diff[0]).toHaveProperty('changes');
    });

    it('should handle git diff errors', async () => {
      mockGit.diff.mockRejectedValue(new Error('Git diff error'));

      await expect(gitService.getDiff('abc123')).rejects.toThrow('Git diff error');
    });

    it('should handle empty diff', async () => {
      mockGit.diff.mockResolvedValue('');

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBe(0);
    });

    it('should parse complex diff with multiple files', async () => {
      const mockDiff = `diff --git a/file1.js b/file1.js
index 123..456 100644
--- a/file1.js
+++ b/file1.js
@@ -1,3 +1,4 @@
 line1
+line2
 line3
diff --git a/file2.js b/file2.js
index 789..012 100644
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 old1
+new1
 old2`;
      mockGit.diff.mockResolvedValue(mockDiff);

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBe(2);
      expect(diff[0].file).toBe('file1.js');
      expect(diff[1].file).toBe('file2.js');
    });

    it('should handle diff with no file match', async () => {
      const mockDiff = 'diff --git a/ b/\nindex 123..456 100644\n--- a/\n+++ b/';
      mockGit.diff.mockResolvedValue(mockDiff);

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff[0].file).toBe('');
    });

    it('should handle diff with context lines and headers', async () => {
      const mockDiff = `diff --git a/file.js b/file.js
index 123..456 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,4 @@
 line1
+line2
 line3
 unchanged line`;
      mockGit.diff.mockResolvedValue(mockDiff);

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
    });

    it('should handle diff with only deletions', async () => {
      const mockDiff = `diff --git a/file.js b/file.js
index 123..456 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,2 @@
 line1
-line2
 line3`;
      mockGit.diff.mockResolvedValue(mockDiff);

      const diff = await gitService.getDiff('abc123');
      
      expect(Array.isArray(diff)).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff[0].deletions).toBeGreaterThan(0);
    });
  });

  describe('getCommit', () => {
    it('should return a single commit', async () => {
      const mockCommit = {
        hash: 'abc123',
        date: '2024-01-01',
        message: 'Test commit',
        author_name: 'Test Author',
        author_email: 'test@example.com',
        refs: 'HEAD -> main',
        body: '',
        hash_abbrev: 'abc123',
        tree: 'def456',
        tree_abbrev: 'def456',
        parent: 'ghi789',
        parent_abbrev: 'ghi789'
      };

      mockGit.log.mockResolvedValue({ all: [mockCommit] });

      const commit = await gitService.getCommit('abc123');
      
      expect(commit).toHaveProperty('hash', 'abc123');
      expect(commit).toHaveProperty('author', 'Test Author');
      expect(commit).toHaveProperty('date', '2024-01-01');
      expect(commit).toHaveProperty('message', 'Test commit');
    });

    it('should handle commit not found', async () => {
      mockGit.log.mockResolvedValue({ all: [] });

      await expect(gitService.getCommit('nonexistent')).rejects.toThrow('Commit not found');
    });

    it('should handle git log errors', async () => {
      mockGit.log.mockRejectedValue(new Error('Git error'));

      await expect(gitService.getCommit('abc123')).rejects.toThrow('Git error');
    });

    it('should handle non-Error exceptions', async () => {
      mockGit.log.mockRejectedValue('String error');

      await expect(gitService.getCommit('abc123')).rejects.toThrow('Failed to get commit: Unknown error');
    });
  });

  describe('getBlame', () => {
    it('should return blame information for a file', async () => {
      const mockBlame = 'abc123 1 1 1\nauthor Test Author\n\tline1';
      mockGit.raw.mockResolvedValue(mockBlame);

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBeGreaterThan(0);
      expect(blame[0]).toHaveProperty('hash');
      expect(blame[0]).toHaveProperty('author');
      expect(blame[0]).toHaveProperty('line');
      expect(blame[0]).toHaveProperty('content');
    });

    it('should handle git blame errors', async () => {
      mockGit.raw.mockRejectedValue(new Error('Git blame error'));

      await expect(gitService.getBlame('test.js')).rejects.toThrow('Git blame error');
    });

    it('should handle empty blame', async () => {
      mockGit.raw.mockResolvedValue('');

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      mockGit.raw.mockRejectedValue('String error');

      await expect(gitService.getBlame('test.js')).rejects.toThrow('Failed to get blame: Unknown error');
    });

    it('should parse blame with author-time', async () => {
      const mockBlame = `abc123 1 1 1
author Test Author
author-time 1640995200
\tline1`;
      mockGit.raw.mockResolvedValue(mockBlame);

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBeGreaterThan(0);
      expect(blame[0]).toHaveProperty('date');
    });

    it('should parse blame without author-time', async () => {
      const mockBlame = `abc123 1 1 1
author Test Author
\tline1`;
      mockGit.raw.mockResolvedValue(mockBlame);

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBeGreaterThan(0);
      expect(blame[0]).toHaveProperty('date');
    });

    it('should handle malformed blame data', async () => {
      const mockBlame = 'invalid blame data without proper format';
      mockGit.raw.mockResolvedValue(mockBlame);

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBe(0);
    });

    it('should parse blame with multiple lines and complete properly', async () => {
      const mockBlame = `abc123 1 1 1
author Test Author
author-time 1640995200
\tline1
def456 2 2 1
author Another Author
\tline2`;
      mockGit.raw.mockResolvedValue(mockBlame);

      const blame = await gitService.getBlame('test.js');
      
      expect(Array.isArray(blame)).toBe(true);
      expect(blame.length).toBe(2);
      expect(blame[0].hash).toBe('abc123');
      expect(blame[1].hash).toBe('def456');
    });
  });

  describe('Error handling', () => {
    it('should handle non-Error exceptions in getTags', async () => {
      mockGit.tags.mockRejectedValue('String error');

      await expect(gitService.getTags()).rejects.toThrow('Failed to get tags: Unknown error');
    });

    it('should handle non-Error exceptions in getBranches', async () => {
      mockGit.branch.mockRejectedValue('String error');

      await expect(gitService.getBranches()).rejects.toThrow('Failed to get branches: Unknown error');
    });

    it('should handle non-Error exceptions in getDiff', async () => {
      mockGit.diff.mockRejectedValue('String error');

      await expect(gitService.getDiff('abc123')).rejects.toThrow('Failed to get diff: Unknown error');
    });
  });
});
