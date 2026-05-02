# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.2] - 2026-05-02

### Changed

- Hardened large-repo performance: insights now use a single `git log --numstat`
  pass, SQLite indexing streams git output instead of buffering full logs, and
  the commit graph keeps its canvas viewport-sized so it remains smooth beyond
  browser canvas-height limits.

### Fixed

- Preserved rename semantics in churn calculations, safely rejected streaming
  callback failures, and protected streamed index builds from UTF-8 chunk
  boundary corruption.

## [3.2.1] - 2026-05-02

### Fixed

- **`npx git-history-ui` no longer prints help and exits.** When the
  `presets` subcommand was added in v3.2.0, the root commander program
  was left without a default `.action()`. Commander v12 reacts to that
  by printing help and exiting whenever the user invokes the binary
  without a subcommand. A no-args invocation now correctly starts the
  server, matching pre-v3.2.0 behavior.
- Added a CLI smoke test (`src/__tests__/cli.test.ts`) that runs the
  built binary with `--help`, `--version`, and no args so this kind of
  regression can't ship silently again.

## [3.2.0] - 2026-05-02

The "Distribution & scale" release. This phase makes the tool faster on big
repos, easier to embed elsewhere, and easier to share a view with a teammate
— all without breaking the zero-config promise.

### Added

- **SQLite commit index (optional).** New `src/backend/cache/sqliteIndex.ts`
  builds a per-repo index in `~/.git-history-ui/<hash>.db` keyed off
  `git rev-list --all` and an FTS5 virtual table over subject/body. Falls
  back to git-shelling when `better-sqlite3` is not installed. Surfaced via
  `GET /api/index/stats` and `POST /api/index/build`.
- **SSE streaming endpoint.** `GET /api/commits/stream` streams commits as
  they are produced from `git log`, so very large repos render incrementally
  instead of waiting for the full payload.
- **Virtualized commit graph.** `CommitGraphComponent` now culls offscreen
  rows on each draw and re-paints on scroll via `requestAnimationFrame`,
  keeping the canvas paint cost bounded by viewport height instead of total
  commit count.
