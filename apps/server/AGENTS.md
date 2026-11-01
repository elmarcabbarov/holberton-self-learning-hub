# Server (apps/server)

- Fastify 5 on Node 26 type stripping: relative imports end in `.ts`; no enums, namespaces or parameter properties.
- Every route validates input **and** output with schemas from `@hub/contracts`. Errors use `{ error: { code, messageKey } }`.
- Domain modules live in `src/modules/<name>/` and talk to each other through exported service functions, never each other's tables.
- Core modules must not import `modules/ai` or `modules/research` (eslint enforced).
- Filesystem access goes through `lib/fs-safe` only; outbound HTTP through `lib/http-safe` only (once they exist).
- Tests: `app.inject()` with a temp data dir (`mkdtemp`). No network, no real vault.
