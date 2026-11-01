# DECISIONS — qərarlar üçün tək mənbə

Bu fayl digər sənədlərlə ziddiyyətə düşərsə, **bu fayl üstündür**. Hər yeni qərar buraya bir sətir kimi əlavə olunur, köhnə sətir silinmir, `~~üstündən xətt çəkilir~~`.
Mənbələr: Elmar (E), Claude araşdırması (C), Codex rəyi 2026-11-01 (X).

## Məhsul
| ID | Qərar | Mənbə |
|---|---|---|
| D-001 | Holberton-un daxili layihəsidir. Ad "Holberton Self-Learning Hub"-dır, loqo və dizayn dili istifadə olunur | E |
| D-002 | AI tutor intranet-dəki "The Framework"-ə tabedir (SPEC §9) | E + C |
| D-003 | Peer müsahibələri yoxdur. Əvəzində ilk dilim hazır olanda 1 həftəlik real istifadə yoxlaması aparılır | E + X |
| D-004 | İlk dilim: install → note → manual card → review → restart → backup+restore → Today/Due → **paste project objectives → self-check kartları**. Goals, sessions, topic deps və 3 quiz formatı sonra gəlir | X (qəbul edildi) |
| D-005 | Weak topic və calibration göstəriciləri "siqnal" kimi təqdim olunur, ölçmə kimi yox. Minimum n və geniş qeyri-müəyyənlik mətni göstərilir. Faiz və "mastery" sözü işlədilmir | X + C |

## Stack (pin-lər, 2026-11-01-də npm-dən yoxlanıb)
| ID | Qərar | Mənbə |
|---|---|---|
| D-010 | Node **26 LTS** (26.13.x "Lithium", 2026-10-28-dən LTS). Codex 24-ü təklif etmişdi, amma 26 daha uzun dəstəklənir. Native addon prebuild-ləri skeleton-da yoxlanır, problem olarsa 24.22.x-ə keçilir | C |
| D-011 | pnpm workspace: `apps/web`, `apps/server`, `packages/contracts`. Domain modulları server daxilindədir | X |
| D-012 | Server: `fastify@5.12.x`. Web: `vite@8.3.x`, `react@19.3.x`, `@tanstack/react-router@1.170.x`, `@tanstack/react-query@5.105.x`, `tailwindcss@4.3.x` | C + X |
| D-013 | DB: `better-sqlite3@13.0.x` + `drizzle-orm@0.45.x` / `drizzle-kit@0.31.x`. `node:sqlite` hələ release candidate-dir, sonra yenidən baxılacaq. Docker image Debian-slim əsaslıdır | C + X |
| D-014 | Contracts: `zod@4.6.x`. Yalnız brauzer üçün təhlükəsiz schema-lar, Drizzle/SDK/path tipləri ixrac olunmur. **Response-lar da yoxlanır** (məs. exam-da cavab sızmasın) | X |
| D-015 | Editor: CodeMirror 6 (`@codemirror/state`, `view`, `lang-markdown`). BOM, encoding və line ending açıq şəkildə qorunur | C + X |
| D-016 | SRS: `ts-fsrs@5.4.x` (6.x = FSRS-7, 2026-10-28-də çıxıb, yoxlanandan sonra keçilir). Watcher: `chokidar@5.0.x` (6.x yenidən yazılıb, yoxlanacaq) | X |
| D-017 | AI: `ai@7.0.x` + `@ai-sdk/openai-compatible` + `ollama-ai-provider-v2@4.x`, nazik öz interfeysimizin arxasında | C + X |
| D-018 | i18n: `i18next@26` + `react-i18next@17` + `i18next-icu` | X |
| D-019 | Boundary: `eslint-plugin-boundaries`, default-deny. Web və contracts-da Node import-ları qadağandır | X |
| D-020 | Test: `vitest@5`, `@playwright/test@1.64`. TypeScript: **6.0.x**; ~~7.0.x~~ ləğv edilib, çünki typescript-eslint 8.72 peer tələbi `<6.1`-dir (2026-11-01) | C |
| D-021 | Lisenziya: kod Apache-2.0, Holberton nişanları `TRADEMARKS.md`-də ayrıca. Font: Inter Tight + JetBrains Mono (OFL) | C |

