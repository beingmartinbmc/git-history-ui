document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('hostedUrl');
  const button = document.getElementById('save');
  chrome.storage.sync.get(['hostedUrl'], (cfg) => {
    if (cfg && cfg.hostedUrl) input.value = cfg.hostedUrl;
  });
  button.addEventListener('click', () => {
    chrome.storage.sync.set({ hostedUrl: input.value || '' }, () => {
      button.textContent = 'Saved';
      setTimeout(() => (button.textContent = 'Save'), 1200);
    });
  });
});
