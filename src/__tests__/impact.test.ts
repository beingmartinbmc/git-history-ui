import { getCommitImpact } from '../backend/impact';
import { GitService, type Commit } from '../backend/gitService';
import { writeFileSync } from 'fs';
import { makeRepo } from './helpers/repo';

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
    getDiffMeta: async (_hash: string) => ({
      files: (opts.diff ?? []).map((d) => ({
        file: d.file,
        status: 'modified',
        additions: 0,
        deletions: 0
      })),
      totalLines: 0
    }),
    getFileAtCommit: async (_h: string, file: string) => {
      if (!opts.files || !(file in opts.files)) throw new Error('missing');
      return opts.files[file];
    },
    getCommitsForFiles: async (files: string[]) =>
      files.flatMap((file) => opts.related?.[file] ?? [])
  } as unknown as GitService;
}

describe('getCommitImpact', () => {
  it('returns files, modules and dedup’d related commits', async () => {
    const svc = fakeGit({
      diff: [{ file: 'src/a.ts' }, { file: 'src/b.ts' }, { file: 'README.md' }],
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
    expect(result.dependencyRipple).toEqual([{ from: 'src/a.ts', to: 'src/b' }]);
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

  it('skips related lookup when getCommitsForFiles rejects', async () => {
    const svc = {
      getDiffMeta: async () => ({
        files: [{ file: 'src/x.ts', status: 'modified', additions: 0, deletions: 0 }],
        totalLines: 0
      }),
      getFileAtCommit: async () => '',
      getCommitsForFiles: async () => {
        throw new Error('boom');
      }
    } as unknown as GitService;
    const result = await getCommitImpact(svc, 'h');
    expect(result.relatedCommits).toEqual([]);
  });
});

describe('getCommitImpact dependents (real repo)', () => {
  it('finds unchanged files that import the changed ones, and nothing else', async () => {
    const repo = makeRepo('ghui-impact-');
    try {
      repo.commit('src/util.ts', 'export const u = 1;\n', 'util');
      repo.commit('src/lib/index.ts', 'export const l = 1;\n', 'lib');
      repo.commit('src/a.ts', "import { u } from './util';\n", 'a imports util');
      repo.commit('src/b.ts', "import { l } from './lib';\n", 'b imports lib/index');
      repo.commit('src/barrel.ts', "export * from './util.js';\n", 'barrel re-exports util');
      repo.commit('src/deep/c.ts', "const l = require('../lib/index');\n", 'c requires lib/index');
      repo.commit('src/d.ts', "import { x } from './other';\nimport 'util';\n", 'd: unrelated');
      repo.commit('docs/n.md', "import './util';\n", 'docs mention');
      repo.commit('src/e.ts', "import { u } from './util';\n", 'e imports util');
      // One commit touches util, lib/index and e; e imports util but is itself changed.
      writeFileSync(`${repo.dir}/src/util.ts`, 'export const u = 3;\n');
      writeFileSync(`${repo.dir}/src/lib/index.ts`, 'export const l = 3;\n');
      writeFileSync(`${repo.dir}/src/e.ts`, "import { u } from './util';\n// touched\n");
      repo.git(['add', '-A']);
      repo.git(['commit', '-q', '-m', 'change util, lib and e']);
      const hash = repo.git(['rev-parse', 'HEAD']).trim();

      const impact = await getCommitImpact(new GitService(repo.dir), hash);
      expect(impact.files.sort()).toEqual(['src/e.ts', 'src/lib/index.ts', 'src/util.ts']);
      const key = (d: { from: string; to: string }) => `${d.from} -> ${d.to}`;
      expect(impact.dependents.map(key).sort()).toEqual([
        'src/a.ts -> src/util.ts',
        'src/b.ts -> src/lib/index.ts',
        'src/barrel.ts -> src/util.ts',
        'src/deep/c.ts -> src/lib/index.ts'
      ]);
    } finally {
      repo.cleanup();
    }
  });

  it('returns no dependents when nothing imports the changed files', async () => {
    const repo = makeRepo('ghui-impact-');
    try {
      repo.commit('src/a.ts', 'export {};\n', 'a');
      const hash = repo.commit('src/solo.ts', 'export {};\n', 'solo');
      expect((await getCommitImpact(new GitService(repo.dir), hash)).dependents).toEqual([]);
    } finally {
      repo.cleanup();
    }
  });
});
