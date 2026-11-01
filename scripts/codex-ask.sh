#!/usr/bin/env bash
# Ask Codex a read-only design question about this repository.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: $0 \"question\""; exit 2; }
out="${CODEX_OUT:-.codex-answer.md}"
codex exec -m gpt-6.1-sol -c model_reasoning_effort=high -s read-only -o "$out" \
"You are a senior engineer advising on this repository. Read AGENTS.md and docs/DECISIONS.md first. Use web research for current library facts and cite URLs. Question: $*
Answer concretely with a recommendation, trade-offs, and risks. Max 800 words. Do not modify files." >/dev/null
cat "$out"
