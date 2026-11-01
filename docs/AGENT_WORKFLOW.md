# Agent workflow (Claude lead + Codex)

The loop every issue goes through. Agents follow it; humans can too.

1. **Pick** the lowest-numbered open issue in the current milestone whose dependencies are merged (`gh issue list --label phase-1`).
2. **Research** before code: read the issue, `docs/DECISIONS.md`, the relevant spec section and the current upstream docs of any library you touch. Look at one or two real examples (official examples, well-maintained repos). Note anything that changes a decision.
3. **Discuss** non-trivial design with Codex when it helps: `./scripts/codex-ask.sh "question"` (read-only). Record accepted decisions as a new row in `docs/DECISIONS.md`.
4. **Branch** `hslh-<issue-id>-<slug>` from fresh `main`.
5. **Test first** where practical: write the acceptance tests from the issue, see them fail.
6. **Implement** the smallest change that passes. Stay inside the issue's scope.
7. **Check**: `pnpm check`, plus `pnpm e2e` for UI/HTTP changes, plus `docker build` for runtime/dependency changes.
8. **Review**: `./scripts/codex-review.sh` (Codex reviews the branch diff read-only). Fix real findings; note rejected ones with a reason in the PR.
9. **PR**: `gh pr create` using the template; link the issue (`Closes #n`). List what was tested and what was not.
10. **Merge** when CI is green (squash). Delete the branch. Move to the next issue without waiting.

## Roles
- **Claude (lead):** picks work, researches, designs, implements, reviews, merges.
- **Codex:** second opinion on design, independent review of every PR, and implementation of well-specified, isolated issues (`./scripts/codex-implement.sh <issue>` on its own branch).
- Two agents never work on the same module at the same time.

## Definition of done
Acceptance criteria proven by named tests · `pnpm check` green · EN+AZ strings · docs/decisions updated · CI green · PR lists untested areas.
