# git-history-ui Chrome extension

Adds a "Open in git-history-ui" button to:

- `github.com/{owner}/{repo}/pull/{n}`
- `github.com/{owner}/{repo}/commit/{sha}`
- `github.com/{owner}/{repo}/commits/...`

The button tries the `git-history-ui://` custom protocol first (registered by
the CLI's post-install script on supporting platforms), then falls back to a
hosted instance URL configured in the popup.

## Install (developer mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select this folder.
4. Visit any GitHub PR — the button appears in the page header.

## Status

This is a Manifest V3 scaffold. Icons (`icon-16.png`, `icon-48.png`,
`icon-128.png`) and Web Store packaging are TODO. The protocol-handler
fallback is best-effort: browsers vary in how they expose protocol launch
failure, so the script uses a `blur` heuristic with an 800ms timeout.
