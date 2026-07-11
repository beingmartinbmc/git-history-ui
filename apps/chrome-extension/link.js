(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GhuiLink = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function parseGitHubUrl(raw) {
    var url;
    try {
      url = new URL(raw);
    } catch (_) {
      return null;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    var parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    var owner = parts[0];
    var repo = parts[1].replace(/\.git$/i, '');
    if (!safeSegment(owner) || !safeSegment(repo)) return null;
    var target = { kind: 'history' };
    if (parts[2] === 'pull' && /^\d+$/.test(parts[3] || '')) {
      target = { kind: 'pr', number: parts[3] };
    } else if (parts[2] === 'commit' && /^[0-9a-f]{4,40}$/i.test(parts[3] || '')) {
      target = { kind: 'commit', sha: parts[3] };
    } else if (parts[2] === 'commits') {
      target = { kind: 'history' };
    }
    return {
      repoUrl: 'https://github.com/' + owner + '/' + repo,
      target: target,
    };
  }

  function serializeDeepLink(parsed) {
    var params = new URLSearchParams({
      v: '1',
      repo: parsed.repoUrl,
      view: parsed.target.kind === 'pr' ? 'grouped' : 'history',
    });
    if (parsed.target.kind === 'commit') params.set('at', parsed.target.sha);
    if (parsed.target.kind === 'pr') params.set('pr', parsed.target.number);
    return 'git-history-ui://open?' + params.toString();
  }

  function normalizeHostedUrl(raw) {
    if (!raw || !String(raw).trim()) return '';
    try {
      var url = new URL(String(raw).trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      url.search = '';
      return url.toString().replace(/\/$/, '');
    } catch (_) {
      return '';
    }
  }

  function serializeHostedLink(parsed, hostedUrl) {
    var base = normalizeHostedUrl(hostedUrl);
    if (!base) return '';
    var url = new URL(base + '/');
    url.searchParams.set('repo', parsed.repoUrl);
    if (parsed.target.kind === 'commit') url.searchParams.set('commit', parsed.target.sha);
    if (parsed.target.kind === 'pr') url.searchParams.set('pr', parsed.target.number);
    return url.toString();
  }

  function safeSegment(value) {
    return /^[A-Za-z0-9_.-]+$/.test(value) && value !== '.' && value !== '..';
  }

  return {
    normalizeHostedUrl: normalizeHostedUrl,
    parseGitHubUrl: parseGitHubUrl,
    serializeDeepLink: serializeDeepLink,
    serializeHostedLink: serializeHostedLink,
  };
});
