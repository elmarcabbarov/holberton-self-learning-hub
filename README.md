# Holberton Self-Learning Hub

A self-hosted learning workspace for Holberton School peers. It runs on your own computer, keeps your notes as plain Markdown, and helps you see what you have learned, what you are forgetting and what to do next. AI is optional, and when it is on, it follows The Framework: hints first, no ready-made project solutions.

> **Status:** early development (skeleton). Nothing here is ready for daily use yet. Plans and decisions are in [`docs/`](docs/README.md); [`docs/DECISIONS.md`](docs/DECISIONS.md) is the source of truth.

## Run with Docker

```sh
cp .env.example .env
docker compose up -d --build
# open http://127.0.0.1:3000
```

The container listens only on `127.0.0.1` of your machine. Your data lives in `./.data` (change `HUB_DATA` in `.env`).

## Develop

Requires Node 26 LTS and pnpm 12.

```sh
pnpm install
pnpm dev          # web on http://127.0.0.1:5173, API on :3000
pnpm check        # lint + typecheck + unit tests
pnpm e2e          # Playwright end-to-end tests
```

Layout: `apps/server` (Fastify, runs TypeScript directly on Node 26), `apps/web` (Vite + React), `packages/contracts` (Zod schemas shared by both).

## License

Code: [Apache-2.0](LICENSE). Holberton names and logos are trademarks and are not covered by the code license, see [TRADEMARKS.md](TRADEMARKS.md).
