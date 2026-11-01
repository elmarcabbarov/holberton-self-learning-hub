# Holberton Self-Learning Hub — Blueprint v0.1 (Phase 0)

**Tarix:** 2026-11-01 · **Status:** layihə sənədi, təsdiq gözləyir. Kod yoxdur, repo yoxdur, heç bir test işə salınmayıb.
**Etiketlər:** `CONFIRMED` = istifadəçi qərarı (DEC-01…13) · `PROPOSED` = mənim təklifim · `OPEN` = qərar lazımdır · `UNVERIFIED` = bu sessiyada mənbə ilə yoxlanmayıb.

| Sənəd | Deliverable |
|---|---|
| **[DECISIONS.md](DECISIONS.md)** | **Qərarlar üçün tək mənbə — ziddiyyət olarsa üstündür** |
| [README.md](README.md) (bu fayl) | D1 icmal, D13 müstəqil tənqid, D14 açıq qərarlar |
| [RESEARCH.md](RESEARCH.md) | D2 rəqib araşdırması, D3 öyrənmə elmi, D15 mənbələr |
| [PRD.md](PRD.md) | D4 məhsul vizyonu və scope, D5 UX arxitekturası |
| [OBSIDIAN_STRATEGY.md](OBSIDIAN_STRATEGY.md) | D6 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | D7 arxitektura + ADR-lər, D8 AI/MCP, D10 data modeli |
| [AI_RESEARCH_STUDIO_SPEC.md](AI_RESEARCH_STUDIO_SPEC.md) | D9 |
| [BACKLOG.md](BACKLOG.md) | D11 release planı, ilk 10 issue |
| [SECURITY_AND_TESTS.md](SECURITY_AND_TESTS.md) | D12 threat model, test planı, risk reyestri |
| [INTRANET_FINDINGS.md](INTRANET_FINDINGS.md) | Intranet: The Framework, project strukturu, dizayn tokenləri |

---

## D1. Executive Assessment

**Problem real, amma dar formada həll olunmalıdır.** Holberton peer-i üçün əsas ağrı "qeyd aləti yoxdur" deyil. Ağrı budur: öyrəndiyi şey *ölçülmür* və *geri qayıtmır*. Qeydlər Notion-da, kartlar Anki-də, plan isə başda qalır. Proyekt bitəndən sonra bilik itir. Bu alətlərin hər biri ayrılıqda mövcuddur. Çatışmayan şey onları birləşdirən **dövrədir** (loop).

**Kim üçün:** Holberton peer-ləri (DEC-01). Ən güclü erkən istifadəçi Persona B (advanced) və Persona C (Markdown vault sahibi) olacaq. Səbəb: hər ikisi artıq öz-özünə öyrənməyə investisiya edir və self-host etməyə hazırdır. Persona A (yeni başlayan) üçün Docker quraşdırmasının özü əngəldir. Bu ciddi riskdir (bax: BACKLOG, Phase 5 install gate).

**Core differentiator (PROPOSED, kəskinləşdirilmiş):**
> *Markdown vault-un üstündə topic-a bağlı recall dövrəsi.* Hər qeyd, kart, sual və praktika bir `topic`-a bağlanır. Sistem sənə hansı mövzunu **unutduğunu** və hansında **özünə artıq güvəndiyini** göstərir (calibration). Fayllar isə adi `.md` olaraq qalır.

NotebookLM mənbədən material yaradır, amma sənin uzunmüddətli yaddaşını izləmir. Anki yaddaşı izləyir, amma qeydlərini və planını bilmir. Obsidian bilik bazasıdır, amma ölçmə aparmır. PageLM AI ilə material yaradan tələbə alətidir və lisenziyası açıq mənbə deyil. Bu boşluq realdır (RESEARCH.md §2.3).

**Nə qalır:** AI-sız core (DEC-04), BYOK + local (DEC-05), Socratic default (DEC-06), Markdown-first notes (DEC-09), draft → review → commit qaydası, Research Studio-da evidence mapping, mərhələli roadmap (DEC-10).

