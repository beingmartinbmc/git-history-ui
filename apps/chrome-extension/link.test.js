const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeHostedUrl,
  parseGitHubUrl,
  serializeDeepLink,
  serializeHostedLink,
} = require('./link.js');

test('parses GitHub repository, PR, commit, and commits URLs', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/acme/widgets/pull/42'), {
    repoUrl: 'https://github.com/acme/widgets',
    target: { kind: 'pr', number: '42' },
  });
  assert.deepEqual(parseGitHubUrl('https://github.com/acme/widgets/commit/a1b2c3d4'), {
    repoUrl: 'https://github.com/acme/widgets',
    target: { kind: 'commit', sha: 'a1b2c3d4' },
  });
  assert.equal(parseGitHubUrl('https://gitlab.com/acme/widgets'), null);
  assert.equal(parseGitHubUrl('https://github.com/acme/%2Fescape'), null);
});

test('serializes encoded versioned protocol links', () => {
  const parsed = parseGitHubUrl('https://github.com/acme/widgets/pull/42');
  const url = new URL(serializeDeepLink(parsed));
  assert.equal(url.protocol, 'git-history-ui:');
  assert.equal(url.searchParams.get('repo'), 'https://github.com/acme/widgets');
  assert.equal(url.searchParams.get('view'), 'grouped');
  assert.equal(url.searchParams.get('pr'), '42');
});

test('accepts only configured http(s) hosted instances', () => {
  assert.equal(normalizeHostedUrl('javascript:alert(1)'), '');
  assert.equal(normalizeHostedUrl('https://example.test/base?q=secret#x'), 'https://example.test/base');
  const parsed = parseGitHubUrl('https://github.com/acme/widgets/commit/a1b2c3d4');
  const hosted = new URL(serializeHostedLink(parsed, 'https://example.test/base'));
  assert.equal(hosted.origin, 'https://example.test');
  assert.equal(hosted.searchParams.get('repo'), 'https://github.com/acme/widgets');
  assert.equal(hosted.searchParams.get('commit'), 'a1b2c3d4');
});
