/**
 * Content script for git-history-ui Chrome extension.
 *
 * Injects a "Open in git-history-ui" button on:
 *   - github.com/<owner>/<repo>/pull/<n>
 *   - github.com/<owner>/<repo>/commit/<sha>
 *   - github.com/<owner>/<repo>/commits/...
 *
 * The button:
 *   1. Tries the custom protocol git-history-ui://<repo-url>?at=<sha-or-pr>
 *      (registered by the CLI's post-install step on supporting platforms).
 *   2. Falls back to a configurable hosted instance URL stored in chrome.storage.
 */

(function () {
  const m = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/(pull|commit|commits)\/(.+))?/);
  if (!m) return;
  const [, owner, repo, type, ref] = m;
  if (!owner || !repo) return;

  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  const target =
    type === 'commit'
      ? { kind: 'commit', sha: (ref || '').split('/')[0] }
      : type === 'pull'
      ? { kind: 'pr', number: parseInt(ref || '0', 10) }
      : { kind: 'commits' };

  injectButton(repoUrl, target);

  function injectButton(repoUrl, target) {
    if (document.querySelector('#ghui-open-btn')) return;
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
      document.querySelector('header')
    );
  }

  async function openInGhui(repoUrl, target) {
    chrome.storage.sync.get(['hostedUrl'], (cfg) => {
      const hosted = (cfg && cfg.hostedUrl) || '';
      const protoUrl = `git-history-ui://open?repo=${encodeURIComponent(repoUrl)}${
        target.sha ? `&at=${target.sha}` : ''
      }${target.number ? `&pr=${target.number}` : ''}`;
      // Try custom protocol; if nothing happens within 800ms, fall back.
      const fallback = hosted
        ? `${hosted.replace(/\/$/, '')}/?repo=${encodeURIComponent(repoUrl)}${
            target.sha ? `&commit=${target.sha}` : ''
          }`
        : `https://github.com/beingmartinbmc/git-history-ui#open-in-git-history-ui`;
      let opened = false;
      window.addEventListener('blur', () => (opened = true), { once: true });
      window.location.href = protoUrl;
      setTimeout(() => {
        if (!opened) window.open(fallback, '_blank');
      }, 800);
    });
  }
})();
