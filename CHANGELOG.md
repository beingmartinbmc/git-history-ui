# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.4.1] - 2026-07-12

### Fixed

- Prevented multi-lane commit graphs from continuously rescheduling their
  layout and freezing the UI on merge-heavy repositories.
- Timeline now starts at the latest tick instead of eagerly computing a large
  historical range diff.
- Dark mode and non-critical styles now load under the production Content
  Security Policy without allowing inline script attributes.
- Snapshot date cutoffs are normalized before invoking Git, avoiding
  version-dependent parsing of date-only values.

## [5.4.0] - 2026-07-11

### Added

- Deterministic `demo` repository, credential-free repository identity, portable
  investigation reports, and versioned deep links across CLI/API/UI.
- Git Wrapped defaults to the current Git author email, preserves an
  all-contributor mode, uses the real repository name, and adds accessible
  native/social sharing with canonical attribution.
- Explicit `protocol install|status|uninstall` lifecycle backed by a stable
  user-local launcher; npm installation never changes OS URL handlers.
- Hardened Manifest V3 Chrome extension with tested URL serialization,
  explicit protocol help, privacy/store copy, deterministic runtime checker,
  ZIP, and checksum.
- Merge-base `pr-impact` Markdown/JSON CLI and a summary-only composite Action
  with fork-safe event resolution and files/churn outputs.

### Changed

- README and launch guidance now lead with investigate → share → automate and
  state the optional AI data boundary explicitly.
- Release verification now covers package dry runs, packed demo smoke, Action
  smoke, and deterministic extension artifacts.

## [5.3.0] - 2026-07-06

### Added

- **Deep linking.** `git-history-ui://open?repo=...&at=...&pr=...` protocol
  URLs and `--repo-from-url`/`--at`/`--pr` CLI flags open a repo, commit, or
  PR group directly; local repo resolution verifies the checkout's git
  remote matches the requested URL before trusting it.
- **Live updates.** `GET /api/events` (SSE) pushes a `new-commits`
  notification when `.git/refs` changes; the UI shows a "new commits
  available" toast and invalidates the insights/groups/wrapped caches.
- **Lazy diff loading.** `GET /api/diff/:hash/files` returns per-file
  metadata via `git diff-tree --numstat` (no patch parsing); `GET
  /api/diff/:hash/file?path=...` fetches the full patch for one file only.
  Commit detail now loads files incrementally instead of the whole diff.
- **Code-content search (pickaxe).** `GET /api/pickaxe` searches commits by
  added/removed string (`git log -S`) or regex (`git log -G`).
- **Stash & reflog explorer.** `GET /api/stashes` and `GET /api/reflog`,
  plus a `/stash` UI route.
- **Branch/tag compare view.** New `/compare` route diffs any two refs.
- **"Load more" / infinite scroll** for large commit lists; the selected
  commit stays pinned while more history loads.
- **Export.** `GET /api/export/commits` (JSON/CSV), `/api/export/insights`,
  `/api/export/wrapped`, plus a toolbar Export action.
- **Presets API.** `GET/POST/DELETE /api/presets/:name` exposes the CLI's
  saved filter presets to the web UI.
- **Server-side result caching** for `/api/insights`, `/api/groups`, and
  `/api/wrapped`, invalidated automatically on new commits.
- **`GitProcessQueue`** bounds concurrent `git` subprocesses (default 4)
  across one-shot commands and streaming reads alike.
- **Persistent GitHub PR-info cache** on disk, keyed per repository.
- **Cross-process annotation locking** so concurrent writes to
  `annotations.json` from multiple server instances stay safe.
- **macOS and Windows protocol registration.** The post-install script now
  registers `git-history-ui://` on macOS (a tiny user-local `.app` bundle
  via Launch Services) and Windows (`HKCU` protocol-handler keys), matching
  the existing Linux (`xdg-mime`) support.

### Changed

- SQLite indexed search (`/api/search`) now pushes `author`/`since`/`until`
  filters into the SQL query and uses true `LIMIT`/`OFFSET` paging with an
  exact `COUNT`-based total, instead of over-fetching and slicing in memory.
