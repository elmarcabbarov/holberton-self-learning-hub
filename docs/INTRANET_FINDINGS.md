# Holberton intranet — tapıntılar və Hub-a təsiri

**Mənbə:** intranet.hbtn.io, Elmar-ın hesabı ilə yalnız oxumaq üçün baxılıb (2026-11-01). Şəxsi səhifələrin (Captain's Log, quiz nəticələri) məzmunu saxlanmayıb.

## 1. Pedaqoji model: "The Framework" (`/concepts/880`)
Holberton-un rəsmi öyrənmə və yardım qaydasıdır. Əsas addımlar:
`0 Read → 1 Think → 2 Think more + Whiteboard → 3 Ask why? → 4 Read the error messages → 5 Google → 6 Google again → 7 Ask a peer → 8 Ask more peers → 9 Ask your ST → 10 Other STs → 11 Staff/Alumni/Mentors`.

Hub üçün vacib olan birbaşa qaydalar (intranet mətnindən):
- "You are NOT allowed to look at the solution / other people's code. Even for 'analysis'. … considered cheating."
- "NEVER copy and paste something from the Internet."
- Yardım edən üçün: "Do NOT give the final answer… help them find the solution by themselves", "Give hints" (sualı yenidən ifadə et, doğru sənədə yönəlt), "It's ok to code it in front of the student and explain the code, BUT then delete the file and ask the student to do it again on their own."
- İlk sual: **"How did you follow The Framework?"**
- "Getting a high score is less important than understanding and being able to explain things."

**"Approaching a Project"** (`/concepts/881`) sırası belədir: read → rephrase → example I/O → whiteboard sözlə → maşın kimi keçid → pseudocode → keçid → code (whiteboard-da) → keçid → kompüterdə yaz → test → debug. Problem kiçik hissələrə bölünür.

**Nəticə (CONFIRMED mənbə ilə):** brief-dəki "akademik dürüstlük qaydası məlum deyil" boşluğu bağlanır. Hub-un AI tutoru **AI peer kimi The Framework-ə tabe olur** (SPEC §9 yeniləndi).

## 2. Project səhifəsinin strukturu (Hub üçün data modeli)
- Başlıq, səviyyə (Novice/Amateur/Master), müəllif, weight, skor.
- Tabs: **Description | Quiz**.
- "For this project, we expect you to look at these concepts:" → concept səhifələrinə linklər.
- **Resources:** "Read or watch" + "man or help" (`echo`, `cat`, `man 5 passwd`…).
- **Learning Objectives:** "At the end of this project, you are expected to be able to explain to anyone, without the help of Google:" + başlıqlara qruplaşdırılmış siyahı.
- **Requirements** (General): editorlar, OS, fayl qaydaları, qadağalar.
- **Tasks:** nömrəli (0. … N.), hər task-da təsvir, nümunə, `Repo / Directory / File`, skor, "Run the correction", "Get a sandbox", "QA Review".

**Hub-a təsiri (PROPOSED, yeni funksiya HSLH-024 "Import Holberton project"):** peer project səhifəsinin mətnini kopyalayıb Hub-a yapışdırır. Hub intranet-ə login olmur və credential saxlamır. Parser bunları çıxarır:
- Space/Topic = project adı;
- concepts → alt-topic-lər;
- resources → mənbə siyahısı;
- **hər Learning Objective → "explain without Google" self-check kartı** (`short_self` tipi);
- requirements → project qeydi;
- tasks → yalnız başlıqlar və checklist (task həlli yox).

Bu, Hub-un ən güclü Holberton-a xas dəyəridir: obyektivlər artıq yazılıb, Hub onları retention dövrəsinə salır. Parser preview ilə işləyir, istifadəçi təsdiqləməmiş heç nə saxlanmır.

## 3. Mövcud intranet imkanları (təkrarlamırıq)
| İntranet-də var | Hub-da münasibət |
|---|---|
| Project/task checker, skor, QA Review | **Təkrarlamırıq.** Hub qiymətləndirmə sistemi deyil |
| Evaluation quizzes (rəsmi, vaxtlı) | Təkrarlamırıq. Hub-un quiz-ləri şəxsi və formativdir |
| Concepts kitabxanası | Linklə istinad edirik, məzmunu kopyalamırıq |
| Sandboxes (Linux mühiti, web terminal, SSH, VPN) | **Practice tapşırıqları üçün tövsiyə olunan mühit:** "container_recommended" tapşırıqlarda "Holberton sandbox-da işlət" ipucu |
| Captain's Log (həftəlik refleksiya: kurikulum, təcrübə, mühit, əlavə) | Hub-un refleksiyası **gündəlik və mövzu səviyyəsindədir** (öyrəndim / ilişdim / növbəti), dublikat deyil |
| Intranet AI chat ("Any help?", `clippy.hbtn.io`) | Ümumi köməkçidir. Hub-un AI-ı **şəxsi qeydlər + topic konteksti + The Framework + retention** ilə fərqlənir. Clippy-nin davranışı yoxlanmayıb (mesaj göndərilmədi) |
| Peers, Officers, Speakers of the Day, Discord | v1-də yoxdur (DEC-10) |
| Level (Novice/Amateur/Master), learning path (track-lar) | Space şablonları track adları ilə: "Intro to Python", "Cyber Security Part 1…" |

## 4. Dizayn dili (computed styles, 2026-11-01)
| Token | Dəyər | Qeyd |
|---|---|---|
| `--brand-primary` | `#e0003c` (dark `#b70031`, darker `#a3002c`) | intranet CSS dəyişənlərindən. Slayd kit-dəki `#E1003C` ilə praktiki olaraq eynidir |
| Fon (dark) | `#1c2128` | body |
| Səth / kart | `#31363c`, border `#474c52`, radius **20px** | panel |
| Mətn | `#f5f6fb`; ikinci dərəcəli `#98a3ae`; zəif `#777` | |
| Düymə | primary: `#e0003c` fon, ağ mətn, radius 4px; ikinci dərəcəli: `#31363c` + border `#474c52`, radius 3px | Tab-lar da eyni üslubdadır (aktiv = qırmızı tam doldurulmuş) |
| Inline code | mətn `#e0003c`, fon `rgba(224,0,60,.22)`, border `rgba(224,0,60,.55)`, radius 4px | |
| Kod bloku sintaksisi | Dracula tipli: `#f1fa8c`, `#bd93f9`, `#50fa7b`, `#ff79c6`, `#6272a4` | |
| Font | **aktiv-grotesk** (Adobe Typekit), 400/500/700/800; h1 36/500, h2 30/500, h3 24/500, body 14 | Typekit lisenziyalıdır, açıq repoya qoyula bilməz → əvəzi aşağıda |
| Layout | sol tərəfdə ikon rail (≈70px), məzmun mərkəzdə, böyük radiuslu kartlar; sağ altda AI düyməsi; dark/light toggle | |
| Loqo | qırmızı seahorse | Holberton icazəsi var (Elmar, 2026-11-01) |

**Font qərarı (PROPOSED):** `Inter Tight` (Google Fonts, OFL, Azərbaycan qliflərinin hamısını dəstəkləyir — vault-dakı font yoxlamasına görə, 2026-10-24). Aktiv Grotesk-ə yaxın neo-grotesk xarakterə malikdir. Monospace: `JetBrains Mono` (OFL). ə/Ə dəstəyi build-dən əvvəl yenidən yoxlanacaq.

**Hub dizayn istiqaməti:** intranet-ə "doğma" görünüş (eyni dark palitra, qırmızı primary, 20px kartlar, ikon rail), amma daha sakit və müasir: kart başına bir məqsəd, daha çox boşluq, qırmızı yalnız əsas əməliyyatlarda. Light theme slayd kit palitrasından götürülür (paper `#F0F0F5`, ink `#1A1718`). Sarı/narıncı/bənövşəyi/yaşıl aksent işlədilmir (layihə qaydası), istisna yalnız kod sintaksisi rəngləridir.
