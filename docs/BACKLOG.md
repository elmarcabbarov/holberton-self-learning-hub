# BACKLOG — release planı və ilk issue-lar (D11)

Ölçü: S (≤1 PR, kiçik) · M (1–3 PR) · L (bölünməlidir). Saat və gün təxmini verilmir.

## 1. Fazalar (brief-dəki təklifdən fərqləri ilə)

| Faza | Məzmun | Gate (sübut) | Brief-dən fərq |
|---|---|---|---|
| **0 Discovery** | Bu sənədlər; Elmar-ın qərarları (2026-11-01 alınıb); intranet araşdırması (dizayn dili, project/checker axını) | Sənədlər və qərarlar qeyd olunub | Müsahibələr ötürülüb (Elmar) |
| **1 Learning Core + Notes** | Skeleton, auth (local mode), i18n, Spaces/Topics, **Hub vault + CodeMirror + index + links/backlinks + FTS**, Goals/Tasks (sadə), Dashboard v0, backup v0 | Peer AI-sız: space → topic → qeyd → link → task → restart-dan sonra hər şey yerindədir | Notes Phase 2-dən buraya keçib |
| **2 Assessment + Interop** | Cards + FSRS, Quiz (3 tip) + attempts + calibration, Weak topics qaydası, sessions + refleksiya, vault import (folder/zip), read-only linked vault, Anki CSV export, restore | Qeyddən kart → review → quiz → dashboard dəyişir; backup → təmiz restore; `.md` Obsidian-da açılır və linklər işləyir | |
| **3 AI Foundation** | Provider registry (Ollama + openai-compat + 1 cloud), probe, mock provider, **cards/quiz draft from selected note**, review/commit, Socratic panel (topic konteksti, hint pillələri, project/exam mode), eval harness v0 | AI söndürüləndə core testləri yaşıl qalır; lokal və cloud smoke testləri; avto-yazma yoxdur | Vertical slice dəqiqləşdirilib |
| **4 Research Studio v1** | Jobs (ADR-004), http-safe fetch, seed allowlist + user URLs, extract/chunk/FTS, 4 resurs, evidence UI, commit; v1.1: SearchProvider | Linux Process Management / advanced / both run-ı P0 AC-ləri keçir; eval rubriki ≥3.5 | Open web search v1.1-ə keçib |
| **5 Beta hardening** | Docker clean install (Linux tier 1, Win/macOS tier 2), `hub doctor`, security testləri, restore testləri, pilot (5–10 peer), write-enabled linked vault (opt-in), release pipeline | Install → ilk goal, pilotda medianı ölçülür (hədəf ölçmədən sonra qoyulur); kritik data itkisi və ya security bug yoxdur | |
| **6+** | MCP Client, Hub MCP Server (read-only), PDF/DOCX, embeddings, Obsidian plugin, graph, collaboration… | İstifadəçi sübutu ilə | |

## 2. Dependency qrafı
```
001 skeleton ─┬─ 002 db+migrations ─┬─ 004 spaces/topics ─┬─ 007 goals/tasks ─ 010 dashboard v0
              │                     │                    ├─ 008 cards+fsrs ─┐
              ├─ 003 auth+security ─┤                    └─ 009 quiz ───────┼─ 012 weak topics/calibration
              └─ 005 i18n+shell ────┘                                       │
002 ─ 006 vault fs-safe + index + editor ─┬─ 011 backup/restore             │
                                          └─ 013 import + linked RO + Anki export
AI: 014 provider registry+mock ─ 015 card/quiz drafts ─ 016 socratic panel ─ 017 eval harness
RS: 018 jobs ─ 019 http-safe ─ 020 extract/chunk ─ 021 pipeline+validate ─ 022 studio UI ─ 023 commit
```

## 3. İlk 10 issue (Claude/Codex üçün)