- Anthropic LLM scoring batches candidates in groups of 40 to avoid response
  truncation on large candidate sets.
- Outbound requests to Anthropic, OpenAI, and the GitHub API now enforce
  request timeouts (60s / 60s / 15s) instead of hanging indefinitely.
- Graceful shutdown now stops the ref watcher, cancels any in-progress index
  build, closes open SSE connections, and force-closes lingering HTTP
  connections after a grace period.
- Client input validation errors (invalid commit hash, branch, or path) now
  return `400`, and unresolvable-but-well-formed refs return `404`, instead
  of both surfacing as `500`.
- The Chrome extension now re-injects its button across GitHub's SPA
  navigation and ships real toolbar icons.
- PR deep links (`?pr=`) now focus the exact PR group and select its first
  commit, instead of the previous approximation of stuffing the PR number
  into the free-text search box.
- `POST /api/share` now builds URLs from the server's actual bind address
  instead of the client-supplied `Host`/`X-Forwarded-Proto` headers.
- `/api/commits/stream` paging now passes `--max-count`/`--skip` to
  `git log` directly instead of streaming and discarding skipped records.

### Fixed

- Windows absolute paths (`C:\...`, `D:/...`) are now rejected by
  `isSafeRepoPath`, closing a path-traversal gap that only affected Windows.
- Streaming git reads (`streamRaw`, used by `streamCommits` and author/tag
  listing) now go through the same concurrency queue as other git calls.
- `git diff-tree --numstat` output parsing correctly pairs renamed files
  with their numstat line.
- Timeline range-diff now diffs against `HEAD` instead of a stale ref.
- File-history route now reacts to `paramMap`/`queryParamMap` changes
  instead of relying on a route snapshot, so navigating between files (or
  deep-linking into the Breakage tab) reliably reloads.
- Diff viewer no longer misclassifies `---`/`+++` content lines inside a
  hunk as file-header metadata.
- Git Wrapped now computes night-owl/weekend stats from each commit's local
  author timezone instead of UTC.
- Binary files in a diff are now flagged with `status: "binary"` and no
  longer inflate `totalLines` (and therefore the "large diff" guard) using
  git's `-`/`-` numstat placeholders.
- `--repo-from-url` remote matching is stricter and safer: it normalizes
  `git@host:owner/repo.git`, `https://`, and `ssh://` remote forms before
  comparing, matches on path suffix instead of substring, and now rejects
  the candidate (instead of accepting it) when the remote can't be read.
- Server startup failures (e.g. port already in use) now clean up the ref
  watcher, index build, and SQLite handle instead of leaking them; shutdown
  also closes the SQLite index handle.
- Binding to `0.0.0.0`/`::` or port `0` no longer prints an unusable/wrong
  URL — the startup message now shows the actual bound port and a
  browsable host.
- Fixed several stale-response races in the frontend: rapid "Refresh
  impact" clicks, repeated "Explain change" clicks, and Wrapped
  year/author changes could previously let an older in-flight request
  overwrite a newer one; all now cancel the prior subscription first.
- `httpStatusForError` now respects an explicit `status`/`statusCode` on
  the thrown error (e.g. from body-parser/rate-limit) instead of always
  falling back to message-sniffing.

## [5.2.1] - 2026-06-27

### Documentation

- Updated the README for the Git intelligence index, index status controls, new API endpoints, and hardened local-server security guidance.

## [5.2.0] - 2026-06-27

### Added

- Added optional SQLite-backed Git intelligence index endpoints and frontend status controls for build, rebuild, cancel, and progress visibility.
- Added broad server validation and security edge-case test coverage for malformed input, unsafe paths, and boundary conditions.

### Changed

- Hardened server request validation, git parsing, repository path handling, and index/cache behavior for safer local operation.
- Improved frontend robustness across command palette, grouped lists, blame, shortcuts, and Angular startup configuration.

### Fixed

