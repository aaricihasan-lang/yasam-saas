# PROJE DURUMU (PROJECT STATUS)

> Bu dosya projenin **güncel özet durumunu** tutar. Yeni bir Claude oturumu işe
> başlarken **önce bu dosyayı okur**. Kısa, güncel ve doğru tutulur; ayrıntılı
> karar geçmişi `CHANGELOG_AI.md`'de, aktif görev ise `CURRENT_TASK.md`'dedir.
>
> **Güncelleme kuralı:** Anlamlı bir aşama tamamlandığında veya commit/push
> yapıldığında ilgili alanlar güncellenir. Tarihler **mutlak** yazılır (örn.
> `2026-07-13`), "bugün/dün" gibi göreli ifadeler kullanılmaz.
>
> **Doğrulama notu:** Aşağıdaki alanlarda yalnızca doğrulanmış bilgi vardır.
> Doğrulanamayan alanlar açıkça **"Doğrulanmadı"** olarak işaretlenmiştir; tahmin
> yazılmamıştır.

**Son güncelleme:** 2026-07-20 (S2.16 açılış)

---

## ⚠️ Tutarlılık Kontrolü (CURRENT_TASK.md ile)

Geliştirmeye başlamadan **önce** bu dosya (`PROJECT_STATUS.md`) ile
`CURRENT_TASK.md` **çelişmemelidir**. Örnek çelişkiler: bu dosyadaki "Devam Eden İş"
ile `CURRENT_TASK.md`'deki "Görev"in uyuşmaması, veya "Son Commit"in aktif görevin
varsaydığı temelle tutarsız olması.

**Kural:** İki doküman çelişiyorsa **geliştirmeye başlanmaz**. Önce durum
kullanıcıya bildirilir ve **doğrulama istenir**. Çelişki giderilmeden koda geçilmez.

---

## Proje

**Yaşam SaaS** — Bütüncül/holistik terapistler için çok modüllü bir SaaS uygulaması
(Next.js App Router). Modüller: Kozmik Takvim, Refleksoloji, Doğaltaş, Biyoenerji,
Aromaterapi, Numeroloji, Şifa Rehberi, Human Design, Danışan Yolculuğu, Ürün & Stok,
Dijital İçerik ve merkezi zeka katmanı **Yaşam Hafızası™**.

