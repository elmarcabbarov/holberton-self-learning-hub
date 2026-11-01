# Obsidian / Second Brain strategiyası (D6)

**Prinsip (CONFIRMED niyyət):** *Keep your second brain. Add a learning workflow on top.* Hub Obsidian-ı əvəz etmir və onu tələb etmir. Hub-un yaratdığı hər `.md` Obsidian-da və adi editorda oxunur.

## 1. Qərar matrisi

| Yanaşma | Second-brain istifadəçisi nə qazanır | Xərc | Risk | Lisenziya | Qərar |
|---|---|---|---|---|---|
| **A. Obsidian-uyğun Markdown vault (Hub öz editoru ilə)** | Faylları portativ qalır, Hub-da da redaktə edir, Obsidian-da da açır | Orta | Sintaksis uyğunsuzluğu kənar hallarda | Yoxdur (format açıqdır) | **CORE, Phase 1** |
| **B. Mövcud vault-u qoşmaq (linked)** | Köçürmə tələb olunmur | Orta–yüksək | Paralel yazma, rename, path fərqləri | Yoxdur | **Read-only: Phase 2. Write opt-in: Phase 5+** |
| **C. Obsidian plugin (Hub API-yə qoşulur)** | Obsidian-dan çıxmadan review və quiz edir | Yüksək (ayrıca məhsul) | Plugin API dəyişiklikləri, ikinci kod bazası | Plugin üçün `obsidian-api` tipləri MIT-dir. Terms-ə görə reverse engineering yalnız qeyri-kommersiya plugin inkişafı üçün icazəlidir | **Phase 6+, istifadəçi sübutu olarsa** |
| **D. Obsidian məntiqini tam təkrar qurmaq** (graph, canvas, bases, plugins) | Heç nə əlavə etmir, onsuz da Obsidian var | Çox yüksək | Scope partlayışı | Kod kopyalamaq olmaz | **Rədd** |

## 2. Data ownership (ADR-002)
- **Qeyd məzmunu = fayl** (source of truth). SQLite yalnız **törəmə indeks** (başlıq, linklər, taglər, hash, mtime, FTS) və **Hub-a məxsus struktur data** saxlayır: topics, note↔topic bağlantıları, cards, quiz, attempts, sessions, research.
- **Heç bir sahə iki yerdə redaktə olunmur.** Frontmatter-dəki `tags`/`aliases` yalnız oxunur (indeks). Hub öz metadatasını default olaraq fayla yazmır.
- **Stabil identifikasiya problemi:** Obsidian-da rename Hub xaricində baş verərsə path-a bağlı açarlar qırılır. Həll:
  1. Açar `note.id` (ULID) SQLite-dadır, `path` isə dəyişkən atributdur.
  2. Reindex zamanı itən path + eyni `content_hash` (və ya ≥0.9 oxşarlıq, eyni basename) ilə yeni path tapılarsa → **rename kimi qəbul olunur**, bağlantılar köçürülür.
  3. Qeyri-müəyyən hallar "Unresolved notes" siyahısına düşür, istifadəçi əl ilə uyğunlaşdırır. Kart və attempt-lər heç vaxt silinmir.
  4. Opt-in: `hub-id: <ulid>` frontmatter-ə yazılır. Bu, rename-ə ən davamlı yoldur, amma faylı dəyişir. Yalnız istifadəçi istəyəndə.

## 3. Saxlama tərtibatı
```
<HUB_DATA>/                 # Docker volume və ya host qovluğu
├── vault/                  # Hub-native vault (rejim A)
├── data/hub.db             # SQLite (WAL)
├── data/cache/             # fetch cache, research chunks
└── backups/
<LINKED_VAULT>              # rejim B: ayrıca mount, default :ro
```

## 4. Sintaksis dəstəyi (Obsidian help səhifəsinə əsasən, 2026-11-01)

