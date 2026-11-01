# PRD — məhsul vizyonu, scope, UX (D4, D5)

## 1. Vizyon və istifadəçilər

**Vizyon (CONFIRMED mahiyyət, PROPOSED ifadə):** Holberton peer-ləri üçün açıq mənbəli, self-hosted öyrənmə iş mühiti. Peer öz Markdown qeydləri üzərində nə öyrəndiyini, nəyi unutduğunu və nəyi bildiyini zənn etdiyini görür. AI isə düşünməni əvəz etmir.

**Loop:** `PLAN → LEARN → CAPTURE → PRACTICE → RECALL → REFLECT → ADAPT`. v1-də ADAPT avtomatik deyil. Şəffaf qaydalı tövsiyə istifadəçiyə göstərilir, o da qəbul edir və ya rədd edir.

### 1.1 Problem statements
- P1. Proyekt bitəndən sonra qazanılmış bilik geri qayıtmır, çünki təkrar mexanizmi yoxdur.
- P2. Peer nəyi bildiyini həddindən artıq qiymətləndirir: oxumaq ≠ xatırlamaq.
- P3. Qeydlər, kartlar və plan ayrı alətlərdədir, ona görə kontekst itir.
- P4. Ümumi AI chat həlli verir, öyrətmir. Akademik risk yaradır.
- P5. Second-brain istifadəçisi yeni alət üçün vault-unu köçürmək istəmir.

### 1.2 Personas
A (yeni başlayan), B (advanced), C (vault sahibi), D (zəif cihaz), E (privacy) — brief §5-dəki kimi. **Fərziyyədir, müsahibə ilə təsdiqlənməyib.**

### 1.3 Müsahibə skripti (Phase 0 gate: ≥5 peer)
1. Son bitirdiyin proyektdən 3 konsepti indi izah edə bilərsənmi? Hansını çətin xatırlayırsan?
2. Qeydlərini harada saxlayırsan? Son dəfə köhnə qeydə nə vaxt qayıtdın?
3. Anki və ya başqa flashcard aləti işlətmisən? Niyə buraxdın?
4. AI-dan proyektdə necə istifadə edirsən? Nə vaxt bunun sənə zərər verdiyini hiss edirsən?
5. Docker quraşdırmısan? Lokal server işlətmək sənin üçün nə qədər çətindir?
6. Günə neçə dəqiqə "özünü yoxlamaya" ayırmağa hazırsan?
7. Hansı məlumatını buluda göndərmək istəməzsən?
8. Sənə "bu mövzunu unudursan" deyən alət olsa, nə vaxt və necə xəbərdarlıq etməsini istərdin?

## 2. Prioritetləşdirmə (MoSCoW, release-ə bağlı)

| Funksiya | MoSCoW (v1.0 = Phase 1–3) | Status | Səbəb |
|---|---|---|---|
| Learning Space + Topic ağacı | Must | PROPOSED | Hər şeyin bağlandığı oxdur |
| Markdown notes + vault index + wikilink/backlink | Must | CONFIRMED (DEC-09) | Əsas fərq. Phase 1-ə keçirilib |
| Manual cards + FSRS review | Must | CONFIRMED (DEC-07) / PROPOSED (FSRS) | Retention-un əsası |
| Manual quiz (MCQ, multi, self-graded short) + attempts | Must | CONFIRMED | Ölçmə |
| Dashboard: Today / Due / Weak topics | Must | CONFIRMED | "Bu gün nə edim?" sualı |
| Goals + checklist tasks | Must (sadə) | CONFIRMED | Plan. Mürəkkəb planner yoxdur |
| Study session log + 3 sahəli refleksiya | Should | CONFIRMED | Timer optional |
| EN/AZ i18n | Must | CONFIRMED (DEC-12) | |
| Backup/restore, import/export | Must | CONFIRMED | Data sahibliyi |
| Confidence calibration | Should | PROPOSED | Ucuzdur, fərqləndiricidir |
| Anki CSV export | Should | PROPOSED | İnteqrasiya |
| AI provider (Ollama + 1 BYOK) | Must for v1.0 (Phase 3) | CONFIRMED (DEC-05) | |
| AI card/quiz drafts from selected note | Must for v1.0 | CONFIRMED | Vertical slice |
| Socratic tutor (topic kontekstli) | Should for v1.0 | CONFIRMED (DEC-06) | |
| Research Studio | v1.1 (Phase 4) | CONFIRMED (DEC-08) | |
| MCP Client | Could (post-1.0) | PROPOSED | |
| Hub MCP Server (read-only) | Could | PROPOSED | |
| Pomodoro, interruptions | Could | — | |
| PDF/DOCX, embeddings, graph view, collaboration, podcast/video, leaderboard | Won't (v1) | CONFIRMED (DEC-10) | |

### 2.1 User stories (seçmə, AC-lər BACKLOG-dadır)
- US-01 Peer olaraq Docker ilə 10 dəqiqədə işə salıb ilk space yaratmaq istəyirəm ki, sınamağa başlaya bilim.
- US-02 Vault sahibi olaraq mövcud qovluğumu read-only qoşmaq istəyirəm ki, faylım dəyişməsin.
- US-03 Qeydimi topic-ə bağlamaq istəyirəm (frontmatter-ə yazmadan) ki, faylım təmiz qalsın.
- US-04 Qeyd oxuyarkən seçdiyim cümlədən kart yaratmaq istəyirəm (1 klik).
- US-05 Hər gün due kartları 5 dəqiqədə keçmək istəyirəm.
- US-06 Quiz-dən əvvəl əminliyimi qeyd edib sonra fərqi görmək istəyirəm.
- US-07 Dashboard-da hansı topic-in zəif olduğunu və **niyə** belə hesab edildiyini görmək istəyirəm.
- US-08 AI-sız bütün bunları etmək istəyirəm.
- US-09 Ollama ilə seçdiyim qeyddən 10 kart draft-ı alıb redaktə etmək və yalnız bəyəndiklərimi saxlamaq istəyirəm.
- US-10 Simple Shell üzərində işləyərkən AI-dan həll yox, ipucu almaq istəyirəm.
- US-11 Bütün datamı bir zip-də backup edib təmiz instansiyada bərpa etmək istəyirəm.
- US-12 Kartlarımı Anki-yə export etmək istəyirəm.

