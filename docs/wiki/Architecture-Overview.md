# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Angular 19)                     │
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

### Frontend (Angular 19, standalone components)
- **Rendering:** All UI — commit list, graph, diff viewer, insights charts, wrapped cards
- **State:** Centralized in `UiStateService` (signals-based, no NgRx)
- **Communication:** HTTP calls to `/api/*` via `GitService` and `InsightsService`
- **Routing:** Lazy-loaded routes: `/` (home), `/timeline`, `/insights`, `/wrapped`, `/file/:path`

### Backend (Express + TypeScript)
- **API Server:** REST endpoints for commits, diffs, search, insights, annotations, etc.
- **Git Interface:** `GitService` class wraps `git` CLI via `child_process`
- **Search:** Heuristic NL parser + optional AI re-ranking
- **LLM:** Pluggable provider system (Anthropic, OpenAI, Heuristic fallback)
- **Index:** Optional SQLite/FTS5 index for fast full-text search on large repos
- **Analytics:** Pure aggregation functions for insights, wrapped, breakage, impact

### Storage
- **Git repository:** Read-only source of truth (never modified)
- **`~/.git-history-ui/`:** Per-repo SQLite index, annotations JSON, presets JSON

## Data Flow: Commit Search

```
User types "login bug last month" → Toolbar component
  → UiStateService.patchFilters({ search: ... })
    → GitService.searchCommits(query)
      → GET /api/search?q=login+bug+last+month
        → Backend: parseNlQuery() extracts structured intent
        → Backend: runNlSearch() fetches candidates from git
        → Backend: LLM.score() re-ranks (if AI provider configured)
      ← Response: { commits[], parsedQuery, usedLlm, llmProvider }
    → UiStateService.commits.set(results)
  → CommitList re-renders
```

## Data Flow: Commit Detail + Diff

```
User clicks commit row → UiStateService.selectHash(hash)
  → CommitDetailComponent (reactive to selectedCommit signal)
    → GitService.getDiff(hash)
      → GET /api/diff/:hash
        → Backend: gitService.getDiff(hash)
          → git diff-tree -p --find-renames ...
      ← Response: DiffFile[]
    → DiffViewerComponent renders unified/split diff
```

## Key Design Decisions

1. **Local-first:** All data stays on-machine. LLM keys are optional and user-provided.
2. **Git CLI over libgit2:** Portability. No native bindings required for core functionality.
3. **Signals over RxJS stores:** Angular 19 signals for state; RxJS only for async I/O.
4. **Streaming:** SSE endpoint (`/api/commits/stream`) for progressive rendering.
5. **Optional native deps:** `better-sqlite3` is in `optionalDependencies` — app works without it.
6. **Pure aggregators:** All analytics functions (insights, wrapped, breakage) are pure and unit-testable, separated from I/O.

## Directory Structure

```
git-history-ui/
├── src/backend/           # Express server, git service, analytics
│   ├── server.ts          # HTTP API routes, middleware
│   ├── gitService.ts      # Git CLI wrapper
│   ├── search/            # NL search parser & runner
│   ├── grouping/          # PR/feature commit grouping
│   ├── llm/               # LLM provider abstraction
│   ├── cache/             # SQLite index
│   ├── breakage.ts        # SZZ-lite breakage analysis
│   ├── impact.ts          # Commit impact graph
│   ├── insights.ts        # Dashboard aggregations
│   ├── wrapped.ts         # Year-in-review computation
│   ├── annotations.ts     # Per-commit notes store
│   ├── presets.ts         # CLI preset persistence
│   └── snapshot.ts        # Time-travel ref resolution
├── frontend/src/app/      # Angular application
│   ├── components/        # All UI components
│   ├── services/          # API communication services
│   ├── models/            # TypeScript interfaces
│   └── pipes/             # Markdown pipe, etc.
├── src/__tests__/         # Jest test suite
├── docs/                  # Documentation
├── public/                # Fallback static files
└── scripts/               # Build helpers
```
