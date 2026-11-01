---
description: Run all local quality gates
---
Run `pnpm check` and `pnpm e2e`. If dependencies or the Dockerfile changed, also `docker build -f docker/Dockerfile -t hub:dev .`. Report exact failures.
