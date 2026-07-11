import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { createDemoRepository } from '../backend/demoRepo';
import { GitService } from '../backend/gitService';
import {
  buildCommitReport,
  buildRangeReport,
  escapeMarkdown,
  formatReportMarkdown
} from '../backend/report';
import { makeBigRepo, makeRepo } from './helpers/repo';

describe('portable investigation reports', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'ghui-report-test-'));
  const directory = createDemoRepository({ directory: path.join(parent, 'demo'), reset: true });
  const git = new GitService(directory);

  afterAll(() => rmSync(parent, { recursive: true, force: true }));

  it('handles root, merge, rename, binary, and empty-range metadata without patches', async () => {
    const commits = (await git.getCommits({ pageSize: 50 })).commits;
    const bySubject = (subject: string) => commits.find((commit) => commit.subject === subject)!;

    const root = await buildCommitReport(git, commits[commits.length - 1].hash);
    expect(root.summary.files).toBeGreaterThan(0);
    expect(root.files.every((file) => !('changes' in file))).toBe(true);

    const merge = await buildCommitReport(git, bySubject('merge(ui): ship timeline (#42)').hash);
    expect(merge.target.type).toBe('commit');
    expect(merge.portableUrl).toContain('git-history-ui://open?v=1');

    const rename = await buildCommitReport(
      git,
      bySubject('refactor(core): move orbit into domain').hash
    );
    expect(rename.files).toContainEqual(
      expect.objectContaining({
        status: 'renamed',
        oldFile: 'src/core.ts',
        file: 'src/domain/orbit.ts'
      })
    );

    const binary = await buildCommitReport(
      git,
      bySubject('perf(assets): add compact orbit preview').hash
    );
    expect(binary.files).toContainEqual(
      expect.objectContaining({ file: 'assets/orbit.bin', status: 'binary' })
    );

    const empty = await buildRangeReport(git, 'main', 'main');
    expect(empty.summary).toMatchObject({ commits: 0, files: 0, additions: 0, deletions: 0 });
    expect(empty.files).toEqual([]);
  });

  it('escapes untrusted Markdown in subjects, authors, and file names', async () => {
    const repo = makeRepo('ghui-report-escape-');
    try {
      repo.git(['remote', 'add', 'origin', 'https://github.com/acme/safe.git']);
      const hash = repo.commit('docs/a_[x].md', 'safe\n', 'feat: [unsafe](x) | <tag>');
      const report = await buildCommitReport(new GitService(repo.dir), hash);
      const markdown = formatReportMarkdown(report);
      expect(markdown).toContain('\\[unsafe\\]\\(x\\) \\| \\<tag\\>');
      expect(markdown).toContain('docs/a\\_\\[x\\]\\.md');
      expect(markdown).not.toContain('[unsafe](x)');
      expect(escapeMarkdown('a\n# b')).toBe('a \\# b');
    } finally {
      repo.cleanup();
    }
  });

  it('reports the full commit count while bounding related commit details', async () => {
    const repo = makeBigRepo(106, 'ghui-report-count-');
    try {
      const from = repo.git(['rev-parse', 'HEAD~105']).trim();
      const to = repo.git(['rev-parse', 'HEAD']).trim();
      const report = await buildRangeReport(new GitService(repo.dir), from, to);
      expect(report.summary.commits).toBe(105);
      expect(report.relatedCommits).toHaveLength(100);
    } finally {
      repo.cleanup();
    }
  });
});
