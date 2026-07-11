const assert = require('node:assert/strict');
const test = require('node:test');
const { cleanRef, resolveRefs, resolveSafePath } = require('./pr-impact-action.js');

test('explicit action inputs take precedence over event metadata', () => {
  assert.deepEqual(
    resolveRefs(
      { base: 'refs/remotes/origin/main', head: 'feature' },
      { pull_request: { base: { sha: 'base-event' }, head: { sha: 'head-event' } } },
    ),
    { base: 'refs/remotes/origin/main', head: 'feature' },
  );
});

test('pull request events resolve immutable fork-safe commit SHAs', () => {
  assert.deepEqual(
    resolveRefs(
      {},
      {
        pull_request: {
          base: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: 'upstream/repo' } },
          head: { ref: 'feature', sha: 'b'.repeat(40), repo: { full_name: 'fork/repo' } },
        },
      },
    ),
    { base: 'a'.repeat(40), head: 'b'.repeat(40) },
  );
});

test('rejects option-like and newline refs', () => {
  assert.equal(cleanRef('--exec=bad'), '');
  assert.equal(cleanRef('main\nbad'), '');
  assert.throws(() => resolveRefs({}, {}), /Could not resolve base\/head/);
  assert.throws(() => resolveSafePath('report.md\nfiles-changed=999', ''), /control characters/);
});
