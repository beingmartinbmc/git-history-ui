# Backend API Reference

This page is a concise map for **v5.4.0**. See the
[canonical API reference](../API.md) for complete query parameters, response
details, and limits; update that document first when routes change.

All routes are under `/api`. The general limiter allows 600 requests per
minute. When an AI provider is active, search, diff summarization, and commit
explanation also have a 20-request-per-minute limiter.

## Authentication

Loopback clients (`127.0.0.1` and `::1`) do not need a token. Non-loopback
binds fail to start unless `--token` or `GIT_HISTORY_UI_TOKEN` is set. Remote
clients can authenticate with:

- `Authorization: Bearer <token>`
- `X-Git-History-Token: <token>`
- HTTP Basic with any username and the token as the password

Query-string tokens are not accepted.

## Health, repository, and index

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Process health, uptime, and pid. |
| `GET` | `/api/version` | Package version, selected LLM, GitHub enrichment, SQLite availability. |
| `GET` | `/api/repository` | Credential-free repository identity and configured Git author. |
| `GET` | `/api/index/status` | Index availability and build progress. |
| `GET` | `/api/index/stats` | Alias of index status. |
| `POST` | `/api/index/build` | Start an index build; `?wait=true` waits for completion. |
| `POST` | `/api/index/rebuild` | Force a fresh index build. |
| `POST` | `/api/index/cancel` | Cancel an active build. |

## History and diffs

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/commits` | Paginated commit list; `pageSize` is capped at 500. |
| `GET` | `/api/commits/stream` | Commit SSE stream. |
| `GET` | `/api/events` | Ref-change SSE notifications. |
| `GET` | `/api/commit/:hash` | One commit by a 4-40 character hex hash. |
| `GET` | `/api/diff/:hash` | Full commit diff. |
| `GET` | `/api/diff?from=...&to=...` | Diff two refs. |
| `GET` | `/api/diff/:hash/files` | Per-file diff metadata without patch text. |
| `GET` | `/api/diff/:hash/file?path=...` | Patch text for one repository-relative file. |
| `GET` | `/api/report/:hash` | JSON or Markdown commit investigation report. |
| `GET` | `/api/report?from=...&to=...` | JSON or Markdown range investigation report. |
| `GET` | `/api/tags` | Tags. |
| `GET` | `/api/branches` | Branches. |
| `GET` | `/api/authors` | Commit author names. |
| `GET` | `/api/authors/details` | Distinct author name/email identities. |

## Search and analysis

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/search` | Natural-language/literal search with optional SQLite acceleration. |
| `GET` | `/api/groups` | PR and feature commit groups; `maxCommits` defaults to 1000. |
| `GET` | `/api/snapshot` | Ref positions at a requested time. |
| `GET` | `/api/file-stats` | First/last touch, commit count, and contributors for one file. |
| `GET` | `/api/blame` | Porcelain blame for a repository-relative file. |
| `GET` | `/api/impact/:hash` | Files, modules, dependency ripple, and related commits. |
| `GET` | `/api/breakage` | SZZ-lite analysis; `limit` defaults to 200 and is capped at 1000. |
| `GET` | `/api/insights` | Contributors, hotspots, churn, and risk; `maxCommits` defaults to 5000 and is capped at 20000. |
| `GET` | `/api/wrapped` | Year-in-review data; `maxCommits` defaults to 5000 and is capped at 20000. |
| `GET` | `/api/pickaxe` | Git-backed `-S` string or `-G` regex content search. |
| `GET` | `/api/stashes` | Stash entries. |
| `GET` | `/api/reflog` | Reflog entries; `limit` defaults to 50 and is capped at 200. |

## Optional AI

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/summarize-diff` | Summarize supplied diff text. |
| `POST` | `/api/explain-commit/:hash` | Explain commit metadata and changed files. |

These return `503` unless the active provider is Anthropic or OpenAI. A key
enables its provider, while explicitly selecting heuristic mode keeps these
endpoints unavailable.

## Annotations, sharing, and presets

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/annotations/:hash` | List local annotations. |
| `POST` | `/api/annotations/:hash` | Create a local annotation (`201`). |
| `DELETE` | `/api/annotations/:hash/:id` | Delete a local annotation. |
| `POST` | `/api/share` | Create a portable deep link (`201`). |
| `GET` | `/api/presets` | List saved presets. |
| `POST` | `/api/presets/:name` | Save a preset (`201`). |
| `DELETE` | `/api/presets/:name` | Delete a preset. |

`POST /api/share` requires a canonical GitHub or GitLab `origin`. It returns
`422` when no supported canonical remote exists. The response is:

```json
{
  "url": "git-history-ui://open?v=1&repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo&view=history",
  "expiresAt": null,
  "mode": "portable"
}
```

## Exports

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/export/commits` | One paged commit export, JSON or CSV, capped at 500 rows per request. |
| `GET` | `/api/export/insights` | Insights JSON. |
| `GET` | `/api/export/wrapped` | Wrapped JSON. |

Only commit export supports CSV.
