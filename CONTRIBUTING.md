# Contributing to git-history-ui

Thanks for your interest in improving git-history-ui! This guide will help you
get started.

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-user>/git-history-ui.git
cd git-history-ui

# 2. Use the correct Node version
nvm use          # reads .nvmrc → Node 20

# 3. Install dependencies
npm install
npm install --prefix frontend

# 4. Start the dev server (backend + frontend with hot reload)
npm run dev
```

The backend runs on `http://localhost:3000` and the Angular dev server on
`http://localhost:4200` with API requests proxied to the backend.

## Project Structure

```
src/
  cli.ts                  # CLI entry point (Commander)
  backend/
    server.ts             # Express app + API routes
    gitService.ts         # All git operations
    llm/                  # LLM provider abstraction
    search/               # Natural-language search
    cache/                # SQLite indexer
    ...
  __tests__/              # Backend tests (Jest)

frontend/
  src/app/
    components/           # Angular standalone components
    services/             # Angular services
    models/               # Shared TypeScript interfaces
```

## Making Changes

1. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Write code.** Follow the existing style — Prettier and ESLint will
   enforce formatting on commit (via the pre-commit hook).

3. **Write tests.** The Jest config requires 93% statements, 80% branches,
   92% functions, and 95% lines for coverage runs. CI also runs an explicit
   90% statements/functions/lines gate. Add tests in `src/__tests__/` for any
   new backend logic.

4. **Run checks locally** before pushing:

   ```bash
   npm run lint          # ESLint
   npm run typecheck     # tsc --noEmit
   npm test              # Node extension/Action tests, extension checker, Jest
   npm run test:frontend # Karma + Jasmine (frontend)
   npm run test:coverage # Jest coverage using the configured thresholds
   ```

5. **Commit with a conventional message:**

   ```
   feat: add branch comparison view
   fix: handle empty commit body in NL search
   docs: update API endpoint reference
   chore: bump express to 4.22
   ```

   The format is `type(optional-scope): description`. See
   [Conventional Commits](https://www.conventionalcommits.org/) for the full
   spec.

6. **Push and open a PR** against `main`. Fill in the PR template and link
   any related issues.

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix     | When to use                          |
| ---------- | ------------------------------------ |
| `feat:`    | New user-facing feature              |
| `fix:`     | Bug fix                              |
| `docs:`    | Documentation only                   |
| `style:`   | Formatting, whitespace               |
| `refactor:`| Code change that neither fixes nor adds |
| `perf:`    | Performance improvement              |
| `test:`    | Adding or updating tests             |
| `chore:`   | Build, CI, dependency updates        |

## Code Style

- **TypeScript** throughout (backend + frontend).
- **Prettier** is enforced by `format:check` and formats staged files through
  lint-staged at commit time; editor format-on-save is optional.
- **ESLint** with `@typescript-eslint` and `prettier` integration.
- Prefer `const` over `let`, avoid `any` when practical.
- Keep functions small and testable.

## Tests

- **Backend:** Jest + ts-jest. Tests live in `src/__tests__/`.
  - Use `src/__tests__/helpers/http.ts` for HTTP endpoint tests.
  - Use `src/__tests__/helpers/repo.ts` to create ephemeral git repositories.
  - Mock outbound `fetch` calls directly for GitHub and LLM provider tests.
- **Frontend:** Karma + Jasmine. Specs live alongside components (`*.spec.ts`).
- **Extension/action helpers:** Node's built-in test runner. Keep extension
  runtime files on the allowlist and do not add remote code or broad permissions.
- Use real application captures for docs/store assets; do not add screenshot
  mockups or binary placeholders.

## Reporting Bugs

Use the [bug report template](https://github.com/beingmartinbmc/git-history-ui/issues/new?template=bug_report.yml)
on GitHub. Include your Node version, OS, and the output of
`npx git-history-ui --version`.

## Requesting Features

Use the [feature request template](https://github.com/beingmartinbmc/git-history-ui/issues/new?template=feature_request.yml)
on GitHub. Describe the use case, not just the solution.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
