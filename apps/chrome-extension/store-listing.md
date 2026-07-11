# Chrome Web Store listing

## Summary

Open GitHub pull requests and commits in your local git-history-ui checkout.

## Description

git-history-ui adds one button to GitHub repository, pull request, and commit
pages. The button opens a versioned `git-history-ui://` link so the installed
CLI can search common clone directories and open the matching view. If multiple
clones exist or none is found, launch the intended checkout with `--cwd`.

If the protocol handler is not installed, the page shows an explicit setup
link. You may also configure your own http(s) hosted instance. There is no
automatic redirect, remote code, analytics, or git-history-ui account.

## Permission rationale

- `storage`: saves the optional hosted-instance URL with Chrome sync storage;
  browser/Google account infrastructure may synchronize it according to the
  user's browser settings.
- `https://github.com/*`: adds the button only to GitHub repository pages.

## Release checklist

- [ ] Run `npm run check:extension`.
- [ ] Run `npm run package:extension` and verify its SHA-256 checksum.
- [ ] Manually verify the button on repository, PR, and commit pages.
- [ ] Capture current store screenshots from the real extension; do not use mockups.
- [ ] Submit the listing manually; the Chrome Web Store listing is not yet published.