- Mocked index-status dependencies in app deep-link specs so frontend tests cover the new root status component reliably.

## [5.1.1] - 2026-06-10

### Changed

- Migrated ESLint 8 → 9 to the new flat config (`eslint.config.js`), removing
  the deprecated `eslint@8` and `@humanwhocodes/*` dev dependencies.
- Upgraded the Jest test stack to v30 (`jest`, `@types/jest`, `ts-jest`),
  retiring the deprecated `rimraf@3` transitive dependency.

### Documentation

- Added a project banner and a sanitized app preview image to the README.
- Replaced the non-functional Bundlephobia size badge (Bundlephobia cannot
  analyze a CLI/server package with native dependencies) with a Packagephobia
  install-size badge.

## [5.1.0] - 2026-06-06

### Added

- **Git Wrapped** — a Spotify-Wrapped-style year-in-review computed entirely
  from local history. New `GET /api/wrapped` endpoint (params: `year`,
  `since`, `until`, `branch`, `author`, `maxCommits`) and a
  `git-history-ui wrapped [--year] [--author] [--json]` CLI subcommand that
  prints a shareable terminal card. Reports commit/author/line/file totals,
  top contributors, top files, top commit-message words, night-owl and
  weekend-warrior percentages, biggest commit, busiest day/hour, and longest
  commit streak. Local-first: no commit content leaves the machine.

## [5.0.3] - 2026-05-15

### Changed

- Replaced the 26 MB `demo.gif` with a 586 KB `demo.mp4` (H.264) embedded
  via an HTML5 `<video>` tag in the README.
- Restricted the published npm tarball to markdown files under `docs/` so
  binary assets never ship with the package again.

## [5.0.2] - 2026-05-15

### Changed

- README now showcases a live demo GIF (`docs/images/demo.gif`) in place of
  the previous static screenshot.

## [5.0.1] - 2026-05-03

### Added

- Breakage analysis endpoints and UI hooks for investigating file-level change
  history.
- Shared frontend observable caching for commit, timeline, insight, and
  annotation requests.

### Fixed

- Timeline `Diff vs HEAD` file modifications now render in a properly sized
  virtual-scroll diff viewer.
- Shared commit links resolve against the selected repository when the app is
  launched with `--cwd`.
- Diff parsing, rename handling, and large-repo indexing paths were tightened
  for repository-scale testing.

## [5.0.0] - 2026-05-03

### Added

- AI explanations now render as formatted markdown with an internal scrollbar
  for long responses.
- OpenAI and Anthropic model selection can be overridden with
  `GHUI_LLM_MODEL`, `OPENAI_MODEL`, or `ANTHROPIC_MODEL`.
- Project governance docs, PR templates, issue templates, and expanded test
  coverage were added for a more release-ready package.

### Changed

- OpenAI defaults to `gpt-4.1-nano` and Anthropic defaults to the available
  Sonnet model `claude-sonnet-4-6`.
- AI summaries and commit explanations use larger token budgets and tighter
  prompts to avoid truncated prose.

## [4.0.1] - 2026-05-02

### Fixed

- Commit loading now falls back to the paginated commits endpoint if the SSE
  stream fails, and server-sent stream errors preserve their real message.

## [4.0.0] - 2026-05-02

### Added

- Modern interactive UI refresh across history, commit detail, insights,
  timeline, command palette, and shared design primitives.
- Branch filtering as a first-class filter across commit loading, grouped views,
  streaming requests, and search flows.
- CI and release workflow coverage gates requiring at least 90% backend test
  coverage, plus focused frontend specs for the new interactive UI behavior.

### Changed

- Promoted Git Intelligence UI modernization and large-repository performance
  safeguards into a major release.

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
- **Embeddable distribution.** A Chrome extension
  (`apps/chrome-extension/`) injects a "View in git-history-ui" button
  on GitHub PR / commit pages, alongside an opportunistic
  `git-history-ui://` protocol registration script
  (`scripts/register-protocol.js`, opt-in).

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
