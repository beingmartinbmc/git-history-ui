# git-history-ui Chrome extension

Adds a "Open in git-history-ui" button to:

- `github.com/{owner}/{repo}/pull/{n}`
- `github.com/{owner}/{repo}/commit/{sha}`
- `github.com/{owner}/{repo}/commits/...`

The button opens the `git-history-ui://` custom protocol. Install it explicitly
with `git-history-ui protocol install`; npm installation never changes OS URL
handlers. If the link does not open, the page shows setup help and, when you
configured a valid http(s) URL in the popup, an explicit hosted-instance link.

## Install (developer mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select this folder.
4. Visit any GitHub PR — the button appears in the page header.

## Status

This is a Manifest V3 extension. It re-injects the button across GitHub's SPA
navigation with a `MutationObserver`. It does not use remote code, analytics,
automatic fallback redirects, or permissions beyond GitHub page access and
sync storage for the optional hosted URL. Depending on browser settings, that
URL may be synchronized through browser/Google account infrastructure.

Run `npm run test:node`, `npm run check:extension`, and
`npm run package:extension` before release. See [PRIVACY.md](./PRIVACY.md) and
[store-listing.md](./store-listing.md).
