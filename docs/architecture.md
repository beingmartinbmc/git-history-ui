# Architecture

`git-history-ui` is a local-first CLI that starts an Express backend and serves
an Angular single-page app.

```text
npx git-history-ui
       │
       ▼
dist/cli.js ── starts ──► Express server
                           │
                           ├─ serves Angular build from build/frontend/
                           ├─ exposes /api/* endpoints
                           ├─ shells out to git with execFile/spawn
                           ├─ optionally builds a SQLite FTS index
                           └─ optionally calls Anthropic/OpenAI when configured
```

## Backend

Source lives in `src/backend/`.

| Module | Responsibility |
| --- | --- |
| `server.ts` | Express app, API routes, static asset serving, security middleware. |
| `gitService.ts` | All git operations, commit parsing, diffs, blame, branch/tag/author lookup. |
| `search/` | Natural-language query parsing and search orchestration. |
| `grouping/prGrouping.ts` | PR and feature grouping heuristics plus optional GitHub enrichment. |
| `impact.ts` | Commit impact analysis and JS/TS import ripple detection. |
| `insights.ts` / `aggregations.ts` | Contributor, churn, hotspot, and risky-file calculations. |
| `cache/sqliteIndex.ts` | Optional `better-sqlite3` FTS index for large repositories; supports author/date filter pushdown and true `LIMIT`/`OFFSET` paging. |
| `cache/resultCache.ts` | Generic in-memory TTL cache for expensive aggregations (insights, PR groups, Wrapped). |
| `gitProcessQueue.ts` | Bounds concurrent backend repository-query `git` subprocesses (default 4), including one-shot commands and long-running streams. |
| `refWatcher.ts` | Watches `.git/HEAD` and `.git/refs` for changes; debounces and emits a `change` event used to invalidate caches and push SSE `new-commits` notifications. |
| `llm/` | Provider abstraction for heuristic, Anthropic, and OpenAI scoring/summaries. Outbound calls use a 60s request timeout. |
| `annotations.ts` | Local per-commit notes stored under `~/.git-history-ui/`, guarded by cross-process file locking. |
| `presets.ts` | Saved CLI filter presets, also exposed to the UI via `/api/presets`. |

The backend uses `execFile` and `spawn` instead of shell interpolation so git
arguments stay explicit and predictable. Repository-query subprocesses created
through `GitService`—including streaming reads used by
`streamCommits`/`streamRaw`—are routed through `gitProcessQueue` so a burst of
UI requests cannot spawn unbounded processes.

On shutdown, the server stops the ref watcher, cancels any in-progress index
build, closes open SSE connections, and force-closes lingering HTTP
connections after a grace period.

## Frontend

Source lives in `frontend/src/app/`.

The UI is an Angular standalone-components app using:

- Angular signals and `OnPush` change detection
- Angular CDK virtual scrolling
- `d3` for impact graphs, treemaps, and churn charts
- `highlight.js` for syntax-highlighted diffs and blame
- TailwindCSS and CSS custom properties for theming

Routes:

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `HomeShellComponent` | Main history view, graph/list/detail layout. |
| `/timeline` | `TimelineComponent` | Time-travel snapshot exploration. |
| `/file/:path` | `FileHistoryComponent` | File history, blame, and breakage analysis. |
| `/insights` | `InsightsComponent` | Contributors, hotspots, churn, risky files. |
| `/wrapped` | `WrappedComponent` | "Git Wrapped" year-in-review card. |
| `/compare` | `BranchCompareComponent` | Diff any two branches/tags/refs side by side. |
| `/stash` | `StashReflogComponent` | Browse `git stash` and `git reflog` entries. |

Commit detail loads diffs lazily: it fetches per-file metadata via
`GET /api/diff/:hash/files` first, then the full patch for only the
currently-open file via `GET /api/diff/:hash/file?path=...`.

## Build output

```text
src/                  ── tsc ──► dist/
frontend/src/         ── ng build ──► frontend/dist/frontend/browser/
frontend build copy   ─────────────► build/frontend/
```

The npm package publishes the compiled backend (`dist/`), compiled frontend
(`build/`), docs, README, changelog, and license files. If the Angular build is
missing, the server returns a clear 404 instead of serving a legacy fallback.

## Local data

Runtime state is kept outside the inspected repository:

```text
~/.git-history-ui/
  presets.json
  <repo-hash>/
    annotations.json
    annotations.json.lock   (transient, cross-process write lock)
    index.sqlite
    pr-cache.json           (GitHub PR metadata cache, when GITHUB_TOKEN is set)
```

This keeps the target repository clean and makes annotations/indexes local to
the user's machine.
