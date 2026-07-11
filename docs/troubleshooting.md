# Troubleshooting

## `npx git-history-ui` says this is not a git repository

Run the command from inside a git repository, or pass a repository path:

```bash
npx git-history-ui@latest --cwd /path/to/repo
```

## Port 3000 is already in use

Choose a different port:

```bash
npx git-history-ui@latest --port 8080
```

## The browser did not open automatically

Start without auto-open and visit the URL manually:

```bash
npx git-history-ui@latest --no-open
```

Then open `http://localhost:3000`.

## AI features are disabled

AI ranking and summaries require an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

Defaults are `claude-sonnet-4-6` for Anthropic and `gpt-4.1-nano`
for OpenAI. You can override them with:

```bash
export GHUI_LLM_MODEL=your-model
export ANTHROPIC_MODEL=claude-sonnet-4-6
export OPENAI_MODEL=gpt-4.1-nano
```

To force heuristic-only mode:

```bash
export GHUI_LLM_PROVIDER=heuristic
```

## SQLite indexing is unavailable

`better-sqlite3` is optional. If it cannot install on your system,
`git-history-ui` silently falls back to direct git commands.

You can still use the app normally. Large repositories may load more slowly
until the native dependency is available.

## Large repositories load slowly

Try these options:

```bash
npx git-history-ui@latest --since 2024-01-01
npx git-history-ui@latest --file src/
```

Then build the optional local index from the UI or API:

```bash
curl -X POST http://localhost:3000/api/index/build
```

## GitHub PR titles do not appear in grouped view

Set a read-only GitHub token:

```bash
export GITHUB_TOKEN=ghp_...
```

The token is used only from your local machine to call the GitHub API.
Responses are cached to disk per-repository under `~/.git-history-ui/`; if
data looks stale after renaming a remote, delete that repo's `pr-cache.json`.

## A deep link opens the wrong repository, or nothing at all

`--repo-from-url` / `git-history-ui://open?repo=...` only matches a local
checkout whose `git remote -v` output contains the requested owner/repo path.
Resolution checks a fixed list of common directories under your home directory
and uses the first matching clone. If you have multiple clones or keep the
checkout elsewhere, pass an explicit `--cwd /path/to/repo`; make sure that
checkout has a matching `origin` (or any) remote configured.

## The "new commits available" toast never appears

The toast relies on an SSE connection to `/api/events`, which watches
`.git/HEAD` and `.git/refs` for changes. This only fires for commits made
*after* the app is running — it won't retroactively detect history that
changed while the server was down. Corporate proxies that buffer
`text/event-stream` responses can also prevent SSE from working; try
`--host 0.0.0.0 --token "$GIT_HISTORY_UI_TOKEN"` behind a proxy that passes
SSE through unbuffered.
