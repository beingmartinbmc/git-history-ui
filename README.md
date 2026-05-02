# Git History UI

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm bundle size](https://img.shields.io/bundlephobia/min/git-history-ui.svg)](https://bundlephobia.com/result?p=git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui)
[![GitHub issues](https://img.shields.io/github/issues/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui/issues)

**Git Intelligence in your browser.** A fast, zero-setup web UI that turns your
git history from a flat log into a navigable narrative — with natural-language
search, PR/feature grouping, time-travel snapshots, file-level history, blame,
commit impact analysis, and an insights dashboard. Optional AI integration
(Anthropic / OpenAI) supercharges search and explanations.

## 👀 Preview

![Git History UI screenshot](./docs/screenshot.png)

## 🚀 Quick Start

```bash
# Go to the git repository you want to inspect
cd /path/to/your/project

# Run directly with npx (no installation needed)
npx git-history-ui@latest
```

That's it! The application will start on `http://localhost:3000` and open your browser automatically.
It reads history from the current working directory, so run it inside the project whose commits you want to visualize.

No installs. No config. Just your commits, visualized.

## 🤔 Why use this?

- `git log` is powerful, but hard to scan when branches, merges, and long-lived work overlap.
- GitHub's commit UI does not show your local or unpushed commits.
- Desktop clients can be heavy when you just want a quick read on one repo.
- `git-history-ui` gives you a fast, local, visual way to explore history from any git repository.

## ✨ What's new in v3 — "Git Intelligence"

- **Natural-language search** — Ask "login bug last month" or "payments by alice".
  A built-in heuristic intent parser extracts dates, authors, and keyword
  synonyms; if you set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, it adds
  semantic re-ranking on top.
- **PR & feature grouping** — Switch the commit list to "Grouped" mode to see
  commits clustered by pull request (GitHub merge & squash patterns) or
  Conventional Commits scope (`feat(auth):`, `fix(payments):`). Optional
  GitHub PR enrichment when `GITHUB_TOKEN` is set.
- **Time travel** — A horizontal timeline slider that shows the repo state
  (HEAD, branches, tags) at any point and computes a live diff vs HEAD.
- **File history & blame** — Click any file in a commit's Files panel to see
  every commit that touched it, with a tabbed blame view powered by
  `highlight.js`.
- **Commit impact analysis** — One click reveals files touched, modules
  affected, dependency ripple (parsed from JS/TS imports), and other commits
  that touched the same files.
- **Insights dashboard** — Top contributors, hotspots, churn over time, and
  a heuristic risky-files score for code reviewers and tech leads.
- **AI extras (optional)** — "Explain this change" on commits and "Summarize"
  on diffs, both gated on a configured API key.
- **Local-first annotations** — Add notes to commits stored at
  `~/.git-history-ui/<repo>/annotations.json`.

Plus everything from v2:

- **Canvas commit graph** with branch lanes, ref pills, hover/selected states
- **Real-time filtering** by author, date, text, file path
- **Unified & split diffs** with `highlight.js`, plus collapse-unchanged blocks
- **Dark / light / system theme** with single-click toggle
- **Zero setup** — `npx git-history-ui@latest`, that's it

## ⚖️ How it compares

- **vs GitHub UI**: NL search and PR grouping work *with* your unpushed
  commits, and time travel + impact analysis aren't on GitHub at all.
- **vs `tig` or `git log`**: visual lanes, browser diffs, AI explanations,
  insights dashboard.
- **vs desktop clients (GitKraken, SourceTree, Fork)**: starts on demand with
  no project import, no account, no native install. AI features are
  pay-as-you-go on *your* key — nothing about your code leaves your machine
  unless you opt in.

## 📖 Usage

### CLI Options

Run these commands from inside the git repository you want to inspect.

```bash
# Custom port
npx git-history-ui@latest --port 8080

# Filter by specific file
npx git-history-ui@latest --file src/app.js

# Filter by author
npx git-history-ui@latest --author "your-name"

# Filter by date range
npx git-history-ui@latest --since 2024-01-01

# Don't auto-open browser
npx git-history-ui@latest --no-open

# Show help
npx git-history-ui@latest --help
```

### Optional: bring your own AI key

Natural-language search and "Explain change" / "Summarize diff" actions all
work without an API key (heuristic mode). Set one of these to upgrade them
with a real model — your code never leaves the host running git-history-ui
except for the prompt you explicitly trigger:

```bash
# Anthropic (recommended; uses claude-3-5-haiku by default)
export ANTHROPIC_API_KEY=sk-ant-...

# Or OpenAI (uses gpt-4o-mini by default)
export OPENAI_API_KEY=sk-...

# Force a specific provider when both are set
export GHUI_LLM_PROVIDER=anthropic   # or openai, or heuristic

npx git-history-ui@latest
```

### Optional: GitHub PR enrichment

Set `GITHUB_TOKEN` (a fine-grained PAT with read access to your repo) to
hydrate the grouped view with PR titles, authors, and labels:

```bash
export GITHUB_TOKEN=ghp_...
npx git-history-ui@latest
```

## 🏭 Production

### Build for Production
```bash
# Build both backend and frontend
npm run build:production

# Start production server
npm run start:production
```

### Docker
```bash
# Build and run with Docker
docker build -t git-history-ui .
docker run -p 3000:3000 git-history-ui
```

## 🛠️ Development

### Setup
```bash
# Clone and install
git clone https://github.com/beingmartinbmc/git-history-ui.git
cd git-history-ui
npm install

# Start development servers
npm run dev
```

### Testing
```bash
# Run backend tests
npm test

# Run frontend tests
cd frontend && npm test
```

## 📋 Requirements

- **Node.js**: 20.19.0 or higher, or 22.12.0 or higher
- **Git**: Any version (must be in a git repository)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

Made with ❤️ for developers who love beautiful git visualizations
