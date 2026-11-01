# Web (apps/web)

- Vite + React 19 + TanStack Router/Query + Tailwind 4. Server data only via TanStack Query; parse responses with `@hub/contracts`.
- Design tokens are in `src/styles.css` (intranet palette, docs/INTRANET_FINDINGS.md §4). Use tokens, not raw hex. Red is for primary actions only.
- Every string via `t()`; add keys to both `src/i18n/en.json` and `az.json` (parity test).
- Accessibility: real buttons/links, visible focus (`--hub-focus`), labels for inputs, keyboard paths for every action.
- No Node built-ins (eslint enforced). No browser storage for data that matters; server is the source of truth.
