# v3.0 launch — talking points

## Hacker News title (proposed)

> Show HN: I added natural-language search and time travel to git-history-ui

## Lede (~120 words)

git-history-ui v3 turns your local git history into something you can ask
questions of. Drop into any repo, run `npx git-history-ui@latest`, and you
get three features that used to need GitHub Pro, a desktop client, or a
homegrown script:

1. **Natural-language search.** Type "login bug last month" or "payments by
   alice". A heuristic intent parser handles dates, authors, and synonym
   expansion with no setup; if you set `ANTHROPIC_API_KEY` (or
   `OPENAI_API_KEY`), the same query gets semantically re-ranked by Claude
   or GPT — but only the prompt leaves your machine, never the code.
2. **PR / feature grouping.** A "Grouped" toggle clusters commits by GitHub
   merge / squash patterns and Conventional Commits scope, turning a wall
   of 200 commits into ~20 PRs you can scan.
3. **Time travel.** A horizontal timeline slider shows the repo state at any
   moment and computes a live diff against HEAD.

Plus file-level history, blame, commit impact analysis, an insights
dashboard, and an "Explain this change" AI button on every commit. All
local. All zero-config. AI is opt-in.

## What to emphasize in comments

- **Privacy.** Heuristic mode is the default. AI calls only happen on user
  intent (clicking Explain / Summarize, or running an NL search) and only
  send the prompt — never the working tree.
- **Zero deps to add.** No new npm packages were added in v3 — the LLM
  providers use `fetch`, the date parser is hand-rolled, the heuristic
  scorer is plain TF-IDF. Same install footprint as v2.
- **Open to providers.** Anthropic and OpenAI today; the `LlmService`
  interface is two methods (`score`, `summarize`) so adding Ollama, Gemini,
  or a self-hosted model is a single file.
- **What's next (Phase 2 + 3).** Better diff viz (intra-line, scroll-sync
  split), d3 charts in the insights dashboard, SQLite background indexer
  for huge repos, virtualized graph rendering, GitHub App + Chrome
  extension for "open in git-history-ui" deep links, CLI presets.

## Demo script (~60s)

1. `cd ~/some-busy-repo && npx git-history-ui@latest`.
2. Click the search icon — it flips to "AI" mode. Type
   "login bug last month". Show the parsed-query chips appear.
3. Click "Grouped" in the toolbar. Expand a PR group, click a commit.
4. On the commit detail, click "✨ Explain change". (If you've set a key,
   it actually summarizes; otherwise it shows a clear "set a key" message.)
5. Click "Show impact" — point out the dependency ripple list.
6. Top nav → "Timeline". Drag the slider to last quarter, watch HEAD
   pointers update and the "Diff vs HEAD" panel populate.
7. Top nav → "Insights". Hotspots + risky files.
8. Click any file in a commit's Files panel → land on `/file/...` →
   switch to the Blame tab.

## Screenshots needed before publishing

- [ ] Toolbar with NL chips visible
- [ ] Grouped commit list with PR cards
- [ ] Timeline page with slider mid-history
- [ ] File history → Blame tab
- [ ] Insights dashboard (hotspots + churn chart)
