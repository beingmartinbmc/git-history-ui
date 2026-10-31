# Frontend

The Angular UI for git-history-ui. It talks to the Express API in `../src/backend`
and is served by that backend in production, so most commands run from the repo root.

## Development

From the repository root:

```bash
npm run dev
```

This starts the API (with `ts-node-dev`) and the Angular dev server on
`http://localhost:4200`, which proxies `/api` to the backend through
`proxy.conf.json`. Running `ng serve` on its own starts the UI with no API behind it.

## Tests

```bash
npm run test:frontend   # Karma + ChromeHeadless, from the repo root
```

## Build

```bash
npm run build           # backend, frontend, and the copy into build/frontend
```

`npm run build:frontend` builds only the UI into `frontend/dist/`. That directory is
generated and ignored by git; the published package serves `build/frontend`.
