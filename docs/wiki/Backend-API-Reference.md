# Backend API Reference

All API routes are served under `/api/` and protected by rate limiting (600 req/min) and optional token auth.

## Authentication

When `GIT_HISTORY_UI_TOKEN` is set (or `--token` CLI flag), non-loopback requests must authenticate:

- **Header:** `Authorization: Bearer <token>`
- **Header:** `X-Git-History-Token: <token>`
- **Query:** `?token=<token>`

Loopback requests (127.0.0.1, ::1) bypass auth.

---

## Health & Meta

### `GET /api/health`

```json
{ "status": "ok", "uptime": 123.45, "pid": 12345 }
```

### `GET /api/version`

```json
{
  "name": "git-history-ui",
  "version": "5.2.1",
  "llm": { "provider": "anthropic", "isAi": true },
  "githubEnrichment": false,
  "sqliteAvailable": true
}
```

---

## Commits

### `GET /api/commits`

Paginated commit listing with filters.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `pageSize` | int | 25 | Items per page (max 500) |
| `author` | string | — | Filter by author name |
| `since` | string | — | ISO date / git date expression |
| `until` | string | — | ISO date / git date expression |
| `branch` | string | — | Branch name |
| `file` | string | — | File path filter |
| `search` | string | — | Text search (grep) |

**Response:**
```json
{
  "commits": [
    {
      "hash": "abc123...",
      "shortHash": "abc123",
      "author": "Alice",
      "authorEmail": "alice@example.com",
      "date": "2025-01-15T10:30:00+00:00",
      "subject": "fix: login validation",
      "body": "Extended description...",
      "parents": ["def456..."],
      "branches": ["main"],
      "tags": ["v1.2.0"],
      "isMerge": false
    }
  ],
  "total": 1234,
  "page": 1,
  "pageSize": 25,
  "totalPages": 50,
  "hasNext": true,
  "hasPrevious": false
}
```

### `GET /api/commits/stream`

Server-Sent Events stream of commits. Same query params as `/api/commits`.

**Events:**
- `commit` — individual commit object
- `done` — pagination summary
- `error` — error message

### `GET /api/commit/:hash`

Single commit by full or short hash.

---

## Diff

### `GET /api/diff/:hash`

Diff for a single commit.

**Response:** `DiffFile[]`
```json
[
  {
    "file": "src/app.ts",
    "oldFile": null,
    "status": "modified",
    "additions": 15,
    "deletions": 3,
    "changes": "--- a/src/app.ts\n+++ b/src/app.ts\n..."
  }
]
```

### `GET /api/diff?from=<hash>&to=<hash>`

Range diff between two commits.

---

## Search

### `GET /api/search`

Natural-language or literal search.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `q` / `query` | string | **Required.** Search query |
| `page` | int | Page number |
| `pageSize` | int | Results per page |
| `branch` | string | Branch filter |
| `file` | string | File filter |
| `author` | string | Author filter |
| `since` | string | Date filter |
| `until` | string | Date filter |

**Response:**
```json
{
  "commits": [...],
  "total": 42,
  "page": 1,
  "pageSize": 25,
  "totalPages": 2,
  "hasNext": true,
  "hasPrevious": false,
  "parsedQuery": {
    "keywords": ["login", "bug"],
    "author": null,
    "since": "2025-06-01",
    "until": null
  },
  "usedLlm": true,
  "llmProvider": "anthropic"
}
```

**Behavior:**
1. If SQLite index is available and no path/branch filters → uses FTS5 search
2. Otherwise → `parseNlQuery()` extracts intent → `runNlSearch()` fetches candidates from git → optional LLM re-ranking

---

## Groups (PR / Feature Grouping)

### `GET /api/groups`

**Query params:** `since`, `until`, `author`, `branch`, `maxCommits` (default 1000, max 5000)

**Response:** Array of commit groups with metadata (PR titles if `GITHUB_TOKEN` is set).

---

## Impact Analysis

### `GET /api/impact/:hash`

**Response:**
```json
{
  "files": ["src/a.ts", "src/b.ts"],
  "modules": ["auth", "payments"],
  "relatedCommits": [
    { "hash": "...", "subject": "..." }
  ]
}
```

