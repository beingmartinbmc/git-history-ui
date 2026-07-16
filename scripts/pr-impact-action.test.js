const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pkg = require('../package.json');
const { cleanRef, resolveRefs, resolveSafePath, runAction } = require('./pr-impact-action.js');

test('explicit action inputs take precedence over event metadata', () => {
  assert.deepEqual(
    resolveRefs(
      { base: 'refs/remotes/origin/main', head: 'feature' },
      { pull_request: { base: { sha: 'base-event' }, head: { sha: 'head-event' } } }
    ),
    { base: 'refs/remotes/origin/main', head: 'feature' }
  );
});

test('pull request events resolve immutable fork-safe commit SHAs', () => {
  assert.deepEqual(
    resolveRefs(
      {},
      {
        pull_request: {
          base: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: 'upstream/repo' } },
          head: { ref: 'feature', sha: 'b'.repeat(40), repo: { full_name: 'fork/repo' } }
        }
      }
    ),
    { base: 'a'.repeat(40), head: 'b'.repeat(40) }
  );
});

test('rejects option-like and newline refs', () => {
  assert.equal(cleanRef('--exec=bad'), '');
  assert.equal(cleanRef('main\nbad'), '');
  assert.throws(() => resolveRefs({}, {}), /Could not resolve base\/head/);
  assert.throws(() => resolveSafePath('report.md\nfiles-changed=999', ''), /control characters/);
});

test('runs the pinned package version once while producing markdown and JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghui-action-test-'));
  const calls = [];
  const spawn = (_command, args) => {
    calls.push(args);
    const output = args[args.indexOf('--output') + 1];
    const jsonOutput = args[args.indexOf('--json-output') + 1];
    fs.writeFileSync(output, '# impact\n');
    fs.writeFileSync(
      jsonOutput,
      JSON.stringify({ summary: { commits: 1, files: 2, additions: 3, deletions: 4 } })
    );
    return { status: 0, stdout: '', stderr: '' };
  };

  try {
    runAction(
      {
        INPUT_BASE: 'main',
        INPUT_HEAD: 'feature',
        INPUT_FORMAT: 'markdown',
        INPUT_WORKING_DIRECTORY: tmp,
        RUNNER_TEMP: tmp,
        GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
        GITHUB_OUTPUT: path.join(tmp, 'output.txt')
      },
      spawn
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes(`git-history-ui@${pkg.version}`));
    assert.ok(calls[0].includes('--json-output'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
