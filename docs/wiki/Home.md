# Git History UI — Wiki

Welcome to the **git-history-ui** wiki! This is the single source of truth for architecture, APIs, development workflows, and operational guidance.

## Quick Navigation

| Section | Description |
|---------|-------------|
| [Architecture Overview](./Architecture-Overview.md) | System design, component diagram, data flow |
| [Backend API Reference](./Backend-API-Reference.md) | All REST endpoints with request/response schemas |
| [Frontend Architecture](./Frontend-Architecture.md) | Angular components, services, state management |
| [CLI Reference](./CLI-Reference.md) | All flags, subcommands, and environment variables |
| [Git Service Internals](./Git-Service-Internals.md) | How the backend talks to git |
| [Search & NL Engine](./Search-and-NL-Engine.md) | Heuristic and AI-powered search |
| [LLM Integration](./LLM-Integration.md) | Provider abstraction, configuration, prompts |
| [SQLite Index](./SQLite-Index.md) | Local indexing for large repos |
| [Insights & Analytics](./Insights-and-Analytics.md) | Aggregations, churn, risk scoring, wrapped |
| [Security Model](./Security-Model.md) | Auth, CORS, rate limiting, input validation |
| [Development Guide](./Development-Guide.md) | Setup, building, testing, contributing |
| [Deployment & Production](./Deployment-and-Production.md) | Running in prod, environment variables |

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
- Export commits/insights/Wrapped as JSON or CSV

**Key principle:** Your code never leaves your machine unless you explicitly configure an LLM provider API key.

## Version

Current: **v5.2.1**

## License

MIT
