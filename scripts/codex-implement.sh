#!/usr/bin/env bash
# Let Codex implement a GitHub issue on its own branch (workspace-write sandbox, no network).
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <issue-number>"; exit 2; }
n="$1"
title="$(gh issue view "$n" --json title --jq .title)"
body="$(gh issue view "$n" --json body --jq .body)"
slug="$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' | cut -c1-40)"
git checkout -b "codex-$n-$slug" main
codex exec -m gpt-6.1-sol -c model_reasoning_effort=high -s workspace-write \
"Implement GitHub issue #$n: $title

$body

Follow AGENTS.md and docs/AGENT_WORKFLOW.md steps 5-7. Stay inside the issue scope. Run pnpm check (and pnpm e2e if UI/HTTP changed) until green. Commit with message 'HSLH: <summary> (#$n)'. Do not push."
