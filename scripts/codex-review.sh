#!/usr/bin/env bash
# Independent read-only Codex review of the current branch against main.
# stdin is closed explicitly: codex exec otherwise waits on an inherited open stdin.
set -euo pipefail
base="${1:-main}"
out="${CODEX_OUT:-.codex-review.md}"
diff_stat="$(git diff --stat "$base"...HEAD)"
[ -z "$diff_stat" ] && { echo "No changes against $base"; exit 0; }
HUB_REVIEW_WORKER=1 codex exec -m gpt-6.1-sol -c model_reasoning_effort=high -s read-only -o "$out" \
"Review the changes of this branch against $base (run: git diff $base...HEAD). You are the independent reviewer started by scripts/codex-review.sh: do NOT run that script or delegate the review. Read AGENTS.md and docs/DECISIONS.md for intent.
Report only concrete defects, ranked by severity, each with file:line, why it is wrong, and a one-line fix:
correctness, security, data loss, contract/response validation, accessibility, i18n parity, missing tests for acceptance criteria.
Say explicitly if you found nothing serious. Max 600 words. Do not modify files." </dev/null >/dev/null
cat "$out"
