# AP Services SPA

React single-shell app (Vite + React Router + TanStack Query + Zustand).

## Commands

```bash
npm install
npm run dev       # http://localhost:5173/spa/
npm run build     # writes dist/ (required for Vercel /spa routes)
npm run typecheck
```

From repo root:

```bash
npm run dev:spa
npm run build:spa
```

## Docs

- [SPA_MIGRATION.md](./SPA_MIGRATION.md) — architecture & phases
- [CUTOVER.md](./CUTOVER.md) — how to flip WebView later (gated)
- [LEGACY_INVENTORY.md](./LEGACY_INVENTORY.md) — MPA files still required

## Web preview (no native rebuild)

- `/go-spa.html`
- `/explore.html?try_spa=1`
