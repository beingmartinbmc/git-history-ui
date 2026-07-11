# Configuration

`git-history-ui` is zero-config by default. Run it inside any git repository:

```bash
npx git-history-ui@latest
```

## CLI flags

| Flag | Default | Description |
| --- | --- | --- |
| `--port <number>` | `3000` | Local server port. |
| `--host <host>` | `localhost` | Host to bind. Non-loopback hosts require `--token` or `GIT_HISTORY_UI_TOKEN`. |
| `--file <path>` | — | Start with commits filtered to a file path. |
| `--since <date>` | — | Start with commits after a date (`YYYY-MM-DD`). |
| `--author <name>` | — | Start with commits filtered by author. |
| `--cwd <path>` | Current directory | Git repository to inspect. |
| `--no-open` | `false` | Do not open the browser automatically. |
| `--llm <provider>` | Auto | Request `heuristic`, `anthropic`, or `openai`; an AI provider without its API key falls back to heuristic mode. |
| `--token <token>` | — | Protect UI and API traffic from non-loopback clients. |
| `--preset <name>` | — | Load saved filters. |
| `--save-preset <name>` | — | Save current filters for reuse. |
| `--repo-from-url <url>` | — | Resolve and open a versioned `git-history-ui://open?v=1&repo=...&view=...` URL. Verifies the local checkout's git remote before trusting it. |
| `--at <hash>` | — | Select a 4-40 character hexadecimal commit hash on startup (sets the `?commit=` deep link). |
| `--pr <number>` | — | Focus a pull request/group on startup (switches to Grouped view). |

`git-history-ui demo [--reset]` can run outside a repository. It creates or
reuses a deterministic repository under the OS temporary directory and makes
no network requests. Other server options such as `--port`, `--host`,
`--no-open`, `--llm`, and `--token` remain available.

## Environment variables

| Variable | Required? | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | No | Enables Anthropic ranking and summaries. |
| `OPENAI_API_KEY` | No | Enables OpenAI ranking and summaries. |
| `GHUI_LLM_PROVIDER` | No | Request `anthropic`, `openai`, or `heuristic`; unavailable keyed providers fall back to heuristic mode. |
| `GHUI_LLM_MODEL` | No | Override the selected AI provider model. |
| `ANTHROPIC_MODEL` | No | Override the Anthropic model; takes precedence over `GHUI_LLM_MODEL`. |
| `OPENAI_MODEL` | No | Override the OpenAI model; takes precedence over `GHUI_LLM_MODEL`. |
| `GITHUB_TOKEN` | No | Enriches PR groups with GitHub titles, authors, and labels. Use a read-only token. Cached responses are persisted per-repo under `~/.git-history-ui/`. |
| `GIT_HISTORY_UI_TOKEN` | For non-loopback binds | Same as `--token`; protects remote UI and API traffic. |
| `PORT` | No | Production server port when running `dist/backend/server.js` directly. |
| `HOST` | No | Production server host when running `dist/backend/server.js` directly. |

Remote clients can authenticate with `Authorization: Bearer <token>`,
`X-Git-History-Token: <token>`, or HTTP Basic using any username and the token
as the password. Tokens in query strings are not accepted.

When a same-host reverse proxy fronts a non-loopback deployment, it must forward
the real client address with `X-Forwarded-For`; otherwise the proxy's loopback
connection is indistinguishable from a local request. Keep the backend bound to
loopback and enforce authentication at the proxy when that header cannot be
trusted.

## Docker

Run the container from the repository you want to inspect:

```bash
export GIT_HISTORY_UI_TOKEN='choose-a-long-random-token'
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -e GIT_HISTORY_UI_TOKEN \
  -v "$PWD:/repo:ro" \
  git-history-ui
```

The application stays under `/app`; `/repo` is the read-only working
repository. Keep the published port on loopback unless remote access is
intentional. Container state under `/home/node/.git-history-ui` is ephemeral
unless that path is mounted separately.

## AI privacy model

- Heuristic mode works without network calls.
- AI features are opt-in and use the key you provide.
- Repository data is sent only to the selected provider for the specific action
  you requested.
- API keys are read from environment variables and are not written to disk.
- Portable deep links contain a canonical credential-free GitHub/GitLab remote
  plus allowlisted view state, including search, author, and file filters.
- The JSON investigation-report schema includes the canonical remote URL,
  configured Git author name/email, repo-relative filenames and change counts,
  commit subjects, authors/dates, and related commits. Its Markdown projection
  includes the target, summary, files, related commit subjects/authors, and
  portable URL. Reports exclude patch bodies and annotations by default, as
  well as local paths, localhost URLs, and credentials.

## Saved local state

`git-history-ui` stores local-only data in `~/.git-history-ui/`, including:

- CLI presets
- Per-repository annotations
- Optional SQLite indexes
- Per-repository GitHub PR-enrichment caches (`pr-cache.json`)

Delete that directory to reset all local state.

In Docker, the corresponding path is `/home/node/.git-history-ui`; it is lost
with an ephemeral container unless mounted as a separate volume.
