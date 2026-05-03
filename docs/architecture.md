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
| `cache/sqliteIndex.ts` | Optional `better-sqlite3` FTS index for large repositories. |
| `llm/` | Provider abstraction for heuristic, Anthropic, and OpenAI scoring/summaries. |
| `annotations.ts` | Local per-commit notes stored under `~/.git-history-ui/`. |
| `presets.ts` | Saved CLI filter presets. |

The backend uses `execFile` and `spawn` instead of shell interpolation so git
arguments stay explicit and predictable.

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
| `/file/:path` | `FileHistoryComponent` | File history and blame. |
| `/insights` | `InsightsComponent` | Contributors, hotspots, churn, risky files. |

## Build output

```text
src/                  ── tsc ──► dist/
frontend/src/         ── ng build ──► frontend/dist/frontend/browser/
frontend build copy   ─────────────► build/frontend/
```

The npm package publishes the compiled backend (`dist/`), compiled frontend
(`build/`), fallback public assets (`public/`), docs, README, changelog, and
license files.

## Local data

Runtime state is kept outside the inspected repository:

```text
~/.git-history-ui/
  presets.json
  <repo-hash>/
    annotations.json
    index.sqlite
```

This keeps the target repository clean and makes annotations/indexes local to
the user's machine.
