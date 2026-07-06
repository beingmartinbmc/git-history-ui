# Git History UI

<p align="center">
  <a href="https://github.com/beingmartinbmc/git-history-ui">
    <img src="https://raw.githubusercontent.com/beingmartinbmc/git-history-ui/main/docs/images/banner.png" alt="Git History UI — Git intelligence in your browser" width="900">
  </a>
</p>

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![install size](https://packagephobia.com/badge?p=git-history-ui)](https://packagephobia.com/result?p=git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui)

**Git Intelligence in your browser.**

Turn your git history into something you can actually understand:

- 🔎 Ask questions in plain English, or pickaxe-search code content itself
- ⚡ Search big histories through a local Git intelligence index
- 📦 See commits grouped by feature or PR
- 🕰️ Travel through time and diff any state
- 🎯 Understand impact, not just changes
- 🔴 Get notified live when new commits land, no refresh needed

Zero setup. Runs locally. Your code never leaves your machine unless you opt in.

```bash
npx git-history-ui@latest
```

## Table of contents

- [10-second workflow](#-10-second-workflow)
- [Preview](#-preview)
- [Why this exists](#-why-this-exists)
- [What makes it different](#-what-makes-it-different)
- [Quick Start](#-quick-start)
- [How it compares](#-how-it-compares)
- [All features](#-all-features)
- [Usage](#-usage)
- [Docs](#-docs)
- [Production](#-production)
- [Development](#-development)
- [Requirements](#-requirements)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

## ⚡ 10-second workflow

> `npx git-history-ui@latest` is the fastest way to see it for yourself —
> it opens in your browser in under a second.

## 🖼️ Preview

<p align="center">
  <img src="https://raw.githubusercontent.com/beingmartinbmc/git-history-ui/main/docs/images/preview.png" alt="Git History UI — commit graph, commit list, and side-by-side diff viewer" width="900">
</p>

## 🤔 Why this exists

Git history is hard to understand:

- commits are flat
- context is missing
- debugging across branches is painful
- GitHub's UI hides your local and unpushed work

`git-history-ui` turns that history into something **searchable, grouped,
explorable, and explainable** — without a desktop install or a cloud
account.

## ✨ What makes it different

Five things you don't get from `git log`, GitHub, or most desktop clients:

- **Natural-language search.** "login bug last month", "payments by alice".
  A heuristic intent parser handles dates, authors, and keyword synonyms;
  optional Anthropic / OpenAI key adds semantic re-ranking on top.
- **Local Git intelligence index.** Build, rebuild, monitor, or cancel a
  SQLite/FTS-backed commit index from the UI so large repositories stay fast
  without sending history to a server.
- **PR & feature grouping.** Switch the commit list to *Grouped* mode to
  see commits clustered by pull request or Conventional Commits scope.
- **Time-travel timeline.** A horizontal slider that scrubs the repo state
  at any point in time and live-diffs it against HEAD.
- **Commit impact analysis.** One click reveals which files, modules, and
  related commits a change actually touches — not just the diff.

## 🤝 AI is optional, opt-in, and on your key

- Heuristic mode works out of the box, no key required.
- Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to upgrade NL search ranking
  and unlock "Explain change" / "Summarize diff" actions.
- Prompts run from your machine to your provider. Your repo, your key,
  your call.

## 🚀 Quick Start

```bash
cd /path/to/your/project
npx git-history-ui@latest
```

That's it. The app starts on `http://localhost:3000` and opens your
browser automatically. It reads history from the current working
directory — no installs, no config, no account.

## ⚖️ How it compares

| Capability | `git-history-ui` | GitHub UI | `tig` / `git log` | Desktop clients |
| --- | --- | --- | --- | --- |
| Works with local and unpushed commits | Yes | No | Yes | Usually |
| Natural-language history search | Yes | No | No | Rare |
| Local indexed search for large repos | Yes | No | No | Partial |
| PR / feature grouping for local history | Yes | Partial | No | Partial |
| Time-travel snapshot diffing | Yes | No | No | Rare |
| Commit impact analysis | Yes | No | No | Rare |
| Browser-based unified / split diffs | Yes | Yes | No | Yes |
| Optional AI summaries on your key | Yes | No | No | Rare |
| No account, import, or desktop install | Yes | No | Yes | No |

## 📦 All features

<details>
<summary><strong>Click to expand the full feature list</strong></summary>

### Exploration

- **Canvas commit graph** with branch lanes, ref pills, hover/selected
  states; viewport-virtualized so 50k-commit histories stay smooth.
- **Real-time filtering** by author, date, text, file path.
- **Load more / infinite scroll** for large repositories — the selected
  commit stays pinned in view while more history loads.
- **Unified & split diffs** with `highlight.js`, collapse-unchanged
  blocks, side-by-side scroll-sync, and intra-line word highlighting.
- **Lazy diff loading.** Commit detail fetches file metadata first
  (`git diff-tree --numstat`), then the full patch only for the file
  you have open — large commits stay responsive.
- **Code-content search (pickaxe).** Find every commit that added or
  removed a specific string or regex (`git log -S` / `-G`), scoped by
  author, date, branch, or file.
- **Stash & reflog explorer.** Browse `git stash list` and `git reflog`
  from the UI without dropping to a terminal.
- **Branch / tag compare view.** Diff any two refs side by side.
- **Live updates.** A toast appears when new commits land on the
  watched branch (via SSE), so you always know when to refresh.
- **Dark / light / system theme** with single-click toggle.

### Code understanding

- **File-level history.** Click any file in a commit to see every commit
  that touched it.
- **Blame view** powered by `highlight.js`, tabbed inside file history.
- **Insights dashboard.** Top contributors, hotspots (treemap), churn
  over time (d3 area chart), heuristic risky-files score.
- **Commit impact card.** Files touched, modules affected, dependency
  ripple parsed from JS/TS imports, related commits — including a d3
  force-directed graph view.

### Collaboration

- **Local-first annotations.** Per-commit comment threads stored in
  `~/.git-history-ui/<repo>/annotations.json`, with cross-process file
  locking so concurrent writes stay safe.
- **Shareable URLs.** `POST /api/share` returns a deep link with the
  current view-state encoded in the query string — no relay server
  required for the common case.
- **Deep linking.** `git-history-ui://open?repo=...&at=...&pr=...`
  protocol URLs (and `?commit=`, `?pr=`, `?author=`, `?file=` query
  params on the web UI) jump straight to a commit, PR group, or filter.
- **Export.** Download commits (CSV/JSON), insights, or Wrapped as
  files via `/api/export/*` or the toolbar's Export button.
- **"Explain this change"** AI card on the commit detail panel (opt-in).

### Performance & scale

- **Git intelligence index (optional).** When `better-sqlite3` is
  available, commit metadata is indexed locally with SQLite/FTS5 in
  `~/.git-history-ui/`. Search automatically uses the index when it can and
  falls back to git-shelling when the native module is unavailable.
- **Index status controls.** A floating status card shows availability,
  indexed commit count, build progress, and last build time, with one-click
  Build, Rebuild, and Cancel actions. API endpoints: `GET /api/index/status`,
  `GET /api/index/stats`, `POST /api/index/build`,
  `POST /api/index/rebuild`, `POST /api/index/cancel`.
- **Streaming commits.** `GET /api/commits/stream` (SSE) pushes commits
  as `git log` produces them.
- **Virtualized commit graph.** Only the visible viewport is painted;
  scrolling is `requestAnimationFrame`-throttled.
- **Bounded git concurrency.** All `git` subprocesses go through a
  shared queue (default: 4 concurrent) so fanned-out UI requests (diffs,
  blame, impact) can't exhaust file descriptors or spike CPU.
- **Short-TTL server caches** for insights, PR groups, and Wrapped —
  invalidated automatically the moment new commits are detected.

### CLI

- **Presets.** `--preset <name>` / `--save-preset <name>` and a
  `git-history-ui presets list|delete` subcommand, stored in
  `~/.git-history-ui/presets.json`.
- **Standard filters.** `--file`, `--author`, `--since`, `--port`,
  `--no-open`, `--cwd`, `--llm <provider>`.

### Embeds (experimental scaffolds)

- **Chrome extension** (`apps/chrome-extension/`) injects a "View in
  git-history-ui" button on github.com PR / commit pages.
- **GitHub App** (`apps/github-app/`) scaffold for the same deep-link
  strategy at the org level.

See [`CHANGELOG.md`](./CHANGELOG.md) for per-version detail.

</details>

## 📖 Usage

Run from inside the git repository you want to inspect.

```bash
npx git-history-ui@latest --port 8080         # custom port
npx git-history-ui@latest --file src/app.js   # filter by file
npx git-history-ui@latest --author "alice"    # filter by author
npx git-history-ui@latest --since 2024-01-01  # filter by date
npx git-history-ui@latest --no-open           # don't open the browser
npx git-history-ui@latest --help              # full flag list
```

### CLI reference

```text
Usage: git-history-ui [options] [command]

Beautiful git history visualization in your browser

Options:
  -v, --version            output the version number
  -p, --port <number>      port to run server on (default: "3000")
  -H, --host <host>        host to bind to (default: "localhost")
  -f, --file <path>        filter commits by a specific file
  -s, --since <date>       filter commits since a date (YYYY-MM-DD)
  -a, --author <name>      filter commits by author
  --no-open                do not automatically open browser
  --cwd <path>             path to the git repository (defaults to cwd)
  --llm <provider>         LLM provider: heuristic, anthropic, openai (default:
                           auto)
  --token <token>          protect API routes with a bearer/header token for
                           non-local clients
  --preset <name>          load filters from a saved preset
  --save-preset <name>     save the current flags as a preset for next time
  --repo-from-url <url>    open a repo from a git-history-ui:// protocol URL
  --at <ref>               select a commit or ref on startup
  --pr <number>            focus a pull request number on startup
  -h, --help               display help for command

Commands:
  presets <action> [name]  manage saved CLI presets
  wrapped [options]        print a "Git Wrapped" year-in-review for the repo
```

### Git Wrapped

Generate a shareable year-in-review for any repo, straight from the terminal:

```bash
npx git-history-ui wrapped                 # current year
npx git-history-ui wrapped --year 2025     # a specific year
npx git-history-ui wrapped --author alice  # one contributor
npx git-history-ui wrapped --json          # raw JSON for scripting
```

The same data powers the in-browser **Insights → Wrapped** card, which you can
export as an image to share on social media. Everything is computed locally —
no commit content leaves your machine.

### Optional: build the local Git intelligence index

For large repositories, `git-history-ui` can build a local SQLite/FTS index of
commit metadata. The index lives under `~/.git-history-ui/`, is keyed per
repository, and is used automatically for unfiltered text search when it is
available. Nothing is uploaded.

Most users can just use the floating **Search index** card in the app:

- **Build** creates the index in the background.
- **Rebuild** forces a fresh scan after major history changes.
- **Cancel** stops an in-progress build.

You can also drive it through the local API:

```bash
curl http://localhost:3000/api/index/status
curl -X POST http://localhost:3000/api/index/build
curl -X POST 'http://localhost:3000/api/index/build?wait=true'
curl -X POST http://localhost:3000/api/index/rebuild
curl -X POST http://localhost:3000/api/index/cancel
```

If the optional native `better-sqlite3` dependency cannot load for your Node
version or platform, the app keeps working and falls back to the slower git
path. Try `npm rebuild better-sqlite3` if you want to repair indexed search.

### Optional: bring your own AI key

```bash
# Anthropic (uses Claude Sonnet 4 by default)
export ANTHROPIC_API_KEY=sk-ant-...

# Or OpenAI (uses GPT 4.1 Nano by default)
export OPENAI_API_KEY=sk-...

# Force a specific provider when both are set
export GHUI_LLM_PROVIDER=anthropic   # anthropic | openai | heuristic

# Optional model overrides
export GHUI_LLM_MODEL=claude-sonnet-4-6
export ANTHROPIC_MODEL=claude-sonnet-4-6
export OPENAI_MODEL=gpt-4.1-nano
```

### Optional: GitHub PR enrichment

```bash
export GITHUB_TOKEN=ghp_...   # fine-grained PAT, read-only on the repo
```

This hydrates the *Grouped* view with PR titles, authors, and labels.

### Deep linking

Jump straight to a commit or PR from the CLI, a saved link, or the Chrome
extension:

```bash
npx git-history-ui@latest --at HEAD~3         # open at a specific commit/ref
npx git-history-ui@latest --pr 128            # open focused on a PR group
npx git-history-ui@latest --repo-from-url "git-history-ui://open?repo=https://github.com/owner/repo&at=abc123"
```

The web UI recognizes the same intent via query params —
`?commit=`, `?pr=`, `?author=`, `?since=`, `?until=`, `?branch=`, `?file=`,
`?mode=grouped` — so shared links and the `POST /api/share` output restore
the exact view.

## 📚 Docs

- [API reference](./docs/API.md)
- [Architecture](./docs/architecture.md)
- [Configuration](./docs/configuration.md)
- [Troubleshooting](./docs/troubleshooting.md)

## 🏭 Production

```bash
npm run build:production   # build backend + frontend
npm run start:production   # start the production server
```

### Docker

```bash
docker build -t git-history-ui .
docker run -p 3000:3000 git-history-ui
```

## 🛠️ Development

```bash
git clone https://github.com/beingmartinbmc/git-history-ui.git
cd git-history-ui
npm install
npm run dev          # runs backend + frontend with hot reload
npm test             # backend tests
cd frontend && npm test
```

## 📋 Requirements

- **Node.js**: 20.19.0+ or 22.12.0+
- **Git**: any version (must be in a git repository)

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local
setup, commit conventions, test commands, and PR expectations.

## 🔐 Security

`git-history-ui` is designed for local use and binds to `localhost` by default.
The server now also applies API rate limiting, local-origin CORS checks,
security headers, stricter request validation, safer repository path handling,
and request-abort handling around expensive git operations.

If you intentionally bind beyond localhost, protect API routes with a token:

```bash
npx git-history-ui@latest --host 0.0.0.0 --token "$GIT_HISTORY_UI_TOKEN"
# API clients may send either:
#   Authorization: Bearer <token>
#   X-Git-History-Token: <token>
```

Please do not open public issues for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for the responsible disclosure process.

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## ⭐ If this saved you time

[Star the repo](https://github.com/beingmartinbmc/git-history-ui) — it
helps more developers discover it, and it tells me which features to
double down on.
