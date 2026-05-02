import { getCommitImpact } from '../backend/impact';
import type { GitService, Commit } from '../backend/gitService';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: over.hash ?? 'h',
    shortHash: 'h',
    author: 'a',
    authorEmail: 'a@example.com',
    date: '2026-05-01T00:00:00Z',
    message: 'm',
    subject: 'm',
    body: '',
    parents: [],
    branches: [],
    tags: [],
    isMerge: false,
    ...over
  };
}

interface FakeOpts {
  diff?: Array<{ file: string }>;
  files?: Record<string, string>;
  related?: Record<string, Commit[]>;
}

function fakeGit(opts: FakeOpts): GitService {
  return {
    getDiff: async (_hash: string) =>
      (opts.diff ?? []).map((d) => ({
        file: d.file,
        status: 'modified' as const,
        additions: 0,
        deletions: 0,
        changes: ''
      })),
    getFileAtCommit: async (_h: string, file: string) => {
      if (!opts.files || !(file in opts.files)) throw new Error('missing');
      return opts.files[file];
    },
    getCommits: async (q: { file?: string }) => ({
      commits: q.file && opts.related?.[q.file] ? opts.related[q.file] : [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    })
  } as unknown as GitService;
}

describe('getCommitImpact', () => {
  it('returns files, modules and dedup’d related commits', async () => {
    const svc = fakeGit({
      diff: [
        { file: 'src/a.ts' },
        { file: 'src/b.ts' },
        { file: 'README.md' }
      ],
      files: {
        'src/a.ts': "import {x} from './b';\nimport './b'; // duplicate normalized\n",
        'src/b.ts': 'export const x = 1;\n'
      },
      related: {
        'src/a.ts': [
          commit({ hash: 'r1', subject: 'older', date: '2026-04-01' }),
          commit({ hash: 'r2', subject: 'newer', date: '2026-04-15' })
        ],
        'src/b.ts': [commit({ hash: 'r1', subject: 'older', date: '2026-04-01' })],
        'README.md': []
      }
    });

    const result = await getCommitImpact(svc, 'h');
    expect(result.files).toEqual(['src/a.ts', 'src/b.ts', 'README.md']);
    expect(result.modules).toEqual(expect.arrayContaining(['src', '(root)']));
    expect(result.dependencyRipple).toEqual([
      { from: 'src/a.ts', to: 'src/b' }
    ]);
    expect(result.relatedCommits.map((c) => c.hash)).toEqual(['r2', 'r1']);
  });

  it('skips non-relative imports and unsupported file extensions', async () => {
    const svc = fakeGit({
      diff: [{ file: 'src/x.ts' }, { file: 'docs/notes.md' }],
      files: {
        'src/x.ts': "import 'react'; require('lodash');\n",
        'docs/notes.md': "import './should-be-ignored';"
      },
      related: {}
    });
    const result = await getCommitImpact(svc, 'h');
    expect(result.dependencyRipple).toEqual([]);
  });

  it('survives missing file content gracefully', async () => {
    const svc = fakeGit({
      diff: [{ file: 'src/missing.ts' }],
      files: {},
      related: {}
    });
    const result = await getCommitImpact(svc, 'h');
    expect(result.dependencyRipple).toEqual([]);
    expect(result.files).toEqual(['src/missing.ts']);
  });

  it('caps the number of related commits at the documented limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      commit({ hash: 'r' + i, subject: 's' + i, date: `2026-04-${String(i + 1).padStart(2, '0')}` })
    );
    const svc = fakeGit({
      diff: [{ file: 'src/x.ts' }],
      files: { 'src/x.ts': 'export {};' },
      related: { 'src/x.ts': many }
    });
    const result = await getCommitImpact(svc, 'h');
    expect(result.relatedCommits).toHaveLength(10);
  });

  it('excludes the same commit from its related list', async () => {
    const svc = fakeGit({
      diff: [{ file: 'src/x.ts' }],
      files: { 'src/x.ts': '' },
      related: {
        'src/x.ts': [
          commit({ hash: 'self', subject: 'me', date: '2026-04-01' }),
          commit({ hash: 'other', subject: 'they', date: '2026-04-02' })
        ]
      }
    });
    const result = await getCommitImpact(svc, 'self');
    expect(result.relatedCommits.map((c) => c.hash)).toEqual(['other']);
  });

  it('groups single-file diffs in (root) when there is no directory', async () => {
    const svc = fakeGit({ diff: [{ file: 'foo.txt' }], files: {}, related: {} });
    const result = await getCommitImpact(svc, 'h');
    expect(result.modules).toEqual(['(root)']);
  });

  it('skips related lookup when getCommits rejects', async () => {
    const svc = {
      getDiff: async () => [
        { file: 'src/x.ts', status: 'modified', additions: 0, deletions: 0, changes: '' }
      ],
      getFileAtCommit: async () => '',
      getCommits: async () => {
        throw new Error('boom');
      }
    } as unknown as GitService;
    const result = await getCommitImpact(svc, 'h');
    expect(result.relatedCommits).toEqual([]);
  });
});
