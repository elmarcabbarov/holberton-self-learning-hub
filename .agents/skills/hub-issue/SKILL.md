---
name: hub-issue
description: Take the next Holberton Self-Learning Hub issue from GitHub through research, tests, implementation, Codex review and PR. Use when asked to work on the next issue, a specific HSLH issue, or to continue the backlog.
---

# Work an issue end to end

Follow `docs/AGENT_WORKFLOW.md`. Short version:

1. `gh issue list --label phase-1 --state open` → pick the lowest number whose dependencies are merged (or the one the user named). `gh issue view <n>`.
2. Read `docs/DECISIONS.md` and the spec sections the issue cites. Check current upstream docs for every library you touch; read one real example.
3. If the design is non-obvious, `./scripts/codex-ask.sh "<question>"`; add accepted decisions to `docs/DECISIONS.md`.
4. `git checkout main && git pull && git checkout -b hslh-<id>-<slug>`.
5. Write acceptance tests from the issue first. Then implement.
6. `pnpm check`; `pnpm e2e` for UI/HTTP; `docker build -f docker/Dockerfile .` for runtime/deps changes.
7. `./scripts/codex-review.sh` → fix real findings.
8. `gh pr create --fill-first --body-file <(…template…)` with `Closes #<n>`, tested/untested lists.
9. Wait for CI (`gh pr checks --watch`), squash-merge, delete branch, continue with the next issue.

Never: push to main directly, force-push, touch a real user vault in tests, claim checks you did not run.