- **Shareable URLs.** `POST /api/share` returns a URL with the supplied
  view-state encoded in the query string. The common case ("send my
  colleague the link") needs no relay server.
- **Annotations & "Explain this change".** Local-first per-commit comment
  threads stored under `~/.git-history-ui/<repo>/annotations.json`, plus a
  one-click ✨ Explain card that calls the configured LLM to summarize a
  commit's intent.
- **CLI presets.** New `--preset <name>` and `--save-preset <name>` flags
  plus a `git-history-ui presets list|delete` subcommand, all backed by
  `~/.git-history-ui/presets.json`.
- **Embeddable distribution.** Scaffolds for a Chrome extension
  (`apps/chrome-extension/`) that injects a "View in git-history-ui" button
  on GitHub PR / commit pages, a placeholder GitHub App
  (`apps/github-app/`), and an opportunistic `git-history-ui://` protocol
  registration script (`scripts/register-protocol.js`, opt-in).

### Changed

- Bumped to `v3.2.0`.

### Notes

- `better-sqlite3` is declared as an `optionalDependency`; install failures
  are silent and the server continues to operate with the git-shelling path.

## [3.1.0] - 2026-05-02

Visual polish on top of v3.0 — d3 visualizations replace the placeholder
HTML/CSS charts, and the split diff view gets the niceties developers expect
from elite diff tools.

### Added

- **d3 force-directed impact graph.** New `ImpactGraphComponent` renders
  changed files, their JS/TS imports, and module groupings as a draggable
  force-directed graph in the commit detail panel.
- **d3 hotspots treemap.** The Insights dashboard now renders hotspots as a
  proportional treemap (cell size = commit count, color = saturation).
  Cells are clickable and open the file's history view.
- **d3 churn chart.** Insights "Churn over time" upgraded from CSS bars to a
  proper time-axis area chart with a smooth curve.
- **Side-by-side diff scroll-sync.** The split diff view now mirrors scroll
  position and direction across both panes.
- **Intra-line word highlighting.** When a `del`/`add` line pair is shown
  side-by-side, only the changed words are accented (not the whole line) —
  uses an LCS word-tokenizer with a 20k character cap to stay snappy.

### Changed

- The previous "list of dependency-ripple lines" inside the impact card has
  been replaced with the interactive graph; the related-commits and modules
  lists stay below it for screen-reader / keyboard users.

## [3.0.0] - 2026-05-02

This release transforms `git-history-ui` from a "pretty git log" into a
**Git Intelligence** platform. Everything is still zero-config; new AI
features are opt-in via your own API key.

### Added — Headline features

- **Natural-language search.** A new `/api/search` endpoint and toggle in the
  toolbar accept queries like "login bug last month" or "payments by alice".
  A built-in heuristic intent parser handles dates, authors, and synonym
  expansion (`fix` → `bug, hotfix, patch`, `auth` → `login, oauth, jwt`,
  etc.). When `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set, results are
  semantically re-ranked. The interpreted query is shown as removable chips
  so you always know how the tool understood your request.
- **PR / feature grouping.** A new `/api/groups` endpoint clusters commits by
  GitHub merge commits (`Merge pull request #N from ...`), squash merges
  (`subject (#N)`), and Conventional Commits scope (`feat(auth):`,
  `fix(payments):`). Toggle the flat / grouped view from the toolbar.
  Optional `GITHUB_TOKEN` enriches groups with PR title, author, labels.
- **Time travel.** New `/timeline` route with a horizontal slider. Drag to any
  point in history to see HEAD, branch, and tag positions at that moment, and
  a live diff against current HEAD.
- **File history & blame.** Click any file in a commit's Files panel to open
  `/file/:path` — full history of every commit that touched the file, plus a
  tabbed blame view (the existing `/api/blame` endpoint now has a UI).
- **Commit impact analysis.** New `/api/impact/:hash` endpoint shows files
  touched, modules affected, dependency ripple parsed from JS/TS imports, and
  related commits that touched the same files.
- **Insights dashboard.** New `/insights` route with top contributors,
  hotspots (most-changed files), churn over time, and a heuristic risky-files
  score that blends churn × contributor diversity × recency.
- **AI extras (optional).** "Explain this change" on commits and "Summarize"
  on diffs, both powered by `LlmService.summarize()`. Disabled with a clear
  tooltip when no provider key is configured.
- **Local-first annotations.** Add notes to any commit; stored at
  `~/.git-history-ui/<repo-hash>/annotations.json`. New endpoints under
  `/api/annotations/:hash`.
- **Shareable links.** A "Share" button on the commit detail copies a URL
  with the commit hash encoded.
- **Collapse unchanged blocks.** Diffs default to ±3 lines of context with an
  Expand button to reveal the rest.

### Added — Plumbing

- New `LlmService` abstraction (`src/backend/llm/`) with three providers:
  `HeuristicProvider` (always-on, pure heuristic), `AnthropicProvider`
  (claude-3-5-haiku by default), and `OpenAiProvider` (gpt-4o-mini by
  default). Provider selected via `GHUI_LLM_PROVIDER` + key auto-detection.
- New aggregations module (`src/backend/aggregations.ts`) with pure functions
  for contributor stats, file churn, churn-by-day, and risky-file scoring.
- Real Angular routing replaces the previous single-page layout. New routes:
  `/`, `/timeline`, `/file/:path`, `/insights`. Components are lazy-loaded.
- Backend POST/DELETE endpoints (annotations, summarize, explain). CORS
  updated to allow these methods on local origins only.

### Changed

- Toolbar adds nav links (History / Timeline / Insights), a search-mode
  toggle (literal vs. AI-flavored), and a flat/grouped toggle.
- Commit detail panel now has Explain / Show Impact / Share action buttons,
  per-file "View history" buttons, an Impact card, and an Annotations
  collapsible panel.
- Diff viewer adds Collapse / Summarize buttons.

### Tests

- 24 new tests for the LLM heuristic provider, NL query parser, aggregation
  functions, and PR grouping. Total suite: 43 tests.

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
