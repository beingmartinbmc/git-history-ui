# Git History UI — Wiki

Welcome to the **git-history-ui** wiki. The maintained references below live
with the repository and should be checked against the current release.

## Quick Navigation

| Section | Description |
|---------|-------------|
| [Architecture Overview](./Architecture-Overview.md) | System design, component diagram, data flow |
| [Backend API Reference](./Backend-API-Reference.md) | Wiki summary of the current REST API |
| [Canonical API reference](../API.md) | Complete route and behavior reference |
| [Architecture](../architecture.md) | Maintained backend/frontend architecture |
| [Configuration](../configuration.md) | CLI, environment, Docker, and privacy settings |
| [Troubleshooting](../troubleshooting.md) | Common runtime and protocol issues |

---

## What is git-history-ui?

A **local-first** Git history visualization tool that runs in your browser. It provides:

- Natural-language and literal search over commit history, plus code-content
  (pickaxe) search
- PR/feature grouping of flat commit lists
- Time-travel timeline with snapshot diffing
- Branch/tag compare view, and a stash & reflog explorer
- Commit impact analysis (files, modules, ripple effects)
- Lazy diff loading so large commits stay responsive
- Live "new commits" notifications via SSE
- Deep linking (`git-history-ui://` protocol, shareable query-param URLs)
- AI-powered explanations and summaries (opt-in)
- Breakage analysis (SZZ-lite suspect scoring)
- "Git Wrapped" year-in-review cards
- Export commits as JSON or CSV, and insights/Wrapped as JSON

**Key principle:** Git processing is local. If you configure an LLM provider
and invoke an AI action, the selected prompt, commit metadata, and relevant
diff/history data are sent to that provider.

## Version

Current: **v5.4.1**

## License

MIT
