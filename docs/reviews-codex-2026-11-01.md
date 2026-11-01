Read all nine files. **The stack is sensible; the blueprint promises stronger consistency, safety, and learning measurement than its design currently supports.** No files were modified.

## 1. Stack — ADR-001/003/007/009

**Keep Vite + React + Fastify + better-sqlite3 + Drizzle.** However, ADR-001 overstates the case: self-hosted Next.js and SvelteKit can run background work. The persuasive argument is simpler: this application gains little from SSR or server-component machinery.

Hono is viable, but its portability provides little benefit beside Node-specific SQLite and filesystem code. Fastify’s plugins and `inject()` testing justify keeping it. [Hono’s current releases](https://github.com/honojs/hono/releases) do not suggest a reason to switch.

These are my proposed **exact starting pins**, checked against upstream sources on 2026-11-01—not an installation-tested compatibility matrix:

| Area | Pins |
|---|---|
| Runtime/API | Node **24.22.2**, [`fastify@5.12.7`](https://github.com/fastify/fastify/releases) |
| Frontend | [`vite@8.3.5`](https://github.com/vitejs/vite/releases), [`react@19.3.1`, `react-dom@19.3.1`](https://github.com/react/react/releases) |
| Navigation/cache | [`@tanstack/react-router@1.170.46`](https://github.com/TanStack/router/releases), [`@tanstack/react-query@5.105.1`](https://github.com/TanStack/query/releases) |
| Database | [`better-sqlite3@13.0.3`](https://github.com/WiseLibs/better-sqlite3/releases), [`drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`](https://github.com/drizzle-team/drizzle-orm/releases) |
| Contracts | [`zod@4.6.7`](https://www.npmjs.com/package/zod?activeTab=versions) |
| Editor | `@codemirror/state@6.7.0`, `@codemirror/view@6.43.4`, `@codemirror/lang-markdown@6.5.0` ([changelog](https://codemirror.net/docs/changelog/), [Markdown package](https://raw.githubusercontent.com/codemirror/lang-markdown/main/package.json)) |
| Scheduling/watching | [`ts-fsrs@5.4.2`](https://github.com/open-spaced-repetition/ts-fsrs/releases), [`chokidar@5.0.0`](https://github.com/paulmillr/chokidar/releases/tag/5.0.0) |
| AI | [`ai@7.0.159`](https://github.com/vercel/ai/releases), [`ollama-ai-provider-v2@4.0.1`](https://raw.githubusercontent.com/opencomp-eu/ollama-ai-provider-v2/master/package.json), [`@ai-sdk/openai-compatible@3.0.82`](https://raw.githubusercontent.com/vercel/ai/main/packages/openai-compatible/package.json) |
| i18n | [`i18next@26.5.12`](https://raw.githubusercontent.com/i18next/i18next/master/package.json), [`react-i18next@17.1.10`](https://raw.githubusercontent.com/i18next/react-i18next/master/package.json), [`i18next-icu@2.6.1`](https://raw.githubusercontent.com/i18next/i18next-icu/master/package.json) |

I deliberately defer two fresh majors: ts-fsrs 6 introduced FSRS-7 on October 28; chokidar 6 is an October rewrite. Adopt them after focused compatibility checks. [FSRS changes](https://github.com/open-spaced-repetition/ts-fsrs/releases), [watcher changes](https://github.com/paulmillr/chokidar#changelog).

`node:sqlite` is **release candidate, stability 1.2, on Node 24**. Keeping better-sqlite3 remains defensible. Use a Debian-based image to reduce native-addon installation friction. [Node documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

ADR-007’s thin adapter is good. Replace “delete AI and core builds” with a tested dependency boundary and disabled runtime configuration. ADR-009 should choose one library now; the table makes that choice.

## 2. Monorepo/package layout

Use a **small pnpm workspace**:

```text
apps/web
apps/server
packages/contracts
```

Keep domain modules inside the server. Separate packages for every feature would create maintenance work without useful isolation.

Contracts should contain browser-safe Zod request/response schemas, inferred types, and error codes. Never export Drizzle models, provider SDK types, filesystem paths, or secrets through them. Validate responses too—especially quiz responses that must exclude answers.

Use [`eslint-plugin-boundaries@7.2.0`](https://github.com/javierbrea/eslint-plugin-boundaries/releases), default-deny imports, explicit module entry points, and forbidden Node imports in web/contracts. Workspace separation alone does not prevent relative-path escapes. Give agents module ownership; keep shared schema and migration changes under lead review.

## 3. Data model and vault indexing

**“One process means no concurrency problem” is false.** Async requests, watchers, jobs, and external editors still interleave.

Missing or underspecified:

- `vaults`, normalized aliases/tags/anchors, explicit `topic_dependencies`, and index-generation metadata.
- `UNIQUE(vault_id, path_key)`; indices on `content_hash`, backlinks, both directions of `topic_notes`, `(topic_id,due)` for active cards, and `(card_id,reviewed_at)`.
- Immutable quiz/question snapshots for attempts. Editing today’s quiz must not rewrite yesterday’s results.
- Review event IDs, scheduler version/parameters, previous state, and transactional card-state/log updates.

**Rename heuristics are too aggressive.** Identical templates defeat hash matching; rename-plus-edit defeats exact matching. Auto-match only unique missing/new pairs within one vault. Inode/device information can support evidence locally. Similarity should suggest a match, never silently transfer history. Detect duplicated `hub-id` values.

Watcher events are hints: reconcile periodically and serialize indexing per file. Do not assume macOS always requires polling.

Specify FTS5 storage. Since `notes` lacks a body column, an external-content index pointing directly at it cannot provide body retrieval/rebuilds. Start with ordinary FTS5 containing a disposable text copy, stable integer rowid mapping, transactional replacement, `unicode61`, and BM25. Keep research-chunk search separate and run-scoped. Test Azerbaijani case handling and code identifiers. [FTS5 documentation](https://www.sqlite.org/fts5.html).

CodeMirror does not itself guarantee byte preservation: preserve BOM, encoding policy, and line endings explicitly.

## 4. Jobs and Research Studio

SQLite jobs plus one in-process consumer are sufficient. **The lease protocol is presently half-designed.**

The claim must select exactly one eligible job, atomically set `running`, and record ownership. Add `available_at`, attempts, timestamps, and cancellation state. Recover jobs from the previous process even when their lease has not expired. Heartbeats provide little value until overlapping consumers are supported.

Expect **at-least-once execution**: a crash after a provider response but before checkpointing can repeat a paid call. Persist request identity and completed step outputs.

Research simplifications:

- Freeze source snapshots before generation. A cloud-generated plan also needs consent.
- “Every outgoing byte previewed before the run” conflicts with later retrieval, repairs, and retries. Approve immutable source scope and provider, then audit actual requests.
- Preserve requested and achieved source modes separately.
- Validate citation ownership, objective IDs, counts, and resource-type/payload agreement.
- Citation existence and keyword overlap do not establish factual support.
- Use a durable file-operation journal for guide commits. Post-transaction rename plus compensation misses crashes between those operations.
- Commit idempotency needs item-level uniqueness and a request hash.

Ship cards first. Guides and practice multiply validation and recovery paths.

## 5. Security

The controls are unusually thoughtful, but several guarantees are incomplete.

**Docker binding contradicts local mode.** Bind `0.0.0.0` inside the container while publishing only `127.0.0.1` on the host. Native local execution can bind loopback. These are separate decisions.

Bootstrap tokens should be short-lived and single-use; exchange them for independent sessions. Remove tokens from browser history immediately and redact URLs from logs. Validate complete Host authorities and exact Origins, including ports. Normal navigation and SSE may omit Origin; define those cases explicitly. Rate-limit bootstrap attempts locally too.

For SSRF, evaluate [`guarded-fetch@0.2.0`](https://github.com/vercel-labs/guarded-fetch): it supplies Undici connection-time DNS protection and redirect checks. Use `guardedFetchText`, whose timeout and size limits cover body consumption; bare `guardedFetch` does not provide those same bounds. Preserve TLS hostname verification. Add your port, content-type, and domain policies; retain adversarial tests.

Provider endpoints need a **separate policy** permitting explicitly configured Ollama addresses. Research URLs must never inherit that exception.

Other gaps:

- Extraction must not execute scripts or load subresources.
- `realpath` prefix checks need path-component boundaries; parent symlink races remain.
- Hash-before-rename cannot prevent an external writer racing after the check.
- A command regex cannot justify `safe_on_host`.
- Define backup treatment of secrets, sessions, caches, and encryption keys.

## 6. Scope/backlog

**HSLH-001..010 is too broad for the first slice.**

Reorder to:

1. 001–003, minimal 005, Docker startup.
2. Minimal 004.
3. Split 006: safe Markdown editing and reconciliation first; advanced Obsidian syntax later.
4. 008: note → manual card → review → restart.
5. Move 011 backup **and restore** here.
6. Today/Due dashboard.
7. Promote 024: paste learning objectives → editable self-check cards.

Delay goals, sessions, dependency graphs, and three-format quizzes. Separate note-topic linking from 007’s goals work. Pilot installation and one week of review before Research Studio. Interview skipping is an accepted decision; practical usage validation is still necessary.

## 7. Top five underestimated risks

1. **Silent history corruption:** mistaken rename matching and mutable assessment content.
2. **Incomplete recovery:** SQLite and Markdown cannot share a transaction; online DB backup alone cannot snapshot both consistently.
3. **False learning signals:** five self-selected answers cannot reliably measure topic knowledge or calibration.
4. **Installation abandonment:** mounts, permissions, native addons, and Docker-to-host Ollama connectivity arrive before product value.
5. **Blueprint drift:** “confirmed” decisions conflict across documents, while giant issues invite agents to implement incompatible interpretations. Resolve those contradictions before parallel implementation.