Hər issue üçün ümumi **Definition of Done:** AC-lər testlə sübut olunub (test adları PR-da göstərilir) · `pnpm lint typecheck test` yaşıl · EN+AZ açarları əlavə olunub · docs yenilənib · scope genişlənməyib · PR-da "nə test edilmədi" bölməsi var.

| ID | Başlıq | Ölçü | Asılı | Əsas AC |
|---|---|---|---|---|
| HSLH-001 | Repo skeleton: Vite+React, Fastify, shared Zod, pnpm, ESLint import boundaries, Vitest, Playwright, CI | M | Ph0 qərarları | `pnpm dev` SPA + `/api/health` qaytarır; CI 4 job; boundary qaydası `ai`-ı core-dan ayırır (qəsdən pozulan import CI-da fail olur) |
| HSLH-002 | SQLite + Drizzle + migration runner + online backup helper | S | 001 | Migration irəli işləyir, idempotentdir; WAL aktivdir; `backup()` testi açıla bilən DB çıxarır |
| HSLH-003 | Local-mode auth + Host/Origin guard + security headers | M | 001 | Token-siz sorğu 401; yanlış `Host` 403; cross-origin POST 403; remote mode parolsuz başlamır |
| HSLH-004 | Learning Spaces + Topics (nested, deps) CRUD | M | 002 | API + UI; dövri asılılıq rədd olunur; soft-delete |
| HSLH-005 | App shell, EN/AZ i18n, theme, a11y əsasları | M | 001 | Dil dəyişikliyi persist olunur; açar paritet testi; axe-da kritik xəta yoxdur |
| HSLH-006 | Vault: fs-safe (realpath, atomic write, optimistic check), indexer (frontmatter, wikilinks, md links, tags, aliases, block ids), FTS5, watcher + polling, CodeMirror editor, backlinks | L → 3 PR | 002 | Traversal/symlink fixture-ları rədd olunur; xarici dəyişiklik conflict UI-ı açır; Obsidian sintaksis fixture vault-u düzgün indekslənir; NFC testi |
| HSLH-007 | Goals + checklist tasks + note↔topic linking UI | S | 004, 006 | Faiz "tasks completed" adlanır; topic linki faylı dəyişmir |
| HSLH-008 | Cards + ts-fsrs review + review keyboard UX | M | 004 | Rating → növbəti `due` ts-fsrs ilə uyğundur; review log saxlanılır; 1–4/Space düymələri işləyir |
| HSLH-009 | Quiz: mcq/multi/short_self, practice/exam, attempts, confidence_pre | M | 004 | Exam rejimində cavab submit-ə qədər API-dən gəlmir; attempt tarixçəsi |
| HSLH-010 | Dashboard v0: Continue, Due, Today tasks, Weak topics (şəffaf qayda) | S | 007–009 | Hər weak topic yanında "niyə" mətni; n<5 olduqda göstərilmir |

Sonrakılar (qısa): **024 Import Holberton project (paste → objectives → self-check kartları, M, Phase 2 — yüksək prioritet)** · 011 backup/restore zip (M) · 012 calibration görünüşü (S) · 013 import + linked RO + Anki CSV (M) · 014 AI provider registry + mock + probe (M) · 015 drafts + review/commit (M) · 016 Socratic panel + modes (M) · 017 eval harness (M) · 018–023 Research Studio (hər biri M).

## 4. Claude + Codex iş qaydası
- GitHub repo = tək mənbə. `AGENTS.md` əsas qaydaları saxlayır, `CLAUDE.md` yalnız `@AGENTS.md` import edir, ona görə ziddiyyət ola bilməz.
- Hər issue = bir branch = bir PR. Paralel agentlər eyni modulda işləmir (issue-da "touches:" sahəsi var).
- Codex implement edir → Claude review edir (və ya əksinə). Review çıxışı PR comment kimi yazılır. Elmar-ın Codex qaydası: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=high`.
- Agentlər üçün qadağalar: `main`-ə push, force push, DB reset, istifadəçi vault-una yazan testlər (testlər yalnız `tmp` fixture vault-larında işləyir), secret-lərin çapı.
