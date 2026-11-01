# Holberton Self-Learning Hub

A self-hosted learning workspace for Holberton School peers. It runs on your own computer, keeps your notes as plain Markdown, and helps you see what you have learned, what you are forgetting and what to do next. AI is optional, and when it is on, it follows The Framework: hints first, no ready-made project solutions.

> **Status:** first usable slice (v0.1, not released). Notes, spaces, cards with spaced repetition, Holberton project import, backups. Plans and decisions: [`docs/`](docs/README.md); [`docs/DECISIONS.md`](docs/DECISIONS.md) is the source of truth.

## What you can do
- **Today**: cards due, recent notes, your spaces.
- **Import a Holberton project**: copy the intranet project page, paste it, and its learning objectives become "Explain without Google" self-check cards plus a project note.
- **Notes**: Markdown files in your vault (Obsidian-compatible: `[[links]]`, `#tags`, frontmatter), with search (Azerbaijani-aware), backlinks and conflict-safe saving.
- **Review**: FSRS spaced repetition, keyboard only (Space, 1–4).
- **Backups**: create and download in Settings; restore with the CLI.

## Run with Docker

```sh
cp .env.example .env
docker compose up -d --build
docker compose logs hub | grep "Open the Hub"     # one-time sign-in link (valid 10 minutes)
# need a new link later:
docker compose exec hub node apps/server/src/cli.ts token
```

The container listens only on `127.0.0.1` of your machine. Your data lives in `./.data` (change `HUB_DATA` in `.env`); notes are plain files in `./.data/vault`.

### Restore a backup
Stop the Hub, then restore into an **empty** data folder:

```sh
node apps/server/src/cli.ts inspect hub-backup-….zip
HUB_DATA=/path/to/empty/folder node apps/server/src/cli.ts restore hub-backup-….zip
```

## Develop

Requires Node 26 LTS and pnpm 12.

```sh
pnpm install
pnpm dev          # web on http://127.0.0.1:5173, API on :3000 (sign-in link is printed)
pnpm check        # lint + typecheck + unit tests
pnpm e2e          # Playwright end-to-end tests
```

Layout: `apps/server` (Fastify, runs TypeScript directly on Node 26), `apps/web` (Vite + React), `packages/contracts` (Zod schemas shared by both).

## License

Code: [Apache-2.0](LICENSE). Holberton names and logos are trademarks and are not covered by the code license, see [TRADEMARKS.md](TRADEMARKS.md).