## Arxitektura düzəlişləri (Codex rəyindən qəbul edilənlər)
| ID | Qərar |
|---|---|
| D-030 | "Tək proses = concurrency problemi yoxdur" iddiası **ləğv edilir**. İndeksləmə fayl başına serializasiya olunur. Watcher hadisələri yalnız işarədir, dövri reconcile əsasdır |
| D-031 | Rename avtomatik yalnız eyni vault-da **unikal** missing/new cütü üçün qəbul edilir (eyni hash). Oxşarlıq yalnız təklifdir, tarixçə səssizcə köçürülmür. Dublikat `hub-id` aşkarlanır |
| D-032 | Assessment snapshot-ları: attempt yaradılanda sual və cavabın immutable snapshot-u saxlanılır. Review log-da event id, scheduler versiyası, əvvəlki state saxlanılır, card state ilə eyni tranzaksiyada yazılır |
| D-033 | FTS5: adi (contentless deyil) FTS cədvəli, mətnin atılabilən surəti, stabil integer rowid, `unicode61`, BM25. Research chunk-ları ayrı cədvəldə, run səviyyəsində |
| D-034 | Jobs: atomik claim (`available_at`, `attempts`, `owner`, `cancel_requested`). Startup-da əvvəlki prosesin bütün `running` job-ları `interrupted` olur (lease-dən asılı olmayaraq). **At-least-once** semantikası: provider sorğularının identity-si və tamamlanmış addım çıxışları persist olunur |
| D-035 | Fayl + DB commit-i üçün **file-operation journal**: əvvəl niyyət DB-yə yazılır, sonra fayl yazılır, sonra tamamlandı qeydi. Startup-da yarımçıq əməliyyatlar ya tamamlanır, ya da geri qaytarılır. Backup: DB və vault üçün eyni manifest + journal sakitləşmə nöqtəsi |
| D-036 | Docker: konteyner daxilində `0.0.0.0`, host-da yalnız `127.0.0.1:port` publish olunur. Native local run loopback-a bind olur. Auth rejimi bind ünvanından ayrıdır |
| D-037 | Bootstrap token qısaömürlü və birdəfəlikdir → session cookie ilə əvəz olunur. Token URL-dən dərhal silinir (`history.replaceState`), log-larda URL redaction tətbiq olunur. Host və Origin port daxil tam yoxlanır. Navigasiya və SSE-də Origin olmaması qaydası ayrıca müəyyən edilir. Bootstrap rate limit |
| D-038 | SSRF: `guarded-fetch@0.2.x` (Apache-2.0, Vercel Labs), `guardedFetchText` limitləri ilə + öz port, content-type və domen siyasətimiz. AI provider endpoint-ləri üçün **ayrıca** siyasət (konfiq edilmiş Ollama ünvanı icazəlidir). Research URL-ləri bu istisnanı heç vaxt almır |
| D-039 | Research: source snapshot-ları generasiyadan əvvəl dondurulur. Consent = sabit source scope + provider (bayt-bayt preview yox), faktiki sorğular audit olunur. `requestedSourceMode` və `achievedSourceMode` ayrıca saxlanılır. Citation mövcudluğu ≠ faktın dəstəklənməsi (UI-da belə yazılır). Regex skaneri `safe_on_host` üçün əsas sayılmır: practice default olaraq `container_recommended`-dir |
| D-040 | Realpath yoxlaması path komponent sərhədində aparılır. Parent symlink yarışı sənədləşdirilmiş qalıq riskdir. Hash yoxlaması xarici yazıcı ilə yarışı tam aradan qaldırmır, bu da sənədləşdirilir |

## İcra zamanı əlavələr
| ID | Qərar | Mənbə |
|---|---|---|
| D-041 | pnpm 12 build icazələri `pnpm-workspace.yaml → allowBuilds` ilə verilir (`onlyBuiltDependencies` nəzərə alınmır və `ERR_PNPM_IGNORED_BUILDS` verir). İcazəlilər: `better-sqlite3`, `esbuild` | C |
| D-042 | better-sqlite3 13 Node-API prebuild-ləri paketin içindədir (linux-x64/arm64, musl, darwin, win32). Node 26-da kompilyasiya tələb olunmur. SQLite 3.53.4, FTS5 aktivdir (2026-11-01 yoxlanıb) | C |
| D-043 | DB faylı: `<HUB_DATA>/data/hub.db`. Migration-lar `apps/server/drizzle/` qovluğundadır (`drizzle-kit generate`), runtime-da `migrate()` ilə tətbiq olunur. İlk cədvəl `app_meta`-dır (instance_id, created_at) | C |
| D-044 | Auth (HSLH-003, Codex dizayn rəyi qəbul edilib): bootstrap linki `http://<host>:<port>/auth#t=<token>`. Token **fragment**-dədir: serverə və loglara getmir, GET onu heç vaxt istifadə etmir. SPA token-i oxuyur, dərhal `history.replaceState` edir və `POST /api/auth/bootstrap` (JSON, Origin guard) göndərir. Token: 32 bayt, base64url, DB-də yalnız SHA-256, 10 dəq ömür, birdəfəlik. Tək tranzaksiyada atomik istifadə + session yaradılır, unknown/expired/used üçün eyni xəta qaytarılır | X + C |
| D-045 | Session-lar DB-də saxlanılır (restart-dan sonra da qalır): hash, 30 gün sliding (yazma ən çoxu dəqiqədə 1), 90 gün mütləq hədd, logout. Cookie `hub_sid_<instance8>`: HttpOnly, SameSite=Strict, Path=/, Max-Age, Domain yoxdur. HTTP-də `__Host-` prefiksi işlədilmir | X |
| D-046 | Guard-lar: tam Host authority yoxlanır (port daxil; `127.0.0.1`/`localhost` + daxili `HUB_PORT` + publish olunan `HUB_PUBLIC_PORT`; dev rejimində `:5173`). `trustProxy: false`. Unsafe metodlarda Origin mütləqdir və `http://<yoxlanmış Host>`-a bərabər olmalıdır. `Sec-Fetch-Site: cross-site` rədd edilir. Body-lər yalnız JSON qəbul edilir (415). `/api/*` session tələb edir; istisnalar `/api/health`, `/api/auth/bootstrap`, `/api/auth/status`. Bootstrap uğursuzluqları qlobal sayğacla limitlənir (10/dəq). Təhlükəsizlik header-ləri: CSP, nosniff, `Referrer-Policy: no-referrer`, API-də `no-store` | X + C |
| D-047 | Token yaratma: server start-da link stdout-a çap olunur. Əlavə olaraq CLI var: `node apps/server/src/cli.ts token` (Docker: `docker compose exec hub node apps/server/src/cli.ts token`) | C |
