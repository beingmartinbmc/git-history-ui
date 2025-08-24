import { GitService } from '../backend/gitService';

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(() => {
    gitService = new GitService();
  });

  describe('getCommits', () => {
    it('should return an array of commits', async () => {
      const commits = await gitService.getCommits({ limit: 5 });
      expect(Array.isArray(commits)).toBe(true);
    });

    it('should respect the limit parameter', async () => {
      const commits = await gitService.getCommits({ limit: 3 });
      expect(commits.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getTags', () => {
    it('should return an array of tags', async () => {
      const tags = await gitService.getTags();
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('getBranches', () => {
    it('should return an array of branches', async () => {
      const branches = await gitService.getBranches();
      expect(Array.isArray(branches)).toBe(true);
    });
  });
});
