/**
 * Content script for git-history-ui Chrome extension.
 *
 * Injects a "Open in git-history-ui" button on:
 *   - github.com/<owner>/<repo>/pull/<n>
 *   - github.com/<owner>/<repo>/commit/<sha>
 *   - github.com/<owner>/<repo>/commits/...
 *
 * Handles GitHub SPA navigation via MutationObserver + URL polling
 * so the button re-injects when navigating between pages without
 * a full page load.
 */

(function () {
  let lastUrl = '';

  function tryInject() {
    if (location.href === lastUrl && document.querySelector('#ghui-open-btn')) return;
    lastUrl = location.href;

    // Remove stale button from previous SPA navigation
    const old = document.querySelector('#ghui-open-btn');
    if (old) old.remove();

    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/(pull|commit|commits)\/(.+))?/);
    if (!m) return;
    const [, owner, repo, type, ref] = m;
    if (!owner || !repo) return;

    const repoUrl = 'https://github.com/' + owner + '/' + repo + '.git';
    const target =
      type === 'commit'
        ? { kind: 'commit', sha: (ref || '').split('/')[0] }
        : type === 'pull'
          ? { kind: 'pr', number: parseInt(ref || '0', 10) }
          : { kind: 'commits' };

    injectButton(repoUrl, target);
  }

  function injectButton(repoUrl, target) {
    const host = findInjectionPoint();
    if (!host) return;

    const btn = document.createElement('button');
    btn.id = 'ghui-open-btn';
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    btn.textContent = 'Open in git-history-ui';
    btn.style.cssText =
      'margin-left:6px;background:#6366f1;color:#fff;border:0;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;';
    btn.addEventListener('click', () => openInGhui(repoUrl, target));
    host.appendChild(btn);
  }

  function findInjectionPoint() {
    return (
      document.querySelector('.gh-header-actions') ||
      document.querySelector('.pagehead-actions') ||
      document.querySelector('[data-testid="issue-header-actions"]') ||
      null
    );
  }

  function openInGhui(repoUrl, target) {
    chrome.storage.sync.get(['hostedUrl'], function (cfg) {
      var hosted = (cfg && cfg.hostedUrl) || '';
      var protoUrl =
        'git-history-ui://open?repo=' +
        encodeURIComponent(repoUrl) +
        (target.sha ? '&at=' + target.sha : '') +
        (target.number ? '&pr=' + target.number : '');
      var fallback = hosted
        ? hosted.replace(/\/$/, '') +
          '/?repo=' +
          encodeURIComponent(repoUrl) +
          (target.sha ? '&commit=' + target.sha : '') +
          (target.number ? '&pr=' + target.number : '')
        : 'https://github.com/beingmartinbmc/git-history-ui#open-in-git-history-ui';
      var opened = false;
      window.addEventListener('blur', function () { opened = true; }, { once: true });
      window.location.href = protoUrl;
      setTimeout(function () {
        if (!opened) window.open(fallback, '_blank');
      }, 800);
    });
  }

  // Initial injection
  tryInject();

  // Re-inject on GitHub SPA navigation (turbo drive / pjax / React transitions)
  new MutationObserver(function () {
    if (location.href !== lastUrl) tryInject();
  }).observe(document.body, { childList: true, subtree: true });
})();
