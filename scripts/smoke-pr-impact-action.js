#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveRefs } = require('./pr-impact-action');

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ghui-action-smoke-'));
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Smoke',
  GIT_AUTHOR_EMAIL: 'smoke@example.test',
  GIT_COMMITTER_NAME: 'Smoke',
  GIT_COMMITTER_EMAIL: 'smoke@example.test'
};
const git = (args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();

try {
  git(['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'chore: base']);
  git(['checkout', '-q', '-b', 'feature']);
  fs.writeFileSync(path.join(repo, 'feature.txt'), 'feature\n');
  git(['add', 'feature.txt']);
  git(['commit', '-q', '-m', 'feat: smoke']);
  const refs = resolveRefs({ base: 'main', head: 'feature' }, {});
  const output = path.join(repo, 'impact.json');
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'dist', 'cli.js'),
      '--cwd',
      repo,
      'pr-impact',
      '--base',
      refs.base,
      '--head',
      refs.head,
      '--format',
      'json',
      '--output',
      output
    ],
    { cwd: repo, env, stdio: 'pipe' }
  );
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (report.summary.files !== 1 || report.summary.commits !== 1) {
    throw new Error(`unexpected smoke report: ${JSON.stringify(report.summary)}`);
  }
  console.log('PR impact action smoke passed.');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