| Element | Parse/indeks | Render | Yazarkən qoru | Qeyd |
|---|---|---|---|---|
| `[[Note]]`, `[[Note\|text]]` | ✓ | ✓ | ✓ | |
| `[[Folder/Note]]` (forward slash, vault kökündən) | ✓ | ✓ | ✓ | |
| `[[Note#Heading]]`, `[[Note#H#Sub]]` | ✓ | ✓ | ✓ | |
| `[[Note#^blockid]]`, sətir sonunda ` ^id` | ✓ | ✓ (scroll) | ✓ | Obsidian-a xasdır |
| `![[embed]]` | ✓ | şəkillər ✓, qeyd embed-i v1-də link kimi | ✓ | |
| Markdown link `[t](Note%20x.md)` | ✓ | ✓ | ✓ | URL-encoded |
| `aliases` frontmatter | ✓ (resolution-da istifadə olunur) | — | ✓ | |
| `tags` frontmatter + inline `#tag` | ✓ | ✓ | ✓ | |
| Callouts `> [!note]` | — | ✓ | ✓ | |
| Eyni adlı iki fayl | Resolution: dəqiq path → eyni qovluq → ən qısa path → qeyri-müəyyən (xəbərdarlıq) | | | Obsidian-ın davranışı səhifədə təsvir olunmur, `UNVERIFIED`. Real vault ilə test olunmalıdır |
| `.obsidian/`, `.trash/` | **İqnor olunur, heç vaxt yazılmır, plugin kodu heç vaxt icra olunmur** | | | |
| `.canvas`, `.base` | v1-də iqnor (siyahıda "dəstəklənmir") | | | |

**Rename Hub daxilində edilərsə:** Obsidian-ın "Automatically update internal links" davranışına uyğun olaraq bütün backlinkləri yeniləmək üçün preview göstərilir, sonra atomik yazılır. Linked read-only vault-da rename deaktivdir.

## 5. Fayl sistemi təhlükəsizliyi və portativlik
- Bütün yollar `realpath` ilə vault kökünə qarşı yoxlanır. Kökdən kənara çıxan symlink-lər izlənmir. `..` rədd edilir.
- Unicode: indeksdə NFC-yə normalizasiya olunur. Diskdəki ad isə toxunulmaz qalır (macOS NFD). Case-insensitive FS-də (Windows/macOS) yalnız hərf registrinə görə fərqlənən adlar üçün collision xəbərdarlığı verilir.
- Windows-da qadağan olan simvollar (`<>:"|?*`) və rezerv adlar (CON, NUL…) yaradılarkən rədd olunur.
- **Atomik yazma:** temp faylı eyni qovluqda yaradılır → fsync → rename. Yazmazdan əvvəl `mtime+hash` yoxlanır (optimistic concurrency): uyğun gəlmirsə yazma dayanır və conflict UI açılır.
- File watcher (chokidar və ya `fs.watch` + debounce) + dövri tam reindex. Docker bind mount-da, xüsusən Windows və macOS-da, inotify hadisələri gəlməyə bilər. Ona görə polling fallback var.
- ZIP import: hər entry üçün path validasiyası (zip-slip), ümumi ölçü və fayl sayı limiti, symlink entry-lər rədd olunur.
- Markdown render: `rehype-sanitize` ilə; xam HTML default söndürülüb; xarici şəkillər default bloklanır (tracking), "load images" düyməsi var.

## 6. Second-brain ssenariləri
1. **MOC istifadəçisi:** "Linux MOC.md"-ni space-ə çevir. Hub MOC-dakı linkləri topic təklifi kimi göstərir, istifadəçi təsdiqləyir. MOC faylı dəyişmir.
2. **Daily notes istifadəçisi:** study session refleksiyası opt-in olaraq bu günün daily note-una *append* edilə bilər (yalnız Hub vault-unda və ya write-enabled qovluqda).
3. **Zettelkasten/atomic notes:** hər atomik qeyddən "Make card". Kart `note_id` + `block anchor` saxlayır, review zamanı mənbə açıla bilir.
4. **PARA:** heç bir struktur məcbur deyil. Space ≠ qovluq. Space qovluqlardan və ya taglərdən qurula bilir.

## 7. Read-only vs write
- **Read-only linked (default, Phase 2):** Docker-də `:ro` mount. Hub yalnız indeksləyir, link verir, kart yaradır (kartlar SQLite-dadır). Ən təhlükəsiz variant.
- **Write opt-in (Phase 5+):** qovluq səviyyəsində allowlist; hər yazmadan əvvəl optimistic check; ilk aktivləşdirmədə məcburi backup; Obsidian açıq olarsa da işləyir (conflict UI ilə). Obsidian Sync və ya git-sync ilə paralel işləmək sənədləşdirilmiş riskdir.
