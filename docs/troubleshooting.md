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
