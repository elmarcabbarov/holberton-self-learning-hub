# RESEARCH — rəqiblər, öyrənmə elmi, mənbələr (D2, D3, D15)

Yoxlama tarixi: **2026-11-01**. "Yoxlanıb" = bu sessiyada rəsmi səhifə, repo və ya GitHub API oxundu. `UNVERIFIED` = mənim biliyimdən gəlir, bu sessiyada yenidən açılmayıb.

## 2. Rəqib araşdırması (D2)

### 2.1 Əsas məhsullar

| Məhsul | Lisenziya (yoxlanıb) | Self-host / offline | Local AI / BYOK | Notes / Plan / Quiz / Cards / SRS | Research + citation | Obsidian uyğunluğu | Götürüləcək pattern | Qaçılacaq şey |
|---|---|---|---|---|---|---|---|---|
| **Gemini Notebook (əvvəlki NotebookLM)** | Proprietary SaaS | Yox / yox | Yox | Notes var; quiz və flashcards var (difficulty easy/medium/hard, say, xüsusi prompt, hint, "Explain", "Got it/Missed it", CSV download); SRS yoxdur | Güclüdür: mənbəyə bağlı | Yox | Studio paneli: "mənbələrdən material", difficulty + say + prompt ilə fərdiləşdirmə, kartları CSV kimi export | Uzunmüddətli yaddaş izlənmir; data bulud-dadır. **Qeyd:** dəstək səhifəsi artıq "Gemini Notebook" adını işlədir. Ad dəyişikliyinin miqyasını ayrıca yoxla. |
| **Anki** | Desktop AGPL-3.0 (`UNVERIFIED` bu sessiyada) | Bəli / bəli | Yox | Yalnız cards + SRS. FSRS Anki 23.10+ versiyalarında var, desired retention default 90%, optimizer "bir neçə yüzdən az review ilə zəif işləyə bilər" | Yox | Plugin-lərlə (3-cü tərəf) | FSRS, desired retention, Again/Hard/Good/Easy | UX sürtünməsi; kontekst (qeyd/plan) yoxdur. **İnteqrasiya edirik:** CSV/TSV export |
| **Obsidian** | Proprietary, pulsuz (kommersiya istifadəsi də daxil). Reverse engineering yalnız qeyri-kommersiya plugin inkişafı üçün icazəlidir. `obsidian-api` tipləri MIT | Lokal fayllar | Plugin-lərlə | Notes güclüdür; plan/quiz/SRS plugin-lərlədir | Yox | — | Vault = adi qovluq; `[[wikilink]]`, `#^block`, alias, embed, rename zamanı link yenilənməsi | Kodunu kopyalamaq olmaz. `.obsidian/`-a toxunmuruq |
| **AFFiNE** | **Qarışıq:** `packages/backend` və `packages/common/native` = AFFiNE EE License (production istifadəsi Subscription ToS ilə bağlıdır); qalan hissə MIT (LICENSE faylı oxundu) | Docker ilə self-host | AI var (öz xidməti) | Notes + whiteboard + DB views | Zəif | Yox | Local-first + sync fəlsəfəsi | "Everything app" mürəkkəbliyi. Backend kodunu götürmək olmaz |
| **Open WebUI** | "Open WebUI License": branding qorunmalıdır; köhnə töhfələr orijinal lisenziyalarında qalır (README). GitHub SPDX: NOASSERTION | Bəli | Ollama + OpenAI-compatible; RAG, hybrid search, reranking; MCP/MCPO/OpenAPI tools | Chat + knowledge. Öyrənmə dövrəsi yoxdur | RAG citation | Yox | Provider adapter UX-i, tool server inteqrasiyası | Ümumi chat-ı təkrarlamaq. Lisenziya kod götürməyə imkan vermir |
| **PageLM** | **PageLM Community License**: personal, educational, non-commercial research üçün; SaaS daxil kommersiya istifadəsi qadağandır; lisenziya "revocable"-dır. **OSI open source deyil** (LICENSE.md oxundu) | Docker | Ollama + digər provider-lər; LangChain/LangGraph | Quiz (hint, izah, skor), flashcards, notes, podcast, "Homework Planner" | Sənəd əsaslı | Yox | Tələbə yönümlü material dəsti | Kod götürmə qadağandır. Podcast kimi "wow" funksiyalar fokusu dağıdır |
| **SearXNG** | AGPL-3.0 (GitHub API) | Bəli | — | — | Metasearch JSON API (`format=json`); format `settings.yml → search.formats`-da açılmalıdır, açılmayıbsa 403 qaytarır; public instansiyaların çoxu onu söndürür | — | Ayrı konteynerdə, HTTP ilə istifadə | AGPL: ayrı proses kimi HTTP ilə çağırmaq bizim kodumuza copyleft gətirmir (`UNVERIFIED` hüquqi rəy deyil). Kodunu birləşdirmə |

