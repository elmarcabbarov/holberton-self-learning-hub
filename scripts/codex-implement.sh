#!/usr/bin/env bash
# Let Codex implement a GitHub issue in its own git worktree (workspace-write sandbox, no network).
# A separate worktree keeps the lead's uncommitted work out of the issue branch.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <issue-number>"; exit 2; }
n="$1"
title="$(gh issue view "$n" --json title --jq .title)"
body="$(gh issue view "$n" --json body --jq .body)"
slug="$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' | cut -c1-40)"
branch="codex-$n-$slug"
wt="$(git rev-parse --show-toplevel)/../hub-wt-codex-$n"
git fetch -q origin main
git worktree add -b "$branch" "$wt" origin/main
cd "$wt"
pnpm install --frozen-lockfile >/dev/null
codex exec -m gpt-6.1-sol -c model_reasoning_effort=high -s workspace-write \
"Implement GitHub issue #$n: $title

$body

Follow AGENTS.md and docs/AGENT_WORKFLOW.md steps 5-7. Stay inside the issue scope. Run pnpm check (and pnpm e2e if UI/HTTP changed) until green. Commit with message 'HSLH: <summary> (#$n)'. Do not push." </dev/null
echo "Done. Review the worktree at $wt (branch $branch)."