## 3. UX arxitekturası (D5)

### 3.1 Sitemap
```
/ (Today)               — Today's focus, Due reviews, Weak topics, Continue
/spaces                 — siyahı
/spaces/:id             — Overview | Topics | Notes | Review | Quiz | Goals | Activity
/notes/:path*           — editor (CodeMirror), backlinks paneli, "Topics" paneli, "Make card"
/review                 — bütün due kartlar (space filtri)
/quiz/:id               — practice | exam (AI off)
/research               — (Phase 4) runs siyahısı, New run
/assistant              — (Phase 3) topic kontekstli Socratic panel; həm də hər səhifədə yan panel
/settings               — General(lang/theme) | Vault | AI providers | Data(backup/export) | Privacy | Diagnostics
```
Naviqasiya: sol sidebar (Today, Spaces, Review, Research, Settings) + `Ctrl/Cmd+K` command palette (yeni qeyd, yeni kart, session başlat).

### 3.2 Əsas user journey-lər
1. **İlk quraşdırma → ilk space** (≤3 ekran): dil → vault rejimi (yeni Hub vault / mövcudu import et / read-only link). Mövcud vault yolu `.env`-də olmalıdır. UI "mount olunmuş yollar" siyahısını göstərir, ixtiyari host fayl seçicisi yoxdur → space adı + 3 topic təklifi (şablon: Simple Shell, Linux Fundamentals, boş). AI addımı yalnız "Later" düyməsi ilə göstərilir.
2. **Vault-dan topic-ə bağlama:** qeydi aç → "Topics" paneli → topic seç. Bağlantı SQLite-da saxlanır, fayl dəyişmir. Opt-in: "frontmatter-ə `topics:` yaz".
3. **Qeyddən kart:** mətni seç → `Make card` → front/back popover → deck = topic.
4. **Gündəlik review:** Today → "12 due" → kart → Again/Hard/Good/Easy → bitdi ekranı ("3 kart çətin oldu → qeydə bax").
5. **Quiz + calibration:** quiz başla → "Bu mövzuda nə qədər əminsən?" (5 pillə, skip olar) → suallar (exam rejimində cavab gizlidir) → nəticə + əminlik fərqi + səhv sualların qeyd linkləri.
6. **Study session:** `Ctrl+K → Start session` → məqsəd (optional) → bitəndə 3 sahə (öyrəndim / ilişdim / növbəti), hamısı skip oluna bilər → task-a bağlanır.
7. **Goal və tasks:** goal → completion criteria (mətn) → checklist. Faiz "**tasks completed**" kimi adlanır, "mastery" deyil.
8. **AI draft (Phase 3):** qeyd → "Generate cards (AI)" → data outflow preview (provider, qeyd adı, simvol sayı) → draft siyahısı → redaktə/seç → Save selected.
9. **Socratic yardım:** yan panel → sual → AI əvvəl soruşur və ya ipucu verir → "Show full explanation" düyməsi həmişə var, project mode-da isə kod blokları məhdudlaşdırılır (SPEC §9).
10. **Backup/restore:** Settings → Data → "Create backup" → zip; restore təmiz instansiyada preview ilə aparılır (neçə qeyd, kart, attempt).
11. **Research run (Phase 4):** SPEC §3.

### 3.3 Dashboard (Today)
Bloklar və sıra: **Continue** (son qeyd/session) · **Due reviews** (say + başla) · **Today's tasks** (≤5) · **Weak topics** (≤3, hər birinin altında "niyə: 5 cavabdan 2-si düz, son 14 gün") · **AI status** (yalnız konfiqurasiya olunubsa). Qrafik yoxdur. Activity space səhifəsindədir.

### 3.4 Vəziyyətlər
- **Empty:** hər ekranda bir əsas CTA ("İlk kartını qeyddən yarat").
- **Offline:** core-da heç nə dəyişmir. Yalnız web research və bulud AI deaktiv olur, səbəbi göstərilir.
- **AI off:** AI düymələri gizlənmir, "AI provider qoşulmayıb → Settings" kimi deaktiv göstərilir (aşkarlıq üçün).
- **Error:** lokallaşdırılmış mesaj + "Diagnostics-ə kopyala". Stack trace yalnız logda qalır.
- **Vault conflict:** "Fayl Hub xaricində dəyişdirilib — yenidən yüklə / fərqi gör".
- **Loading:** skeleton. Uzun job-larda real mərhələ adı göstərilir.

### 3.5 i18n
Bütün UI mətni `messages/{en,az}.json`-dadır, ICU MessageFormat ilə (cəm halları). Tarix və rəqəmlər `Intl` ilə formatlanır. AI cavab dili ayrıca ayardır. Fayl adlarında ə/ğ/ı/ö/ü/ç/ş saxlanılır, NFC normalizasiyası ilə (OBSIDIAN_STRATEGY §5). Font Azərbaycan qliflərini dəstəkləməlidir.

### 3.6 Accessibility
WCAG 2.2 AA hədəfi: klaviatura ilə review (1–4 düymələri, Space = cavabı göstər), görünən focus, quiz radio qrupları üçün düzgün `fieldset/legend`, `prefers-reduced-motion`, kontrast yoxlaması CI-da (axe + Playwright).
