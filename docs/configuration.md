# Configuration

`git-history-ui` is zero-config by default. Run it inside any git repository:

```bash
npx git-history-ui@latest
```

## CLI flags

| Flag | Default | Description |
| --- | --- | --- |
| `--port <number>` | `3000` | Local server port. |
| `--host <host>` | `localhost` | Host to bind. Use `0.0.0.0` for containers. |
| `--file <path>` | — | Start with commits filtered to a file path. |
| `--since <date>` | — | Start with commits after a date (`YYYY-MM-DD`). |
| `--author <name>` | — | Start with commits filtered by author. |
| `--cwd <path>` | Current directory | Git repository to inspect. |
| `--no-open` | `false` | Do not open the browser automatically. |
| `--llm <provider>` | Auto | Force `heuristic`, `anthropic`, or `openai`. |
| `--preset <name>` | — | Load saved filters. |
| `--save-preset <name>` | — | Save current filters for reuse. |

## Environment variables

| Variable | Required? | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | No | Enables Anthropic ranking and summaries. |
| `OPENAI_API_KEY` | No | Enables OpenAI ranking and summaries. |
| `GHUI_LLM_PROVIDER` | No | Force `anthropic`, `openai`, or `heuristic`. |
| `GHUI_LLM_MODEL` | No | Override the selected AI provider model. |
| `ANTHROPIC_MODEL` | No | Override the Anthropic model; takes precedence over `GHUI_LLM_MODEL`. |
| `OPENAI_MODEL` | No | Override the OpenAI model; takes precedence over `GHUI_LLM_MODEL`. |
| `GITHUB_TOKEN` | No | Enriches PR groups with GitHub titles, authors, and labels. Use a read-only token. |
| `PORT` | No | Production server port when running `dist/backend/server.js` directly. |
| `HOST` | No | Production server host when running `dist/backend/server.js` directly. |

## AI privacy model

- Heuristic mode works without network calls.
- AI features are opt-in and use the key you provide.
- Repository data is sent only to the selected provider for the specific action
  you requested.
- API keys are read from environment variables and are not written to disk.

## Saved local state

`git-history-ui` stores local-only data in `~/.git-history-ui/`, including:

- CLI presets
- Per-repository annotations
- Optional SQLite indexes

Delete that directory to reset all local state.
