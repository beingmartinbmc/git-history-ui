document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('hostedUrl');
  const button = document.getElementById('save');
  const status = document.getElementById('status');
  chrome.storage.sync.get(['hostedUrl'], (cfg) => {
    if (cfg && cfg.hostedUrl) input.value = cfg.hostedUrl;
  });
  button.addEventListener('click', () => {
    const raw = input.value.trim();
    const hostedUrl = GhuiLink.normalizeHostedUrl(raw);
    if (raw && !hostedUrl) {
      status.textContent = 'Enter a valid http:// or https:// URL.';
      return;
    }
    chrome.storage.sync.set({ hostedUrl }, () => {
      input.value = hostedUrl;
      status.textContent = hostedUrl ? 'Hosted instance saved.' : 'Hosted fallback disabled.';
    });
  });
});
