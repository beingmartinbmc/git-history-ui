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
| `GET` | `/api/events` | — | Server-sent events stream that emits `new-commits` whenever `.git/refs` changes (live update toast). |
| `GET` | `/api/commit/:hash` | — | Single commit details. |
| `GET` | `/api/diff/:hash` | — | Full diff for one commit (all files, full patch text). |
| `GET` | `/api/diff` | `from`, `to` | Range diff between two refs. |
| `GET` | `/api/diff/:hash/files` | — | Lazy diff metadata: file list with add/delete counts via `git diff-tree --numstat` — no patch text. Includes `isLarge` flag. |
| `GET` | `/api/diff/:hash/file` | `path` (required) | Full patch text for a single file only, loaded on demand. |
| `GET` | `/api/tags` | — | Repository tags. |
| `GET` | `/api/branches` | — | Repository branches. |
| `GET` | `/api/authors` | — | Known commit authors. |
| `GET` | `/api/stashes` | — | List `git stash` entries. |
| `GET` | `/api/reflog` | `limit` (default 50, max 200) | Recent `git reflog` entries. |
| `GET` | `/api/pickaxe` | `pattern` (required), `mode` (`S` or `G`), `author`, `since`, `until`, `file`, `branch` | Code-content search — commits that added/removed a string (`-S`) or matched a regex (`-G`). |

## Search, grouping, and analysis

| Method | Path | Query / body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/search` | `q`/`query`, `branch`, `file`, `author`, `since`, `until`, `page`, `pageSize` | Natural-language search. When the local SQLite index is available and no `branch`/`file` filter is set, `author`/`since`/`until` are pushed down into the indexed FTS5 query (with exact `total` counts and true `LIMIT`/`OFFSET` paging); otherwise falls back to heuristic parsing + optional LLM scoring over `git log`. |
| `GET` | `/api/groups` | `since`, `until`, `author`, `branch`, `maxCommits` | Commit groups inferred from PR merges, squash merges, and Conventional Commits scopes. |
| `GET` | `/api/snapshot` | `at` | Branch and tag positions at an ISO date/time. |
| `GET` | `/api/file-stats` | `file` | Per-file history and churn metadata. |
| `GET` | `/api/blame` | `file` | Porcelain blame parsed into line metadata. |
| `GET` | `/api/impact/:hash` | — | Files touched, affected modules, dependency ripple, and related commits. |
| `GET` | `/api/insights` | `since`, `until`, `branch`, `maxCommits` | Contributors, hotspots, churn over time, and risky-file score. |
| `GET` | `/api/wrapped` | `year`, `since`, `until`, `branch`, `author`, `maxCommits` | "Git Wrapped" year-in-review: totals, top contributors/files/words, night-owl & weekend percentages, biggest commit, busiest day/hour, longest streak. |

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

## Export

| Method | Path | Query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/export/commits` | Same as `/api/commits`, plus `format` (`json` default or `csv`) | Download the (filtered) commit list as an attachment. |
| `GET` | `/api/export/insights` | `since`, `until`, `branch` | Download the insights bundle as `insights.json`. |
| `GET` | `/api/export/wrapped` | `year` | Download the Wrapped stats as `wrapped.json`. |

## Presets

CLI presets (`~/.git-history-ui/presets.json`) are also exposed to the web UI:

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/presets` | — | List all saved presets. |
| `POST` | `/api/presets/:name` | Filter object | Save/overwrite a preset (name capped at 50 chars). |
| `DELETE` | `/api/presets/:name` | — | Delete a preset. |

## SQLite index

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/index/status` (alias: `/api/index/stats`) | Current index status: `available`, `total`, `running`, `progress`. |
| `POST` | `/api/index/build` | Build the local SQLite FTS index. `?wait=true` blocks until complete (`200`); otherwise returns immediately (`202`). |
| `POST` | `/api/index/rebuild` | Force a fresh full rescan, discarding the existing index. |
| `POST` | `/api/index/cancel` | Abort an in-progress build. |

If the optional native `better-sqlite3` dependency is unavailable, the server
falls back to git-shelling paths for both search and pickaxe.