Computes dependency ripple from JS/TS imports, file co-occurrence, and recent commit history.

---

## Breakage Analysis

### `GET /api/breakage?file=<path>`

SZZ-lite analysis for a file.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `file` | string | **Required** | File path |
| `limit` | int | 200 | Max commits to analyze (max 1000) |

**Response:**
```json
{
  "file": "src/auth/login.ts",
  "totalCommits": 87,
  "fixCount": 12,
  "riskScore": 65,
  "summary": "87 recent commits, 12 look like fixes/reverts. Most likely culprit: abc1234 \"refactor auth flow\" by Alice. High breakage risk — fixes frequently follow recent changes.",
  "commits": [...],
  "fixCommits": [...],
  "suspects": [
    {
      "hash": "...",
      "shortHash": "abc1234",
      "subject": "refactor auth flow",
      "author": "Alice",
      "date": "...",
      "churn": 245,
      "score": 12,
      "reasons": ["immediately preceded a fix", "large change (>=100 lines)", "fix landed within a week"],
      "linkedFixes": [...]
    }
  ],
  "coChangedFiles": [
    { "file": "src/auth/session.ts", "count": 5 }
  ]
}
```

---

## Insights

### `GET /api/insights`

**Query params:** `since`, `until`, `branch`, `maxCommits` (default 500, max 5000)

**Response:**
```json
{
  "windowStart": "2025-01-01",
  "windowEnd": "2025-12-31",
  "totalCommits": 1234,
  "totalAuthors": 15,
  "topContributors": [...],
  "hotspots": [...],
  "churnByDay": [...],
  "riskyFiles": [...]
}
```

---

## Git Wrapped

### `GET /api/wrapped`

**Query params:** `year`, `since`, `until`, `branch`, `author`, `maxCommits` (default 5000, max 20000)

**Response:** `WrappedStats` object with top contributors, files, words, superlatives, night-owl/weekend-warrior percentages.

---

## AI Endpoints

### `POST /api/summarize-diff`

**Body:** `{ "text": "<unified diff text>" }`

**Response:** `{ "summary": "...", "provider": "anthropic" }`

Returns `503` if no AI provider is configured.

### `POST /api/explain-commit/:hash`

**Response:** `{ "summary": "## What changed\n...\n## Why reviewers should care\n...", "provider": "anthropic" }`

---

## Annotations

### `GET /api/annotations/:hash`

List comments for a commit.

### `POST /api/annotations/:hash`

**Body:** `{ "author": "Alice", "body": "Great change!" }`

**Response:** `201` with the created annotation object.

### `DELETE /api/annotations/:hash/:id`

**Response:** `204` on success, `404` if not found.

---

## Index Management

### `GET /api/index/status`

```json
{
  "available": true,
  "total": 5000,
  "running": false,
  "progress": { "indexed": 5000, "total": 5000, "phase": "done" }
}
```

### `POST /api/index/build`

Start building the index. `?wait=true` waits for completion.

**Response:** `202` (started) or `200` (completed if `wait=true`).

### `POST /api/index/rebuild`

Force a fresh index scan. **Response:** `202`.

### `POST /api/index/cancel`

Abort an in-progress build.

---

## Other Endpoints

### `GET /api/blame?file=<path>`

Git blame for a file. Returns array of `BlameLine` objects.

### `GET /api/snapshot?at=<ISO date>`

Resolve branch/tag heads at a point in time for time-travel.

### `GET /api/file-stats?file=<path>`

File-specific statistics.

### `GET /api/tags`
### `GET /api/branches`
### `GET /api/authors`

Simple lists.

### `POST /api/share`

**Body:** `{ "viewState": { "commit": "abc123", "file": "src/app.ts" } }`

**Response:** `{ "url": "http://localhost:3000/?commit=abc123&file=src/app.ts", "expiresAt": null, "mode": "local" }`

---

## Error Handling

All errors return JSON: `{ "error": "<message>" }`

- `400` — Bad request / missing params
- `401` — Unauthorized (token required but not provided)
- `403` — CORS violation
- `404` — Route not found
- `413` — Payload too large (e.g., annotation body > 5000 chars)
- `429` — Rate limited
- `500` — Internal server error
- `503` — Service unavailable (AI endpoint with no key)
