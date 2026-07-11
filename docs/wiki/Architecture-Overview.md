# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Angular 20)                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Toolbar  │  │CommitList │  │CommitGraph│  │ CommitDetail  │  │
│  │ (search, │  │(paginated │  │ (canvas   │  │ (diff viewer, │  │
│  │  filters)│  │ or grouped│  │  lanes)   │  │  AI, impact)  │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬────────┘  │
│       │               │              │               │           │
│  ┌────▼───────────────▼──────────────▼───────────────▼────────┐  │
│  │              Angular Services (GitService, UiState,         │  │
│  │              InsightsService, AnnotationsService)           │  │
│  └────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────┘
                                │ HTTP / SSE
┌───────────────────────────────▼──────────────────────────────────┐
│                      Express Backend (Node.js)                    │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐           │
│  │  REST   │  │  Search  │  │  LLM   │  │  Index   │           │
│  │  API    │  │  Engine  │  │Provider │  │ (SQLite) │           │
│  └────┬────┘  └────┬─────┘  └────┬───┘  └────┬─────┘           │
│       │            │             │            │                  │
│  ┌────▼────────────▼─────────────▼────────────▼───────────────┐  │
│  │               GitService (child_process → git CLI)          │  │
│  └────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────┘
                                │ exec / spawn
                        ┌───────▼───────┐
                        │   git binary  │
                        │  (local repo) │
                        └───────────────┘
```

## Layer Responsibilities

### Frontend (Angular 20, standalone components)
- **Rendering:** All UI — commit list, graph, diff viewer, insights charts, wrapped cards
- **State:** Centralized in `UiStateService` (signals-based, no NgRx)
- **Communication:** HTTP calls to `/api/*` via `GitService` and `InsightsService`
- **Routing:** Lazy-loaded routes: `/` (home), `/timeline`, `/insights`,
  `/wrapped`, `/file/:path`, `/compare`, and `/stash`

### Backend (Express + TypeScript)
- **API Server:** REST endpoints for commits, diffs, search, insights, annotations, etc.
- **Git Interface:** `GitService` class wraps `git` CLI via `child_process`
- **Concurrency:** `GitProcessQueue` bounds backend repository-query git
  subprocesses (default 4 concurrent), including streaming reads
- **Live updates:** `RefWatcher` watches `.git/HEAD`/`.git/refs`, debounces changes, invalidates caches, and pushes SSE `new-commits` events over `/api/events`
- **Search:** Heuristic NL parser + optional AI re-ranking; indexed author/date filters push down into SQLite FTS5 when available
- **LLM:** Pluggable provider system (Anthropic, OpenAI, Heuristic fallback), outbound calls bounded by a 60s timeout
- **Index:** Optional SQLite/FTS5 index for fast commit full-text search; pickaxe remains Git-backed
- **Caching:** Short-TTL `ResultCache` for insights/groups/Wrapped, cleared on ref-watcher change events
- **Analytics:** Pure aggregation functions for insights, wrapped, breakage, impact

### Storage
- **Git repository:** Read-only source of truth (never modified)
- **`~/.git-history-ui/`:** Per-repo SQLite index, annotations JSON, presets JSON

## Data Flow: Commit Search

```
User types "login bug last month" → Toolbar component
  → UiStateService.patchFilters({ search: ... })
    → GitService.naturalLanguage(query)
      → GET /api/search?q=login+bug+last+month
        → Backend: parseNlQuery() extracts structured intent
        → Backend: runNlSearch() fetches candidates from git
        → Backend: LLM.score() re-ranks (if AI provider configured)
      ← Response: { commits[], parsedQuery, usedLlm, llmProvider }
    → UiStateService.commits.set(results)
  → CommitList re-renders
```

## Data Flow: Commit Detail + Diff (lazy loading)

```
User clicks commit row → UiStateService.selectHash(hash)
  → CommitDetailComponent (reactive to selectedCommit signal)
    → GitService.getDiffFiles(hash)                      [file metadata only]
      → GET /api/diff/:hash/files
        → Backend: gitService.getDiffMeta(hash)
          → git diff-tree --numstat --name-status ...     [no patch parsing]
      ← Response: { files: FileMeta[], totalLines, isLarge }
    → User opens a file → GitService.getDiffFile(hash, path)
      → GET /api/diff/:hash/file?path=...
        → Backend: gitService.getDiffForFile(hash, path)
          → git diff -- path                              [scoped to one file]
      ← Response: DiffFile (full patch text)
    → DiffViewerComponent renders unified/split diff for that file
```

Large commits (many files or huge patches) stay responsive because the full
patch is only ever fetched for the file currently open, not the whole commit.

## Key Design Decisions

1. **Local-first:** Git parsing, heuristic search, reports, and local storage stay
   on-machine. Invoked AI actions send selected prompt/commit/diff data to the
   configured Anthropic or OpenAI provider; optional PR enrichment calls GitHub
   when `GITHUB_TOKEN` is configured.
2. **Git CLI over libgit2:** Portability. No native bindings required for core functionality.
3. **Signals over RxJS stores:** Angular 20 signals for state; RxJS only for async I/O.
4. **Streaming:** SSE endpoints for progressive rendering (`/api/commits/stream`) and live updates (`/api/events`).
5. **Optional native deps:** `better-sqlite3` is in `optionalDependencies` — app works without it.
6. **Pure aggregators:** All analytics functions (insights, wrapped, breakage) are pure and unit-testable, separated from I/O.
7. **Bounded concurrency:** Backend repository-query git subprocesses—one-shot
   or streaming—use a shared queue so UI-driven fan-out cannot overwhelm the
   host.
8. **Lazy by default:** Diff loading, PR enrichment, and aggregate computation all defer or cache expensive work rather than doing it eagerly.

## Directory Structure

```
git-history-ui/
├── src/backend/           # Express server, git service, analytics
│   ├── server.ts          # HTTP API routes, middleware
│   ├── gitService.ts      # Git CLI wrapper (diffs, blame, pickaxe, stash, reflog)
│   ├── gitProcessQueue.ts # Bounded concurrency for git subprocesses
│   ├── refWatcher.ts      # .git/refs watcher → cache invalidation + SSE
│   ├── search/            # NL search parser & runner
│   ├── grouping/          # PR/feature commit grouping
│   ├── llm/               # LLM provider abstraction
│   ├── cache/             # SQLite index + in-memory ResultCache
│   ├── breakage.ts        # SZZ-lite breakage analysis
│   ├── impact.ts          # Commit impact graph
│   ├── insights.ts        # Dashboard aggregations
│   ├── wrapped.ts         # Year-in-review computation
│   ├── annotations.ts     # Per-commit notes store (with file locking)
│   ├── presets.ts         # CLI preset persistence
│   └── snapshot.ts        # Time-travel ref resolution
├── frontend/src/app/      # Angular application
│   ├── components/        # All UI components
│   ├── services/          # API communication services
│   ├── models/            # TypeScript interfaces
│   └── pipes/             # Markdown pipe, etc.
├── src/__tests__/         # Jest test suite
├── docs/                  # Documentation
└── scripts/               # Build helpers
```
