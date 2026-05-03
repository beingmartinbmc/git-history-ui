# API Reference

`git-history-ui` runs a local Express server for the browser UI. The API is
intended for local tooling and integrations; it is not a hosted SaaS API.

By default, endpoints are available at `http://localhost:3000/api`.

## Health and metadata

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Process health, uptime, and pid. |
| `GET` | `/api/version` | Package version, selected LLM provider, GitHub enrichment, SQLite availability. |

## Git history

| Method | Path | Query / body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/commits` | `file`, `since`, `until`, `author`, `branch`, `search`/`q`, `page`, `pageSize` | Paginated commit list. |
| `GET` | `/api/commits/stream` | Same as `/api/commits` | Server-sent events stream with `commit`, `done`, and `error` events. |
| `GET` | `/api/commit/:hash` | — | Single commit details. |
| `GET` | `/api/diff/:hash` | — | Diff for one commit. |
| `GET` | `/api/diff` | `from`, `to` | Range diff between two refs. |
| `GET` | `/api/tags` | — | Repository tags. |
| `GET` | `/api/branches` | — | Repository branches. |
| `GET` | `/api/authors` | — | Known commit authors. |

## Search, grouping, and analysis

| Method | Path | Query / body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/search` | `q`/`query`, `branch`, `file`, `author`, `since`, `until`, `page`, `pageSize` | Natural-language search with heuristic parsing and optional LLM scoring. |
| `GET` | `/api/groups` | `since`, `until`, `author`, `branch`, `maxCommits` | Commit groups inferred from PR merges, squash merges, and Conventional Commits scopes. |
| `GET` | `/api/snapshot` | `at` | Branch and tag positions at an ISO date/time. |
| `GET` | `/api/file-stats` | `file` | Per-file history and churn metadata. |
| `GET` | `/api/blame` | `file` | Porcelain blame parsed into line metadata. |
| `GET` | `/api/impact/:hash` | — | Files touched, affected modules, dependency ripple, and related commits. |
| `GET` | `/api/insights` | `since`, `until`, `branch`, `maxCommits` | Contributors, hotspots, churn over time, and risky-file score. |

## Optional AI endpoints

These require either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/api/summarize-diff` | `{ "text": "..." }` | Summarize diff text. |
| `POST` | `/api/explain-commit/:hash` | — | Explain one commit using its metadata and changed files. |

When no AI provider is configured, these endpoints return `503`.

## Local annotations and sharing

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/annotations/:hash` | — | List local comments for a commit. |
| `POST` | `/api/annotations/:hash` | `{ "author": "...", "body": "..." }` | Add a local comment. |
| `DELETE` | `/api/annotations/:hash/:id` | — | Delete a local comment. |
| `POST` | `/api/share` | `{ "viewState": { ... } }` | Return a local URL with view state encoded in the query string. |

Annotations are stored locally under `~/.git-history-ui/`.

## SQLite index

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/index/stats` | Current optional SQLite index status. |
| `POST` | `/api/index/build` | Build or refresh the local SQLite FTS index. |

If the optional native `better-sqlite3` dependency is unavailable, the server
falls back to git-shelling paths.
