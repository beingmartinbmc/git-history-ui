# git-history-ui GitHub App (scaffold)

A small GitHub App that adds an "Open in git-history-ui" deep link to PRs
and individual commits via a Checks-API summary or PR comment. Designed to
deep-link to either a hosted instance or — on supporting platforms — the
local CLI via the `git-history-ui://` protocol.

## Status

This package is a placeholder. The intended shape:

```
apps/github-app/
├── README.md         (you are here)
├── manifest.yml      GitHub App manifest (TODO)
├── src/
│   ├── handlers/
│   │   ├── pull_request.opened.ts
│   │   └── push.ts
│   └── server.ts     fastify or express webhook receiver
└── deploy/
    ├── fly.toml      example deployment to Fly.io (TODO)
    └── Dockerfile
```

## Why ship the scaffold now

The Chrome extension and the CLI custom-protocol handler reference the same
deep-link contract this app should follow. Locking the URL shape in v3.2 lets
us iterate on the actual server implementation without breaking embedders.

## Deep-link contract

- PR view: `git-history-ui://open?repo=<repo-https-url>&pr=<n>`
- Commit view: `git-history-ui://open?repo=<repo-https-url>&at=<sha>`
- Hosted fallback: same query string against `<hosted>/?repo=...&commit=...`.
