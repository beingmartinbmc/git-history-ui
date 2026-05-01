# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-05-01

### Added

- README now includes a preview screenshot, sharper positioning, a "why use
  this" section, and comparisons with GitHub UI, terminal tools, and desktop
  Git clients.
- Package files now include `docs/**/*` so README preview assets are available
  in published packages.

### Fixed

- Theme toggle now switches from the default system preference to dark mode on
  the first click, making dark mode immediately visible on light systems.
- Theme button accessibility text now reports both the selected preference and
  resolved theme.

## [2.0.2] - 2026-05-01

### Added

- Commit graph now uses a theme-aware canvas rendering with lane guides,
  hover and selection states, and branch/tag pills.
- Graph-specific light and dark design tokens improve contrast in both themes.

### Changed

- CI now tests the Angular 20 frontend on supported Node 20 and Node 22
  versions only.
- Node engine metadata and README requirements now match Angular 20's
  supported Node versions.

### Fixed

- Docker image builds now include the root `public` assets in the builder
  stage before copying them into the runtime image.

## [2.0.1] - 2026-04-28

### Fixed

- Diff viewer now scrolls correctly in both unified and split modes. The
  surrounding grid containers were missing `min-height: 0` and explicit
  `grid-template-rows: minmax(0, 1fr)`, which let the inner `<pre>` panes
  expand to their content height instead of clipping and scrolling.

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
