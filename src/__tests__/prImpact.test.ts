import { renameSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { GitService } from '../backend/gitService';
import { buildPrImpactReport, formatPrImpactMarkdown } from '../backend/report';
import { makeRepo } from './helpers/repo';

describe('PR impact report', () => {
  it('reports add, delete, rename, binary, and merge history from the merge base', async () => {
    const repo = makeRepo('ghui-pr-impact-');
    try {
      repo.commit('keep.txt', 'base\n', 'chore: initial');
      repo.commit('delete.txt', 'delete me\n', 'chore: add deletion fixture');
      repo.commit('rename-old.txt', 'rename me\n', 'chore: add rename fixture');
      repo.git(['checkout', '-q', '-b', 'feature']);
      repo.commit('added.txt', 'new\n', 'feat: add file');
      unlinkSync(path.join(repo.dir, 'delete.txt'));
      repo.git(['add', '-A']);
      repo.git(['commit', '-q', '-m', 'feat: delete file']);
      renameSync(path.join(repo.dir, 'rename-old.txt'), path.join(repo.dir, 'rename-new.txt'));
      repo.git(['add', '-A']);
      repo.git(['commit', '-q', '-m', 'feat: rename file']);
      writeFileSync(path.join(repo.dir, 'binary.bin'), Buffer.from([0, 1, 2, 0, 255]));
      repo.git(['add', 'binary.bin']);
      repo.git(['commit', '-q', '-m', 'feat: add binary']);

      repo.git(['checkout', '-q', 'main']);
      repo.commit('main.txt', 'main\n', 'chore: advance base');
      repo.git(['checkout', '-q', 'feature']);
      repo.git(['merge', '--no-ff', '-q', 'main', '-m', 'merge main']);

      const report = await buildPrImpactReport(new GitService(repo.dir), 'main', 'feature');
      expect(report.comparison).toMatchObject({ base: 'main', head: 'feature' });
      expect(report.summary.commits).toBeGreaterThanOrEqual(5);
      expect(report.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'added.txt', status: 'added' }),
          expect.objectContaining({ file: 'delete.txt', status: 'deleted' }),
          expect.objectContaining({
            file: 'rename-new.txt',
            oldFile: 'rename-old.txt',
            status: 'renamed'
          }),
          expect.objectContaining({ file: 'binary.bin', status: 'binary' })
        ])
      );
      expect(formatPrImpactMarkdown(report)).toContain('git-history-ui pr-impact: main...feature');
    } finally {
      repo.cleanup();
    }
  });

  it('explains that shallow clones need full history', async () => {
    const git = {
      runRaw: jest
        .fn()
        .mockRejectedValueOnce(new Error('no merge base'))
        .mockResolvedValueOnce('true\n')
    } as unknown as GitService;
    await expect(buildPrImpactReport(git, 'main', 'feature')).rejects.toThrow(
      'Fetch full history (actions/checkout fetch-depth: 0)'
    );
  });
});