### 2.2 Əlavə alternativlər

| Məhsul | Status (yoxlanıb) | Qeyd |
|---|---|---|
| **Logseq** | AGPL-3.0. DB versiyası beta-dır (2.0.x, 2026-07-dən). Markdown "Logseq OG" maintenance rejimindədir (3-cü tərəf mənbələr, rəsmi release səhifəsi ilə dəqiqləşdir) | Markdown-dan DB-yə keçid göstərir ki, fayl-əsaslı modeldə saxlanmaq çətindir. Bizim ADR-002 qərarımız bu riski qəbul edir. |
| **Khoj** | AGPL-3.0, self-host, Obsidian inteqrasiyası, lokal LLM-lər; son push 2026-08-02 | "Notes üzərində AI axtarış" sahəsi artıq doludur. Biz bununla yarışmırıq |
| **ts-fsrs** | MIT, aktivdir (push 2026-10-29) | ADR-006-nın əsası |
| RemNote, Anytype, SiYuan, AppFlowy | `UNVERIFIED` bu sessiyada | Phase 0 davamında yoxlanmalıdır. Prioritet aşağıdır |

### 2.3 Brief-dəki 7 suala cavablar
1. **Artıq mövcud olanlar:** mənbədən quiz/kart (Gemini Notebook, PageLM), SRS (Anki), vault (Obsidian), lokal AI chat + RAG (Open WebUI, Khoj). **Bizdə fərqli olan:** topic səviyyəsində *loop* + calibration + Markdown portativliyi + Holberton project konteksti (project mode, Simple Shell kimi mövzu şablonları).
2. **Yüngülləşdirən inteqrasiyalar:** Anki CSV export, Obsidian-uyğun vault, OpenAI-compatible endpoint (Open WebUI, LM Studio və vLLM avtomatik işləyir).
3. **Install sürtünməsi:** tək `docker compose up` + `.env`-də `VAULT_PATH`; `hub doctor` diaqnostikası; Docker istəməyənlər üçün bare Node yolu.
4. **Second-brain istifadəçisinə doldurulan boşluq:** vault ölçülmür. Hub qeydləri topic-lərə bağlayır, cards/quiz yaradır və "bu MOC-dakı mövzuların hansını unudursan" sualına cavab verir.
5. **Ucuz lokal model:** cards/quiz draft-ları üçün schema-constrained output (Ollama `format` + JSON schema) işləyə bilər. Advanced guide və practice-də keyfiyyət düşəcək. Bunu ölçmədən iddia etmirik, ona görə capability-aware UX və eval harness lazımdır.
6. **Prinsip götür, kod götürmə:** PageLM (lisenziya), Open WebUI (branding lisenziyası), AFFiNE backend (EE). MIT hissələrdən belə kod götürülərsə attribution tələb olunur.
7. **Roadmap dəyişikliyi:** notes Phase 1-ə keçir, FSRS hazır kitabxana ilə v1-də olur, Research v1 seed-URL-lə başlayır, MCP Client post-1.0-a keçir.

## 3. Öyrənmə elmi və Holberton-a uyğunluq (D3)

