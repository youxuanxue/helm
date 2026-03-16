# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Helm is an AI-powered "one-person company" orchestration platform — a pnpm monorepo with TypeScript throughout. See `docs/README.md` for product documentation.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| API (`@helm/api`) | `pnpm --filter @helm/api run dev` | 3000 | Hono REST API; auto-migrates SQLite on startup |
| Web (`@helm/web`) | `pnpm --filter @helm/web run dev` | 5173 | Vite + React; proxies `/api/*` to the API server |
| Both together | `pnpm dev` | 3000 + 5173 | Runs API and Web in parallel |

### Critical setup gotcha — package builds before dev

The root `tsconfig.json` has `"noEmit": true` which is inherited by all workspace packages. The library packages (`packages/shared`, `packages/db`, `packages/adapters`) declare `"main": "./dist/index.js"` in their `package.json`, so their consumers need compiled output. Before starting the API or Web dev servers, you **must** build the library packages with emit enabled:

```bash
cd packages/shared && npx tsc --noEmit false && cd ../db && npx tsc --noEmit false && cd ../adapters && npx tsc --noEmit false && cd ../..
```

Without this step, the API server will crash with `ERR_MODULE_NOT_FOUND` for `@helm/db`.

### Environment variables

Copy `.env.example` to `.env` for reference. Key variables:

- `HELM_DATA_DIR` — SQLite database directory (default: `~/.helm/data`). Create the directory before starting the API.
- `HELM_API_PORT` — API listen port (default: `3000`).
- `HELM_API_URL` — API base URL for CLI/Web (default: `http://localhost:3000`).

### Lint / Test / Build

- **No ESLint or test framework** is configured in this repo. TypeScript compilation (`tsc`) is the primary code quality check.
- `pnpm -r run build` builds all packages. Note: `@helm/cli` has pre-existing TS errors and will fail; the API and Web builds also fail due to `noEmit: true` inheritance (use `tsc --noEmit false` for library packages, and use `tsx` dev commands for apps).
- The Web app build (`tsc && vite build`) has pre-existing TS errors (`import.meta.env` types, module resolution) but `vite dev` works fine since Vite handles TS natively.

### SQLite database

The database is embedded (better-sqlite3) and auto-migrates on API startup. No external database process is needed. The DB file is stored at `$HELM_DATA_DIR/helm.db`.