**Nə dəyişir (PROPOSED):**
1. **Stack:** Next.js əvəzinə **Vite + React SPA + tək Node prosesində Fastify/Hono serveri**. Səbəb: uzun sürən job-lar, fayl izləmə, SSE və tək istifadəçili lokal server Next.js-in güclü tərəfi deyil (ADR-001).
2. **Spaced repetition:** öz SM-2 implementasiyamızı yazmırıq, ilk gündən MIT lisenziyalı **`ts-fsrs`** istifadə edirik. Optimizer olmadan, default parametrlərlə (ADR-006).
3. **Research Studio v1:** açıq web search ilə başlamırıq. Başlanğıc **istifadəçinin verdiyi URL-lər + rəsmi domen allowlist-i + seçilmiş qeydlər** olur. SearXNG/API search v1.1-də gəlir. Bu, hallucination və SSRF riskini kəskin azaldır.
4. **Mövcud vault:** default **kopyalayaraq import** və ya **read-only linked vault**. Yazma icazəsi qovluq səviyyəsində, açıq opt-in ilə verilir və Phase 5-dən əvvəl olmur.
5. **Localhost-da da auth var:** ilk açılışda CLI-ın çap etdiyi token-li URL (Jupyter modeli), Host/Origin yoxlaması. Səbəb: DNS rebinding və CSRF localhost-u da hədəfləyir.

**Nə çıxarılır və ya təxirə salınır:** Study Session-da Pomodoro, interruptions, mürəkkəb journal → v1-də yalnız "log session + 3 sahəli qısa refleksiya". "Learning Analytics" modulu ayrıca modul deyil, dashboard-un bir hissəsidir. MCP Client Phase 4-dən sonraya keçir. Adaptive planner yoxdur.

**Əsas çətinliklər:** (1) Docker + host vault mount-unun Windows/macOS-da sürtünməsi; (2) kiçik lokal modellərlə advanced material keyfiyyəti; (3) Obsidian ilə eyni faylda paralel yazma; (4) scope-un genişlənməsi; (5) "Holberton" adından istifadə icazəsi.

---

## D13. Müstəqil tənqid: brief-də nə zəifdir