## Sprint

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.05 + S2.07 + **S2.08–S2.12 (PR #3, `555030a`)** + **S2.13 (PR #4, `4c672e9`)** + **S2.14 (PR #6)** + **S2.15 (PR #8, kod `f56ec60`, merge `404841b`)** origin/main'de (`77aa824`). **S2.16 (Dictionary Expansion) AÇILDI** — `work/yh-s2-16` (taban `77aa824`); **kod henüz YOK**, yalnız worktree + açılış karar kilidi + açılış docs. Kilitli backlog: Dictionary Expansion → search_tsv → Stone Exclusion Adapter → Evidence Gate → Ranking → Retrieval Pipeline → Search UI.

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.15 — Kavram Kümesi (Concept Set)** (saf + deterministik + DB'siz, yalnız query-origin `Concept[]`) **tamamlandı ve main'e merge edildi** (**PR #8**; kod commit `f56ec60` `feat(yasam-hafizasi): add S2.15 concept set`; merge `404841b`; güncel `origin/main` = `77aa824` bu kodu içerir). Teslim: `lib/yasam-hafizasi/search/conceptSet.ts` (`buildConceptSet(input: unknown): readonly Concept[]` → `normalizeSearchText(input).tokens` → her benzersiz token `{ term, origin:"query" }`; dedup=term/ilk-sıra; sort yok; `canonical` omit; `Object.freeze`; fail-safe boş dizi) + `scripts/yh-concept-set-harness.ts`. Phrase/dictionary/synonym YOK (S2.16'ya bırakıldı). SQL/migration/package/lock yok. *(S2.15 turunda ayrı "close" docs commit'i yazılmamıştı; bu S2.16 açılışı S2.15'i tamamlanmış-main gerçeğiyle kayda alır. Harness pass sayısı bu oturumda yeniden koşulmadı.)*
- Önceki aşama: Yaşam Hafızası **S2.14 — Retrieval Türkçe Metin Normalizasyonu** (saf + deterministik + fail-safe + locale-bağımsız + mutasyonsuz normalize birimi) **tamamlandı ve main'e merge edildi** (**PR #6**; kod commit `dd29167`). Teslim: `lib/yasam-hafizasi/search/normalize.ts` (`normalizeSearchText` → `{ normalizedText, tokens }`; tam saf, hiç import yok) + `scripts/yh-normalize-harness.ts`. Türkçe fold I/İ/ı/i→i · ç→c · ğ→g · ö→o · ş→s · ü→u · â/î/û→a/i/u; NFD+combining-strip→generic lowercase; stop-list/stemmer/concept-set YOK. **Query–index simetrisi production Supabase salt-okunur SELECT ile doğrulandı** (`ışık→isik`, `İğne→igne`, `Göğüs→gogus`, `Bütün→butun`). Doğrulamalar: yeni harness **83/83**, 9 regresyon harness EXIT 0 (`yh-index-smoke` **41/41**, `visibility` **49/49**, `supabase-adapters` **37**), `tsc --noEmit` EXIT 0, hedefli ESLint **0 error/0 warning**, güvenlik grep temiz. SQL/migration/package/lock yok.
- Önceki aşama: Yaşam Hafızası **S2.13 — Retrieval Görünürlük Kararı** (saf + deterministik + DB'siz + DI + fail-closed görünürlük karar birimi) **tamamlandı ve main'e merge edildi** (**PR #4**, merge commit `4c672e9`, ebeveynler `c412334` + `608f576`; kod commit `e3b4e73`). Teslim: `lib/yasam-hafizasi/search/visibilityScope.ts` (`evaluateVisibility` + kapalı reason-code union) + `scripts/yh-visibility-scope-harness.ts`. Kurallar: tenant görünürlüğü · açık `allowShared` ile shared · PII dışlama · demo tenant/source dışlama · enjekte stone-exclusion port + port hatasında fail-closed. **Gerçek Supabase/DB implementasyonu YOK** (sonraki S2.x). Doğrulamalar: yeni harness **49/49**, 8 regresyon harness EXIT 0 (`yh-index-smoke` **41/41**), `tsc --noEmit` EXIT 0, hedefli ESLint **0 error/0 warning**, güvenlik grep'leri temiz. PR #4 net katkısı 6 YH dosyası (+751/−59); package/lock/migration/SQL yok.
- Önceki aşama: Yaşam Hafızası **S2.08–S2.12 — İndeksleyici write-side** (runner + source + write plan/adapter + admin route + smoke) **tamamlandı ve main'e merge edildi**. Git akışı: 7 kaynak commit (`8cf503d`→`93ae185`) → entegrasyon merge `fa9adbd` (`work/yh-s2-integration`) → **PR #3** (`work/yh-s2-integration` → `main`, "Create a merge commit") → main **`555030a`** (ebeveynler `0a3e8a4` + `fa9adbd`). **20 YH dosyası, +3580/−67; package/lock/migration/SQL yok; YH-dışı değişiklik yok.**
- **Aşamalar:** S2.08 `runIndexUnit`+`makeParentTenantLookup` (`dd7a022`) · S2.09 `runSource` (`172aa91`) · S2.10 `indexWritePlan`+`supabaseIndexAdapters` (`b8ffc67`) · S2.11 admin index-page route (`e171fa1`) · S2.12A index smoke (`2dc44d3`) · S2.12C exact-owned-record dry-run (`93ae185`).
- **Kabul kriterleri geçti (entegrasyon worktree'sinde doğrulandı):** 8 harness **EXIT 0** (**S2.12 smoke 41/41**); tüm-proje `tsc --noEmit` **EXIT 0**; ESLint YH kapsamı **0 error** (1 eskiden-var warning); güvenlik grep'leri temiz. Production build: derleme + TypeScript **geçti**, `Collecting page data` **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil.
- Önceki aşamalar: **S2.07** (`2b19743`, PR #2) · **S2.05** (`cd9c77c`, PR #1).

## Son Commit

- **PR #8 merge** (`404841b`) — S2.15 (`f56ec60` `feat(yasam-hafizasi): add S2.15 concept set`) → main (`77aa824`). Kod `conceptSet.ts` + harness main'de.
- Önceki: `dd29167` — **PR #6 merge** (S2.14 → main); `4c672e9` — **PR #4 merge** (S2.13 → main); `555030a` — **PR #3 merge** (S2.08–S2.12); `2b19743` — S2.07; `cd9c77c` — S2.05.

## Son Push

- **S2.15:** kod commit `f56ec60` `origin/work/yh-s2-15`'e push edildi; **PR #8 merge edildi** (`404841b`) → `origin/main` (güncel `77aa824`). Concept Set birimi main'de.
- **S2.14:** kod commit `dd29167` + kapanış docs + sync merge'ler `origin/work/yh-s2-14`'e push edildi; **PR #6 merge edildi** → `origin/main`. Normalize birimi main'de.
- **S2.13:** kod `e3b4e73` + kapanış docs `608f576` `origin/work/yh-s2-13`'e push; **PR #4 merge** → `origin/main` = **`4c672e9`**.
- **S2.08–S2.12:** `origin/work/yh-s2-integration` (`fa9adbd`) + `origin/work/yh-s2-12` (`93ae185`); **PR #3 merge** → `555030a`.
- **S2.07:** `origin/work/yh-s2-07` (`380e44f`); **PR #2** → `2b19743`. **S2.05:** `origin/work/yh-s2-05` (`67fa6fb`); **PR #1** → `cd9c77c`.

## Son Doğrulanan Production Commit

- **Doğrulanmadı.** (Production ile eşleşen commit bu oturumda doğrulanmadı.)

## Son Doğrulanan Production Deploy

- **Doğrulanmadı.** (Deploy ortamı/tarihi bu oturumda doğrulanmadı.)

## Son Başarılı Smoke Test

- **Doğrulanmadı.** (Bu oturumda smoke test çalıştırılmadı.)

## Devam Eden İş

- **S2.16 (Dictionary Expansion) AÇILDI** (`work/yh-s2-16`, taban `77aa824`). Bu turda yalnız worktree + açılış karar kilidi + **açılış docs commit'i** hazırlandı; **kod yazılmadı, push/PR yapılmadı**. Kilitli sözleşme: `expandConcepts(base: readonly Concept[], normalizedText: string, entries: readonly DictionaryEntry[]): readonly Concept[]` — S2.15 query-origin çıktısını küratörlü snapshot ile **additif** genişletir; **saf/DB'siz/fail-safe · [query prefix]+[synonym suffix] · sort yok · dedup=term/ilk-sıra (query synonym'i bastırır) · yalnız `origin:"synonym"` üretir · canonical=normalize(entry.canonical) · çok-kelime bitişik alt-dizi ("anne"⊄"anneanne") · tek-sıçrama/transitif yok · Object.freeze · kavram tavanı yok**. Giriş modeli `DictionaryEntry { canonical, synonyms[] }` (minimal). Planlanan: `lib/yasam-hafizasi/search/dictionaryExpansion.ts` + `scripts/yh-dictionary-expansion-harness.ts`; `types.ts`/`config.ts`/`normalize.ts`/`conceptSet.ts` **değişmez**. Kapsam dışı → S2.17: `DictionaryPort`/Supabase adapter · tenant/global merge · `lang`/`is_active` filtreleri · snapshot sıralaması · tsquery-boyut korkuluğu. Not: ROADMAP'te **S2.06 yoktur**.
- **Onay bekleyen:** S2.16 kod turu onayı. Sonraki **S2.17** (tsquery / dictionary adapter / tenant-global merge) **otomatik açılmaz**.

## Bekleyen İşler

- Yaşam Hafızası **S2.16** (Dictionary Expansion) kod turu → **S2.17** (otomatik açılmaz): [3] `search_tsv` sorgu + tsquery-boyut korkuluğu · gerçek Supabase dictionary/stone-exclusion adapter · tenant/global merge + `lang`/`is_active` filtreleri · [4] Kanıt Kapısı · [5] derece · [6] "Neden?" · INV harness. Her aşama ayrı salt-okunur analiz + kullanıcı onayıyla.
- Human Design **FAZ 5/2** (API route).
- Numeroloji QA düzeltmeleri (kritik RLS + hesap/görsel bulguları).
- Dijital İçerik Blok-2/3 + kimliksiz AI uç güvenliği.

## Önemli Mimari Kararlar

Ayrıntılı gerekçeler `ARCHITECTURE_DECISIONS.md`'de. Öne çıkanlar:

- **Kanıt Kapısı (Evidence Gate):** Kanıt yoksa sonuç gösterilmez (INV-1). AI yalnız Kavram Kümesi üretir; kayıt seçmez, cevap yazmaz.
- **PII iki fiziksel indeks:** `yasam_hafizasi_index` (bilgi/kütüphane) ve `yasam_hafizasi_index_PII` (danışan) ayrık; PII harici embedding/AI'ya çıkmaz (INV-PII).
- **Tenant Resolver saf fonksiyon:** DB erişimi enjekte edilir; fail-closed; coercion yok.
- **JSONB ayrıştırma builder katmanına ertelendi:** Kaynak config deklaratif/mantıksız kalır; JSONB çıkarımı S2.05/S2.07 builder'a aittir.

## Tamamlanan Modüller

Proje hafızasına göre kilitli/production-ready (ayrıntı `ROADMAP.md`):

- ✅ Kozmik / Cosmic Calendar (çekirdek + FAZ 2C/3A/3B/3C/4 + konum FAZ 5)
- ✅ Refleksoloji (maintenance mode, final kilit)
- ✅ Doğaltaş (V3 audit FAZ A–B5 + liste perf)
- ✅ Biyoenerji (V3 UX kilitlemeye hazır)
- ✅ Ürün & Stok (K-2/K-3)
- ✅ Danışan Yolculuğu (audit düzeltmeleri)
- ✅ Ayarlar & Güvenlik

> 🟡 Devam eden: Human Design, Aromaterapi, Şifa Rehberi, Dijital İçerik, Numeroloji, Yaşam Hafızası.

## Riskler

- **P0 güvenlik (hafıza kaydı):** `/api/auth/session` parolasız token üretimi (hesap devralma) + zayıf-auth ailesi (cross-tenant PII, ~16 route). *Doğrulama tarihi hafızada; bu oturumda yeniden test edilmedi.*
- **Numeroloji:** kritik RLS breach (cross-tenant PII) — hafıza kaydı, düzeltme bekliyor.
- **Doğaltaş RLS:** stones/minerals DB seviyesinde izole değil (anon key cross-tenant) — fix onaya bağlı.
- **Çoklu oturum:** Paylaşımlı `git index`; `83adab2` karışık-commit dersi (bkz. `CLAUDE_PROTOCOL.md`). Working-tree'de birden çok modülün değişikliği bir arada bulunabilir.
- **DDL kısıtı:** `DATABASE_URL=localhost` çalışmıyor; DDL yalnız Supabase Dashboard SQL Editor'dan.

## Notlar

- Bu, standart Next.js değildir; kod yazmadan önce `node_modules/next/dist/docs/` okunur (bkz. `AGENTS.md`).
- Yaşam Hafızası tasarım dokümanları `docs/yasam-hafizasi/` (12 dosya) — uygulama kararlarının kaynağı.
- Modül durumları proje hafızasından (`MEMORY.md`) türetilmiştir; kritik kilitleme öncesi ilgili modül yeniden doğrulanmalıdır.
