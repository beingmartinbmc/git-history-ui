# Git History UI

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![install size](https://packagephobia.com/badge?p=git-history-ui)](https://packagephobia.com/result?p=git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui)

**Investigate Git history locally, share the result, and automate PR impact.**

```bash
npx git-history-ui@latest demo
```

The demo creates a stable, network-free repository in your OS temporary
directory. To inspect a real project instead:

```bash
cd /path/to/your/repository
npx git-history-ui@latest
```

## Investigate → share → automate

1. **Investigate.** Search commit history, group work by PR or feature, compare
   refs, inspect blame and diffs, or time-travel through local and unpushed work.
2. **Share.** Copy portable investigation reports and export a Git Wrapped card
   labeled with the real repository name. Repository URLs are credential-free;
   no relay service is required.
3. **Automate.** Generate merge-base PR impact in CI:

   ```bash
   npx git-history-ui@latest pr-impact \
     --base origin/main --head HEAD --format markdown --output impact.md
   ```

   The bundled composite action writes the report to
   `GITHUB_STEP_SUMMARY` and exposes file/churn outputs. It needs only
   `contents: read` and a full checkout (`fetch-depth: 0`); it never comments
   on a PR or executes repository code.

## Local-first, with explicit AI boundaries

Git parsing, reports, Wrapped, heuristic search, and the optional SQLite index
run locally. If you configure Anthropic or OpenAI and invoke an AI action,
the selected prompt, commit metadata, and relevant diff/history data are sent
to that provider. No analytics or project-operated cloud service is involved.

## Quick paths

- Deterministic tour: `npx git-history-ui@latest demo`
- Current repository: `npx git-history-ui@latest`
- Personal recap: `npx git-history-ui@latest wrapped`
- All-contributor recap: `npx git-history-ui@latest wrapped --all-authors`
- URL handler: `npx git-history-ui@latest protocol install`
- PR impact: `npx git-history-ui@latest pr-impact --base main --head HEAD`

## 📦 All features

<details>
<summary><strong>Click to expand the full feature list</strong></summary>

### Exploration

- **Canvas commit graph** with branch lanes, ref pills, hover/selected
  states; viewport virtualization limits rendering work as histories grow.
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
- **Export.** The toolbar downloads commit CSV. The `/api/export/*` endpoints
  also provide paged commit JSON plus insights and Wrapped JSON.
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
- **Bounded git concurrency.** Backend repository-query `git` subprocesses go
  through a shared queue (default: 4 concurrent) so fanned-out UI requests
  (diffs, blame, impact) can't exhaust file descriptors or spike CPU.
- **Short-TTL server caches** for insights, PR groups, and Wrapped —
  invalidated automatically the moment new commits are detected.

### CLI

- **Presets.** `--preset <name>` / `--save-preset <name>` and a
  `git-history-ui presets list|delete` subcommand, stored in
  `~/.git-history-ui/presets.json`.
- **Standard filters.** `--file`, `--author`, `--since`, `--port`,
  `--no-open`, `--cwd`, `--llm <provider>`.

### Browser integration

- **Chrome extension** (`apps/chrome-extension/`) injects an "Open in
  git-history-ui" button on github.com PR / commit pages.

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
  --token <token>          protect UI and API traffic from non-local clients
  --preset <name>          load filters from a saved preset
  --save-preset <name>     save the current flags as a preset for next time
  --repo-from-url <url>    open a repo from a git-history-ui:// protocol URL
  --at <hash>              select a 4-40 character hexadecimal commit hash on startup
  --pr <number>            focus a pull request number on startup
  -h, --help               display help for command

Commands:
  demo [options]            open a deterministic, network-free demo repository
  presets <action> [name]  manage saved CLI presets
  protocol <action>        manage the git-history-ui:// URL handler
  pr-impact [options]      report pull-request impact from merge base to head
  wrapped [options]        print a "Git Wrapped" year-in-review for the repo
```

### Git Wrapped

Generate a shareable year-in-review for any repo, straight from the terminal:

```bash
npx git-history-ui wrapped                 # current year
npx git-history-ui wrapped --year 2025     # a specific year
npx git-history-ui wrapped --author alice  # one contributor
npx git-history-ui wrapped --all-authors   # do not default to Git user.email
npx git-history-ui wrapped --json          # raw JSON for scripting
```

The CLI defaults to the exact current `git config user.email` when available.
The same data powers the in-browser **Insights → Wrapped** card, including
native file sharing, image/caption copying, downloads, and explicit Bluesky/X
compose links.

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

AI actions send the selected prompt, commit metadata, and relevant diff/history
data to the configured provider. The heuristic provider sends nothing.

### Optional: GitHub PR enrichment

```bash
export GITHUB_TOKEN=ghp_...   # fine-grained PAT, read-only on the repo
```

This hydrates the *Grouped* view with PR titles, authors, and labels.

### Deep linking

Jump straight to a commit or PR from the CLI, a saved link, or the Chrome
extension:

```bash
npx git-history-ui@latest --at 7f3a9c2        # open at a specific commit hash
npx git-history-ui@latest --pr 128            # open focused on a PR group
npx git-history-ui@latest --repo-from-url "git-history-ui://open?v=1&repo=https://github.com/beingmartinbmc/git-history-ui&view=history&at=7f3a9c2"
```

Portable links use the versioned `git-history-ui://open` contract and a
credential-free GitHub/GitLab origin, so they resolve across clone locations.
The launcher searches a bounded set of common clone directories and opens the
first matching remote; use `--cwd` when you need a specific checkout.
They may carry allowlisted view state such as commit/search, author, file,
date, branch, or Compare filters. Commit and Compare actions can also copy or
download a Markdown projection with the target, summary, repo-relative
filenames/change counts, related commit subjects/authors, and portable URL. The
JSON report schema also includes the canonical remote URL, configured Git
author name/email, and target/related commit authors and dates. Reports exclude
patch bodies and local annotations by default; links and reports exclude
localhost URLs, local checkout paths, and remote credentials.

### Custom URL protocol

Protocol registration is explicit and user-local:

```bash
npx git-history-ui@latest protocol install
npx git-history-ui@latest protocol status
npx git-history-ui@latest protocol uninstall
```

The OS handler points to `~/.git-history-ui/bin/`, not an npm cache path. Its
launcher uses a durable installed CLI when available and otherwise runs
`npx --yes git-history-ui@latest --repo-from-url`. Uninstall removes only
artifacts marked as owned by git-history-ui.

### PR impact GitHub Action

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: beingmartinbmc/git-history-ui@v5.4.1
    with:
      cli-version: 5.4.1
      format: markdown
```

Set `cli-version` when pinning the Action; otherwise the Action installs
`git-history-ui@latest`. Either `base` or `head` can be resolved independently
from `GITHUB_EVENT_PATH`, and an explicit value overrides event metadata only
for that side. Outputs are `report-path`, `files-changed`, and `total-churn`.
The action writes `GITHUB_STEP_SUMMARY`; it does not use `pull_request_target`,
post comments, execute checkout code, or call a service.

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
export GIT_HISTORY_UI_TOKEN='choose-a-long-random-token'
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -e GIT_HISTORY_UI_TOKEN \
  -v "$PWD:/repo:ro" \
  git-history-ui
```

Run the command from the Git repository you want to inspect. The repository is
mounted read-only at `/repo`, and publishing to `127.0.0.1` keeps the service
local to your machine. Runtime state under `/home/node/.git-history-ui` is
ephemeral with `--rm` unless you mount that path separately.

## 🛠️ Development

```bash
git clone https://github.com/beingmartinbmc/git-history-ui.git
cd git-history-ui
npm install
npm install --prefix frontend
npm run dev          # runs backend + frontend with hot reload
npm test             # Node extension/Action tests, extension validation, then Jest
npm run test:frontend
```

## 📋 Requirements

- **Node.js**: 20.19.0+ or 22.12.0+
- **Git**: 2.28+ for the deterministic demo's `git init -b`; normal launches
  require a repository, while `git-history-ui demo` can run outside one.

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local
setup, commit conventions, test commands, and PR expectations.

## 🔐 Security

`git-history-ui` is designed for local use and binds to `localhost` by default.
The server now also applies API rate limiting, local-origin CORS checks,
security headers, stricter request validation, safer repository path handling,
and request-abort handling around expensive git operations.

Non-loopback binds fail to start without a token. The token protects both the
web UI and API for non-local clients:

```bash
npx git-history-ui@latest --host 0.0.0.0 --token "$GIT_HISTORY_UI_TOKEN"
# API clients may send either:
#   Authorization: Bearer <token>
#   X-Git-History-Token: <token>
# Browsers may use HTTP Basic with any username and the token as the password.
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
