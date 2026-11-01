# Agent instructions

You are working on the Holberton Self-Learning Hub. Read `docs/DECISIONS.md` first: it overrides every other document. Product and architecture context is in `docs/` (start at `docs/README.md`).

## Workflow
Follow `docs/AGENT_WORKFLOW.md` for every issue (research → tests → code → Codex review → PR → merge → next). Skills: `.agents/skills/hub-issue`, `.agents/skills/hub-review` (also linked under `.claude/skills`). Claude commands: `/next-issue`, `/review`, `/check`. Codex: `scripts/codex-ask.sh`, `scripts/codex-review.sh`, `scripts/codex-implement.sh`; project config in `.codex/config.toml`.

Module rules: `apps/server/AGENTS.md`, `apps/web/AGENTS.md`.

## Commands
- Install: `pnpm install`
- All checks: `pnpm check` (eslint, tsc, vitest). Run before every commit.
- E2E: `pnpm e2e` (builds web, starts the server on port 3417).
- Docker: `docker build -f docker/Dockerfile -t hub:dev .`

## Rules
- One issue = one branch = one PR. Do not touch modules outside the issue's scope; say so in the PR if you must.
- Contracts (`packages/contracts`) and DB migrations are shared surfaces: keep changes minimal and call them out.
- Server code runs on Node's type stripping: use `.ts` extensions in relative imports, no `enum`/`namespace`/parameter properties (`erasableSyntaxOnly`).
- Import boundaries are enforced by eslint (`boundaries/dependencies`). Core server code must not import `modules/ai` or `modules/research`. Browser code must not import Node built-ins.
- Every user-facing string goes through i18n with keys in both `en.json` and `az.json` (parity test enforces this).
- Tests never read or write a real user vault; use temporary directories.
- Never: push to `main`, force-push, reset databases outside tests, print secrets, add network calls to tests.
- A PR description lists what was tested and what was not. Do not claim results you did not run.
