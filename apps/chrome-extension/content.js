(function () {
  'use strict';
  var lastUrl = '';

  function tryInject() {
    if (location.href === lastUrl && document.querySelector('#ghui-open-btn')) return;
    lastUrl = location.href;
    remove('#ghui-open-btn');
    remove('#ghui-open-help');

    var parsed = GhuiLink.parseGitHubUrl(location.href);
    if (!parsed) return;
    var host = findInjectionPoint();
    if (!host) return;

    var button = document.createElement('button');
    button.id = 'ghui-open-btn';
    button.type = 'button';
    button.className = 'btn btn-sm';
    button.textContent = 'Open in git-history-ui';
    button.style.cssText =
      'margin-left:6px;background:#6366f1;color:#fff;border:0;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;';
    button.addEventListener('click', function () {
      openInGhui(parsed, host);
    });
    host.appendChild(button);
  }

  function openInGhui(parsed, host) {
    location.href = GhuiLink.serializeDeepLink(parsed);
    chrome.storage.sync.get(['hostedUrl'], function (cfg) {
      showHelp(host, parsed, cfg && cfg.hostedUrl);
    });
  }

  function showHelp(host, parsed, hostedUrl) {
    remove('#ghui-open-help');
    var panel = document.createElement('span');
    panel.id = 'ghui-open-help';
    panel.style.cssText = 'margin-left:8px;font-size:12px;color:var(--fgColor-muted,#656d76);';
    panel.appendChild(document.createTextNode("Didn't open? "));

    var help = document.createElement('a');
    help.href = 'https://github.com/beingmartinbmc/git-history-ui#custom-url-protocol';
    help.target = '_blank';
    help.rel = 'noopener noreferrer';
    help.textContent = 'Install the protocol handler';
    panel.appendChild(help);

    var hosted = GhuiLink.serializeHostedLink(parsed, hostedUrl);
    if (hosted) {
      panel.appendChild(document.createTextNode(' or '));
      var hostedLink = document.createElement('a');
      hostedLink.href = hosted;
      hostedLink.target = '_blank';
      hostedLink.rel = 'noopener noreferrer';
      hostedLink.textContent = 'open the hosted instance';
      panel.appendChild(hostedLink);
    }
    host.appendChild(panel);
  }

  function findInjectionPoint() {
    return (
      document.querySelector('.gh-header-actions') ||
      document.querySelector('.pagehead-actions') ||
      document.querySelector('[data-testid="issue-header-actions"]') ||
      null
    );
  }

  function remove(selector) {
    var element = document.querySelector(selector);
    if (element) element.remove();
  }

  tryInject();
  new MutationObserver(function () {
    if (location.href !== lastUrl || !document.querySelector('#ghui-open-btn')) tryInject();
  }).observe(document.body, { childList: true, subtree: true });
})();