| Prinsip | Sübut gücü | Əsas mənbə | Məhsul qərarı | Məhdudiyyət |
|---|---|---|---|---|
| **Retrieval practice** | Güclü (meta-analiz) | Adesope, Trevisan & Sundararajan 2017, *RER* 87(3) 659–701 (yoxlanıb); Roediger & Karpicke 2006 (`UNVERIFIED`) | Quiz və cards loop-un mərkəzindədir; "yenidən oxu" əvəzinə "özünü yoxla" CTA-ı | Effekt ölçüsü material və test tipinə görə dəyişir |
| **Spacing** | Güclü | Cepeda et al. 2006, *Psych Bull* 132(3) 354–380 (yoxlanıb): optimal interval saxlama müddətindən asılıdır | FSRS ilə due queue | Əksər tədqiqatlar verbal recall-dır. Prosedural bacarıqlara (kod yazmaq) köçürülməsi daha zəif sübutlanıb |
| **Desirable difficulties / generation effect** | Orta–güclü | Bjork 1994; Slamecka & Graf 1978; Bertsch et al. 2007 meta-analizi (`UNVERIFIED`) | Socratic default; kartı istifadəçinin öz sözləri ilə yazması | Çox çətin olanda motivasiya düşür. "Explain" düyməsi həmişə əlçatandır |
| **Metacognitive calibration** | Orta | Dunlosky & Rawson 2012 "Overconfidence produces underachievement" (`UNVERIFIED`) | Quiz-dən əvvəl 1 kliklə "nə qədər əminsən?" → nəticə ilə müqayisə | Self-report səs-küylüdür. Kiçik n üçün göstərmirik (n<5) |
| **Self-regulated learning** | Orta (model + icmallar) | Zimmerman 2002; Panadero 2017 (*Frontiers in Psychology*) (`UNVERIFIED`) | Plan → icra → refleksiya dövrəsi; 3 sahəli qısa jurnal | Məcburi forma churn yaradır, ona görə hamısı "skip" edilə bilər |
| **Scaffolding** | Klassik nəzəriyyə | Wood, Bruner & Ross 1976 (`UNVERIFIED`) | Hint pillələri: istiqamət → konsept → yarımaddım → tam izah | — |
| **Peer instruction** | Güclü (STEM) | Crouch & Mazur 2001 (`UNVERIFIED`) | v1-də yoxdur (DEC-10). Gələcəkdə: "peer-ə izah et" refleksiya promptu | Sinif kontekstində ölçülüb |
| **GenAI və öyrənmə** | **Yeni, qarışıq** | Bastani et al. 2025, *PNAS* (doi 10.1073/pnas.2422633122, yoxlanıb): məhdudiyyətsiz GPT-4 praktikada nəticəni yaxşılaşdırdı, amma AI götürüləndən sonra ~17% pis nəticə verdi; guardrail-li "GPT Tutor" zərəri əsasən aradan qaldırdı, amma kontrol qrupundan yaxşı da olmadı. Kestin et al. 2025, *Sci Rep* (doi 10.1038/s41598-025-97652-6, yoxlanıb): pedaqoji dizaynlı AI tutor fizika kursunda in-class active learning-dən çox qazanc verdi (crossover RCT) | DEC-06-nı sübutla dəstəkləyir: **guardrail-siz AI zərərlidir**. AI-sız müstəqil quiz rejimi nəticəni ölçmək üçündür | Hər iki tədqiqat tək kontekstdədir (bir Türkiyə məktəbi, riyaziyyat; bir ABŞ universiteti, fizika). "2x" kimi rəqəmləri marketinqdə işlətmirik |

**Holberton fit:** Holberton project-based və peer-learning modeli ilə işləyir (`UNVERIFIED` rəsmi metodologiya sənədi oxunmayıb). Hub peer-learning-i əvəz etmir. O, peer-in *öz* yaddaşını və calibration-ını ölçür. **Answer leakage riski:** Holberton checker-li tapşırıqlarda AI-ın tam həll yazması öyrənməni (Bastani) və akademik qaydaları pozur. Ona görə "Project mode" var (SPEC §9).

## 15. Mənbələr (D15)

Yoxlanıb, 2026-11-01:
- MCP 2026-07-28 release blog: https://blog.modelcontextprotocol.io/posts/2026-07-28/ (stateless core, `initialize` və `Mcp-Session-Id` silinib, MRTR, HTTP+SSE deprecated, RFC 9207 `iss` validation, DCR deprecated → CIMD, Tasks extension-a keçib, Roots/Sampling/Logging deprecated)
- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs (Ollama cloud structured output dəstəkləmir; temperature 0; schema-nı prompta da yaz; OpenAI-compat `response_format`)
- Ollama tool calling: https://docs.ollama.com/capabilities/tool-calling (model siyahısı verilmir)
- Gemini Notebook quiz/flashcards: https://support.google.com/gemininotebook/answer/16958963?hl=en
- Anki deck options / FSRS: https://docs.ankiweb.net/manual/deck-options
- Obsidian internal links: https://obsidian.md/help/Linking+notes+and+files/Internal+links
- Obsidian terms: https://obsidian.md/terms
- AFFiNE repo + LICENSE: https://github.com/toeverything/AFFiNE
- Open WebUI repo: https://github.com/open-webui/open-webui
- PageLM repo + LICENSE.md: https://github.com/CaviraOSS/PageLM
- Khoj: https://github.com/khoj-ai/khoj
- SearXNG Search API: https://docs.searxng.org/dev/search_api.html
- ts-fsrs: https://github.com/open-spaced-repetition/ts-fsrs (GitHub API: MIT)
- Logseq DB status: https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020 (və 3-cü tərəf icmallar, dəqiqləşdirilməlidir)
- Bastani et al. 2025: https://ideas.repec.org/a/nas/journl/v122y2025pe2422633122.html · https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education
- Kestin et al. 2025: https://serl.fas.harvard.edu/publication/ai-tutoring-outperforms-class-active-learning-rct-introducing-novel-research-based
- Adesope et al. 2017: https://journals.sagepub.com/doi/10.3102/0034654316689306
- Cepeda et al. 2006: https://pubmed.ncbi.nlm.nih.gov/16719566/

Açılmayıb (brief-də verilib, Phase 0 davamında oxunmalıdır): MCP spec mətni (https://modelcontextprotocol.io/specification/2026-07-28, transport və security bölmələri), Ollama OpenAI compatibility, Obsidian Manage vaults, man7.org, docs.kernel.org, systemd docs, Open WebUI knowledge docs, AFFiNE self-host.
