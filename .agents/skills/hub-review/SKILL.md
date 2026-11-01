---
name: hub-review
description: Review a Holberton Self-Learning Hub branch or PR for correctness, security, data safety, accessibility and i18n, combining your own read with an independent Codex review. Use before opening or merging a PR.
---

# Review a change

1. `git diff main...HEAD` (or `gh pr diff <n>`). Read AGENTS.md and the decisions the change touches.
2. Check against: acceptance criteria covered by tests · response validation with contracts · path/URL safety · no secrets in logs · EN/AZ parity · keyboard and focus · boundaries lint.
3. Run `./scripts/codex-review.sh` for an independent pass.
4. Merge both lists, drop anything you cannot point to in the code, rank by severity, fix or explain each.
