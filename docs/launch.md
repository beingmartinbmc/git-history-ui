# v5.4 launch plan

## Positioning

git-history-ui is the local-first path from Git history investigation to a
shareable report and repeatable PR impact check:

> Investigate local and unpushed history, share a portable result, and automate
> merge-base impact without a git-history-ui account or project-operated
> service.

The product is not another hosted Git viewer. Git, reports, Wrapped, and the
default heuristic search stay local. Optional AI actions send the selected
prompt, commit metadata, and relevant diff/history data to the user's configured
provider.

## Deterministic demo

```bash
npx git-history-ui@latest demo --reset
```

The demo is network-free after package installation and recreates the same
authors, dates, branches, merge, rename, binary file, scopes, and tags. A
45-second recording should show:

1. Grouped history and a search.
2. Compare with a downloaded report.
3. Wrapped with the real demo repository name and Copy caption.
4. `git-history-ui pr-impact --base release/1.x --head main`.

## Launch copy

### Hacker News

**Title:** Show HN: git-history-ui – investigate, share, and automate local Git history

**Body:** I built a local-first browser UI for Git history. v5.4 adds a
deterministic demo, portable metadata-only reports, Git Wrapped sharing, and a
merge-base PR impact CLI/composite action. No git-history-ui account or
project-operated service is required. Heuristic search is local; optional AI
sends selected data to your configured provider. Try it with
`npx git-history-ui@latest demo`.

### Reddit

I have been working on git-history-ui, a local browser UI for commit search,
grouping, compare, blame, and impact. v5.4 closes the loop: investigate a
history, share a portable report or Wrapped card, then run the same merge-base
impact report in CI. The demo is deterministic:
`npx git-history-ui@latest demo`. Feedback on the PR impact report and
large-repository behavior would be especially useful.

### LinkedIn

Git history is most useful when it leads to a decision. git-history-ui v5.4
connects three workflows: investigate local/unpushed history, share a portable
report or Git Wrapped card, and automate merge-base PR impact in GitHub Actions.
It runs locally with no git-history-ui account. Demo:
`npx git-history-ui@latest demo`.

### X

git-history-ui v5.4: investigate local Git history → share portable reports /
Git Wrapped → automate merge-base PR impact. No git-history-ui account or
project-operated hosted service.
Try the deterministic demo: npx git-history-ui@latest demo
https://github.com/beingmartinbmc/git-history-ui

### Bluesky

git-history-ui v5.4 turns local Git history into a loop: investigate, share,
automate. It adds deterministic demo data, Git Wrapped social captions, and a
fork-safe merge-base PR impact Action—without a project-operated hosted
service.
https://github.com/beingmartinbmc/git-history-ui

## FAQ

### Does source code leave my machine?

Git parsing, reports, Wrapped, and heuristic search make no outbound requests.
If Anthropic or OpenAI is configured and an AI action is invoked, selected
prompt, commit metadata, and relevant diff/history data go to that provider.

### Does the Action comment on pull requests?

No. It writes `GITHUB_STEP_SUMMARY` and outputs a report path, files changed,
and total churn. It requires `contents: read` and `fetch-depth: 0`.

### Does npm install register a protocol handler?

No. Registration is explicit with `git-history-ui protocol install`. Status and
uninstall are also explicit, and uninstall removes only owned artifacts.

### Why does the extension not redirect automatically?

Browsers do not reliably expose custom-protocol launch failure. The extension
shows a clear “Didn't open?” setup link and only offers a hosted link when the
user configured a valid http(s) instance.

## Release checklist

The following checks gate the npm package and GitHub v5.4.0 release:

- [ ] Tag equals `package.json` version (`v5.4.0`).
- [ ] Backend/frontend tests, lint, typecheck, build, and both production audits pass.
- [ ] `npm pack --dry-run` contains the CLI, protocol script, action helper, and docs.
- [ ] Packed CLI opens the deterministic demo without using this checkout.
- [ ] Extension node tests and checker pass.
- [ ] Deterministic runtime-only extension ZIP and SHA-256 are attached.
- [ ] Release body uses the curated v5.4 changelog plus generated notes.
- [ ] Verify protocol install/status/uninstall on macOS, Linux, and Windows.

The Chrome Web Store listing remains unpublished. These are manual post-release
distribution tasks, not blockers for npm publication or the GitHub v5.4.0
release:

- [ ] Capture real current UI/extension screenshots; do not use mock images.
- [ ] Submit the packaged extension and real screenshots to the Chrome Web Store.

## Metrics for the first 30 days

- Demo starts and completed demo sessions.
- npm weekly downloads and GitHub repository visitors.
- Wrapped caption/share action usage only if measurable locally without analytics;
  otherwise use issue/social feedback, not telemetry.
- Action adoption by public workflow code search.
- Extension installs and store conversion from platform-provided aggregate metrics.
- Issues labeled `area:report`, `area:action`, or `area:extension`.

## Scoped community issue seeds

1. **Report:** add an optional path-grouping rule for monorepos, with before/after
   output fixtures and no new runtime dependency.
2. **Action:** add a documented GitLab CI example using the same `pr-impact` CLI;
   no new service or comment bot.
3. **Extension:** verify GitHub DOM injection points against three current layouts
   and add fixture tests for selectors.
4. **Wrapped:** propose one additional standout-stat selector with bounded caption
   tests for X and Bluesky.
5. **Docs:** contribute real Linux/Windows protocol screenshots after verifying
   install/status/uninstall on those platforms.
