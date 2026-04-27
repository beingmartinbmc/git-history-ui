# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-27

A full-stack rewrite focused on extreme performance, correctness, and a polished UI.

### Highlights

- Rewritten backend `GitService` with deterministic parsing, ref-index caching,
  filter-aware pagination via `git rev-list --count`, and safe `execFile`
  arguments (no NUL-byte placeholders).
- New backend HTTP server hardened with `helmet`, `compression`, configurable
  CORS, rate limiting, and graceful shutdown.
- New frontend built around Angular signals, `OnPush` change detection,
  CDK virtual scroll, and a canvas-rendered swim-lane git graph.
- Light / dark / system theming via CSS custom properties with persisted
  preference.
- Diff viewer with unified and split-view modes, syntax highlighting via
  `highlight.js`, and proper line-number gutters.
- Command palette (`⌘K`) and keyboard navigation (`j` / `k` / `g` / `G`,
  `?`, `/`).
- Modern release infra: GitHub Actions CI + tag-driven npm publish via
  `NODE_TOKEN`, multi-stage Node 20 Docker image, ESLint + Prettier,
  Dependabot.
- Comprehensive Jest coverage for backend git service and HTTP server.

### Added

- `/api/authors` endpoint and frontend `GitService.getAuthors`.
- `since` / `until` / server-side `search` (--grep) filters.
- `subject`, `body`, `shortHash`, `authorEmail`, `isMerge`, and rich diff
  status (`added` / `modified` / `deleted` / `renamed` / `copied` / `binary`)
  in commit and diff shapes.
- `.editorconfig`, `.nvmrc`, `.prettierrc`, `.prettierignore`, dependabot
  config.

### Changed

- Bumped engines to Node `>=18`.
- Pagination now uses `--skip` + filter-aware count caching.
- Frontend now ships as an Angular standalone app with signals end-to-end.

### Removed

- Legacy color-palette selector and the inline app template (replaced by the
  new toolbar + theme service).
- Custom dark-mode CSS overrides in favour of token-driven theming.