| # | Brief-dəki fikir | Mənim qiymətləndirməm | Təklif |
|---|---|---|---|
| 1 | Phase 1-də 7 CORE modul (Dashboard, Goals, Planner, Notes, Sessions, Cards, Quiz, Analytics) | **Çox böyükdür.** Hər modul "CORE" adlanır, deməli heç biri prioritet deyil. | Wedge: *Space → Topic → Notes → Cards/Quiz → Review → Weak topics*. Goals/Planner sadə checklist olur, Sessions isə minimal. |
| 2 | Phase 1 AI-sız, amma notes yoxdur (notes Phase 2-dədir) | **Sıra səhvdir.** Notes-suz learning space boşdur. Second-brain dəyəri isə əsas fərqdir. | Notes + vault index **Phase 1-ə** keçir. Planner zənginləşdirmələri Phase 2-yə gedir. |
| 3 | "Smart recommendation"/adaptive plan | Kiçik data ilə saxta dəqiqlik yaradır. | Şəffaf qaydalar: "son 14 gündə ≥5 cavab və accuracy <60%" → "review tövsiyə olunur". Qayda UI-da görünür. |
| 4 | Next.js monolith | Uyğun ola bilər, amma background worker, file watcher və SSE üçün əlavə hack tələb edir. Major versiyalar tez-tez qıran dəyişiklik gətirir. | ADR-001: React SPA + Fastify. |
| 5 | Öz SM-2/“simple scheduler” yazmaq, FSRS-i sonraya saxlamaq | Ters iqtisadiyyatdır: hazır MIT kitabxananı inteqrasiya etmək öz scheduler-i yazıb test etməkdən ucuzdur. | `ts-fsrs` v1-dən. |
| 6 | Research v1-də bounded open web search | Search API pulsuz və etibarlı deyil. SearXNG-də JSON default bağlı ola bilər, public instansiyalar onu söndürür. | v1 = seed URL + allowlist. Search provider plug-in sonra gəlir. |
| 7 | 4 resurs tipi birdən (guide+quiz+cards+practice) | Ən çətini *practice* və *guide*-dır, çünki doğruluq və təhlükəsizlik tələb edirlər. | Vertical slice: **cards + quiz** (seçilmiş qeyddən) → sonra guide → sonra practice. |
| 8 | MCP Phase A-da "tool registry" kimi adlanıb | Doğrudur. Amma "MCP" sözü roadmap-da ilk fazalarda ümumiyyətlə olmamalıdır. | MCP Client post-1.0. **Read-only Hub MCP Server** isə erkən dəyər verə bilər (peer-lər Claude Code/Codex işlədir). Bunu Phase 6-da qiymətləndirək. |
| 9 | Hər şeyi özümüz yazmaq | Bəziləri inteqrasiya olunmalıdır. | **Anki-yə CSV/TSV export** (Anki istifadəçisini itirmirik). **Obsidian-ı əvəz etmirik**: Hub vault-u Obsidian-da açılır. **Open WebUI-ni əvəz etmirik**: ümumi chat bizim işimiz deyil. Assistant topic kontekstli olmalıdır. |
| 10 | "Holberton School Self-Learning Hub" adı | Rəsmi alət təəssüratı yaradır. İcazə məlum deyil. | Neytral repo adı + "for Holberton peers" + disclaimer (bax: D14 #14). |
| 11 | Personas | Fərziyyədir, müsahibə yoxdur. | PRD §1.3: 8 suallıq müsahibə skripti. Phase 0 gate-də ən azı 5 müsahibə tələb olunur. |
| 12 | `externalModelDataTransfer` boolean-ı | Kifayət deyil: provider, scope və bayt həcmi bilinməlidir. | Hər run üçün `DataOutflowPreview` + consent hash (SPEC §6). |

**UVP-ni necə kəskinləşdirərdim:** "AI study app" yox. **"Holberton project-i bitəndən 3 həftə sonra da `waitpid`-i bilirsənmi? Hub sənə deyəcək."** Yəni məhsul *retention + calibration over your own notes* üzərində qurulur. AI yalnız material hazırlamağı sürətləndirir, dəyərin özü deyil.

---

## D14. Açıq qərarlar (default ilə davam edirəm)

Hər birində default seçilib və iş dayanmır. "Yenidən bax" sütunu nə vaxt qayıdacağımızı göstərir.

| # | Məsələ | Default (PROPOSED) | Alternativ / risk | Yenidən bax |
|---|---|---|---|---|
| 1 | Editor | **CodeMirror 6**. Markdown mənbəyi bayt-bayt qorunur. | TipTap/ProseMirror-da Markdown roundtrip itkili olur (frontmatter, wikilink, boşluqlar). Risk: WYSIWYG istəyən yeni başlayan. Live-preview dekorasiyaları ilə yumşaldılır. | Phase 2 usability testi |
| 2 | Mövcud vault | Import (kopya) + read-only link | Shared write: data itkisi riski var | Phase 5 |
| 3 | OS dəstəyi | Linux (Docker Engine) = tier 1; Windows (Docker Desktop + WSL2, vault WSL fayl sistemində) və macOS = tier 2, sənədləşdirilir | Bare Node install alternativ yol kimi qalır | Phase 5 pilot |
| 4 | Auth | `local` mode: 127.0.0.1 + token cookie + Host/Origin allowlist. `remote` mode: parol + HTTPS proxy məcburidir. Auth olmadan 0.0.0.0-a bind olmur. | — | Phase 1-də implement |
| 5 | Web search | v1: seed URL + allowlist; v1.1: `SearchProvider` (SearXNG, BYO API) | Pulsuz API-lərin sabitliyi yoxdur | Phase 4 |
| 6 | Lokal model | Konkret model yazılmır. Eval harness (BACKLOG HSLH-011) 2–3 namizədi ölçür və nəticə README-də göstərilir. | Ölçmədən model tövsiyə etmək = saxta iddia | Phase 3 |
| 7 | Background jobs | SQLite job cədvəli + in-process worker + lease/heartbeat + step checkpoint | Redis/BullMQ lazımsızdır | Phase 4 |
| 8 | Quiz formatları | MCQ, multi-select, **self-graded short answer** (model cavabı göstərilir, istifadəçi özü qiymət verir) | AI ilə free-text qiymətləndirmə yalnız feedback kimi, Phase 3+ | Phase 2 |
| 9 | SRS | `ts-fsrs`, default parametrlər, desired retention 0.9 | Optimizer yüzlərlə review tələb edir (Anki docs) | 1.x |
| 10 | `both` + 0 qeyd | **Block + seçim**: "qeyd seç" və ya açıq "web-only kimi davam et". Run `sourceMode=web` kimi yazılır. | Səssiz degrade = yalan coverage | SPEC-də final |
| 11 | Import/export | v1: qovluq import, zip import (zip-slip qorunması ilə), tam backup zip (DB snapshot + vault). Backup şifrələməsi v1-də yoxdur, sənədləşdirilir. | Backup encryption: 1.x | Phase 2 |
| 12 | Evidence saxlama | Fetch olunmuş mətnin yalnız istifadə edilən chunk-ları + hash + URL + accessedAt saxlanılır. Tam səhifə 30 gün cache-də qalır, konfiqurasiya olunur. | Müəllif hüququ: tam səhifə arxivi paylaşılmır | Phase 4 |
| 13 | Source-grounded keyfiyyət meyarı | Pilot üçün: təsadüfi 30 iddiada ≥90% "chunk iddianı dəstəkləyir" (insan rəyi), 0 uydurma sourceId | Avtomatik judge yalnız köməkçi rolundadır | Phase 4 gate |
| 14 | Ad | Repo: neytral ad (məs. `peer-learning-hub`). Təsvir: "built for Holberton School peers". Disclaimer: "not an official Holberton product". Logo istifadə olunmur. | Rəsmi icazə olarsa ad dəyişə bilər | **Elmar-dan sual** |
| 15 | Desktop wrapper / PWA | Yoxdur. Install friction pilotda #1 problem olarsa Tauri qiymətləndirilir. | — | Phase 5 sonrası |
| 16 | Install metrikası | Telemetriya yoxdur. `hub doctor` əmri lokal diaqnostika hesabatı yaradır, istifadəçi onu könüllü olaraq issue-ya yapışdırır. Pilotda qısa anket. | — | Phase 5 |
| 17 | Lisenziya | **Apache-2.0** (patent qrantı, contributor üçün aydın) | MIT daha sadədir. AGPL fork-ların SaaS-a çevrilməsini əngəlləyir, amma qəbulu azaldır. | Repo yaradılmazdan əvvəl |

### Qərarlar (2026-11-01, Elmar)
1. **Ad və brend — CONFIRMED:** Holberton-un daxili layihəsidir, icazə var. Ad "Holberton Self-Learning Hub"-dır, Holberton loqosu və dizayn dili istifadə olunur. D14 #14 bağlanıb.
2. **Akademik dürüstlük — CONFIRMED:** ayrıca qayda sənədi yoxdur. Amma intranet-dəki **"The Framework"** konsepti bu rolu oynayır ("looking at a solution is cheating", "do NOT give the final answer, give hints"). AI tutor ona tabedir (SPEC §9, INTRANET_FINDINGS §1).
3. **Stack — CONFIRMED (Claude-un seçimi):** Vite + React SPA + Fastify, SQLite (ADR-001).
4. **Lisenziya — CONFIRMED (Claude-un seçimi):** kod Apache-2.0 altındadır. Apache-2.0 §6 ticarət nişanı hüququ vermir, ona görə Holberton loqosu və adı lisenziyadan kənardadır. Bu, `TRADEMARKS.md`-də açıq yazılır.
5. **Peer müsahibələri:** ötürülür (Elmar). Phase 0 gate-dən çıxarılıb.
6. **Rollar:** lead developer Claude-dur. Codex agentləri implementasiya, review və alternativ rəy üçün istifadə olunur.
