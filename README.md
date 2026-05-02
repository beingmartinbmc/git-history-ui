# Git History UI

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm bundle size](https://img.shields.io/bundlephobia/min/git-history-ui.svg)](https://bundlephobia.com/result?p=git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui)

**Git Intelligence in your browser.**

Turn your git history into something you can actually understand:

- 🔎 Ask questions in plain English
- 📦 See commits grouped by feature or PR
- 🕰️ Travel through time and diff any state
- 🎯 Understand impact, not just changes

Zero setup. Runs locally. Your code never leaves your machine unless you opt in.

```bash
npx git-history-ui@latest
```

## ⚡ 10-second workflow

1. Run `npx git-history-ui` inside any git repo
2. Search: *"login bug last month"*
3. Jump to the commit
4. Inspect the diff and what it impacted

Done.

## 👀 Preview

![Git History UI screenshot](./docs/screenshot.png)

> A demo GIF showing NL search, the timeline slider, and grouped view is on
> the way. In the meantime, `npx git-history-ui@latest` is the fastest way
> to see it for yourself — it opens in your browser in under a second.

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

Four things you don't get from `git log`, GitHub, or most desktop clients:

- **Natural-language search.** "login bug last month", "payments by alice".
  A heuristic intent parser handles dates, authors, and keyword synonyms;
  optional Anthropic / OpenAI key adds semantic re-ranking on top.
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

- **vs GitHub UI:** NL search and PR grouping work *with* your unpushed
  commits. Time travel and impact analysis aren't on GitHub at all.
- **vs `tig` / `git log`:** visual lanes, browser diffs, optional AI
  explanations, insights dashboard.
- **vs desktop clients (GitKraken, SourceTree, Fork):** starts on demand,
  no project import, no account, no native install. AI features are
  pay-as-you-go on *your* key — nothing about your code leaves your
  machine unless you opt in.

## 📦 All features

<details>
<summary><strong>Click to expand the full feature list</strong></summary>

### Exploration

- **Canvas commit graph** with branch lanes, ref pills, hover/selected
  states; viewport-virtualized so 50k-commit histories stay smooth.
- **Real-time filtering** by author, date, text, file path.
- **Unified & split diffs** with `highlight.js`, collapse-unchanged
  blocks, side-by-side scroll-sync, and intra-line word highlighting.
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
  `~/.git-history-ui/<repo>/annotations.json`.
- **Shareable URLs.** `POST /api/share` returns a deep link with the
  current view-state encoded in the query string — no relay server
  required for the common case.
- **"Explain this change"** AI card on the commit detail panel (opt-in).

### Performance & scale

- **SQLite indexer (optional).** Install `better-sqlite3` and large
  repos get an FTS5-backed index in `~/.git-history-ui/`. Silent
  fallback to git-shelling when the native module isn't available.
  Endpoints: `GET /api/index/stats`, `POST /api/index/build`.
- **Streaming commits.** `GET /api/commits/stream` (SSE) pushes commits
  as `git log` produces them.
- **Virtualized commit graph.** Only the visible viewport is painted;
  scrolling is `requestAnimationFrame`-throttled.

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

### Optional: bring your own AI key

```bash
# Anthropic (recommended; uses claude-3-5-haiku by default)
export ANTHROPIC_API_KEY=sk-ant-...

# Or OpenAI (uses gpt-4o-mini by default)
export OPENAI_API_KEY=sk-...

# Force a specific provider when both are set
export GHUI_LLM_PROVIDER=anthropic   # anthropic | openai | heuristic
```

### Optional: GitHub PR enrichment

```bash
export GITHUB_TOKEN=ghp_...   # fine-grained PAT, read-only on the repo
```

This hydrates the *Grouped* view with PR titles, authors, and labels.

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

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## ⭐ If this saved you time

[Star the repo](https://github.com/beingmartinbmc/git-history-ui) — it
helps more developers discover it, and it tells me which features to
double down on.
