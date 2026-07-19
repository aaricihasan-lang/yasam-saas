# AKTİF GÖREV (CURRENT TASK)

> Bu dosya **yalnızca şu an üzerinde çalışılan tek görevi** tutar. Yeni bir görev
> başladığında bu dosya **baştan doldurulur** (önceki görevin özeti gerekiyorsa
> `PROJECT_STATUS.md` veya `CHANGELOG_AI.md`'ye taşınır).
>
> **Kullanım:** Görev başında bu şablon doldurulur ve kullanıcı onayı ile
> ilerlenir. Her aşama tamamlandıkça ilgili bölüm güncellenir.
>
> **⚠️ Ön koşul — Tutarlılık:** Bu dosya, `PROJECT_STATUS.md` ile **çelişmemelidir**.
> İkisi çelişiyorsa **geliştirmeye başlanmaz**; önce kullanıcıdan doğrulama istenir.

**Son güncelleme:** 2026-07-19 (S2.14 açılış)

---

## Durum

**Aktif görev: S2.14 — Retrieval Türkçe Metin Normalizasyonu — AÇILDI** (kod henüz
YOK). İzole worktree `work/yh-s2-14` (taban güncel `origin/main` = `4c672e9`, PR #4
merge). Bu turda yalnız docs açılış/karar kilidi yapıldı; **kod yazılmadı**. Önceki
görev **S2.13 tamamlandı ve main'e merge edildi** (PR #4, merge commit `4c672e9`,
ebeveynler `c412334` + `608f576`); aşağıda özetlenmiştir. Kod, kararların (A1–A11)
kilidi + kod-öncesi lexical sözleşme doğrulaması + kullanıcı onayı sonrası yazılacaktır.

---

## Tamamlanan (main'de) — özet

- **S2.13 — Retrieval Görünürlük Kararı** ✅ (**PR #4**, main `4c672e9`). Saf/deterministik/DB'siz görünürlük karar birimi (`lib/yasam-hafizasi/search/visibilityScope.ts` + `scripts/yh-visibility-scope-harness.ts`); kod commit `e3b4e73`. Kurallar: tenant · shared (`allowShared` kesin true) · PII dışlama · demo dışlama · enjekte stone-exclusion port + port hatasında fail-closed. Doğrulamalar: yeni harness **49/49**, 8 regresyon EXIT 0 (`yh-index-smoke` **41/41**), `tsc` EXIT 0, ESLint 0/0, güvenlik grep temiz.
- **S2.08–S2.12 — İndeksleyici write-side** ✅ (**PR #3**, main `555030a`): `runIndexUnit`/`parentTenantLookup` · `runSource`/`indexSourcePage` · `indexWritePlan`/`supabaseIndexAdapters` · admin index-page route · index smoke (exact-owned-record dry-run). Ayrıntı `CHANGELOG_AI.md`'de.
- **S2.04–S2.07** ✅: `tenantResolve` (S2.04) · `extractFields` (S2.05, PR #1 `cd9c77c`) · `buildCandidate` (S2.07, PR #2 `2b19743`).
- **S2.01–S2.03** ✅: retrieval tipleri (`search/types.ts`) · topic-dictionary DDL · indeks kaynak config (`sources.ts`).

Retrieval read-side boru hattı (`04-phase-2-fast-search.md`): **[1] normalize → [2] sözlük → [3] search_tsv → [4] Kanıt Kapısı → [5] derece → [6] Neden**. S2.13 [3]'ün görünürlük yükleminı tamamladı; **[1] normalize henüz yok** → S2.14.

---

## Aktif Görev — S2.14 (Retrieval Türkçe Metin Normalizasyonu) — AÇILDI (kod yok)

**Başlık:** S2.14 — Retrieval Türkçe Metin Normalizasyonu.

**Tek amaç:** Sorgu ve indeks metnine **simetrik** uygulanan saf, deterministik Türkçe
metin normalizasyonu + tokenizasyon (kaynak: `docs/yasam-hafizasi/04-phase-2-fast-search.md`
§1 "Türkçe Normalize"): Türkçe-duyarlı küçük harf → diyakritik katlama → noktalama/
tire/alt-çizgi → boşluk → boşluk sadeleştirme → tokenizasyon. **Stemmer YOK.**

**Kilitli kararlar (A1–A11):**
- **A1** — Kapsam yalnız saf/deterministik Türkçe retrieval metin normalizasyonu.
- **A2** — **Stop-list / gürültü kelime elemesi kapsam DIŞI** (sonraki sözlük/concept-set aşamasına bırakıldı).
- **A3** — Çıktı şekli: `{ normalizedText: string; tokens: string[] }`.
- **A4** — Tipler `normalize.ts` içinde lokal/exported; **`search/types.ts` bu fazda DEĞİŞMEZ**.
- **A5** — SQL/migration/Supabase adapter/API route/retrieval wiring/Kanıt Kapısı/concept-set/derece/"Neden?" **kapsam DIŞI**.
- **A6** — `package.json` / lockfile **değişmez**.
- **A7** — **AI kullanılmaz.**
- **A8** — IO/DB/fetch/env/service_role **kullanılmaz**.
- **A9** — Fonksiyon **saf, mutasyonsuz, deterministik**.
- **A10** — Boş/whitespace-only/yalnız-işaret girdi → **fail-safe** `{ normalizedText: ""; tokens: [] }`; crash yok.
- **A11** — I/İ/ı/i ve diyakritik dönüşümleri **tahminle belirlenmez**; kod-öncesi salt-okunur doğrulanır: retrieval normalizasyon sözleşmesi (`04-phase-2-fast-search.md` §1) + lexical infra migration (`20260712…_lexical_infra.sql`) + PostgreSQL text-search/`unaccent` config. Query-tarafı normalize, mevcut `search_tsv` (`to_tsvector('simple', yh_immutable_unaccent(...))`) davranışıyla **anlamsal uyumlu** olmalı. Doküman ile gerçek lexical altyapı çelişirse: kod yazma / tahmin yürütme / migration değiştirme YOK → yalnız çelişki raporlanır ve DUR.

**Planlanan yeni dosyalar (bu turda OLUŞTURULMADI):**
- `lib/yasam-hafizasi/search/normalize.ts`
- `scripts/yh-normalize-harness.ts`

**Dokunulmayacak:** `search/types.ts` · `visibilityScope.ts` · `tenantScope.ts` · `config.ts` (mümkünse) · indexer/* · migration'lar · `package.json` · lockfile.

**Lexical sözleşme ön-doğrulaması (bu turda salt-okunur yapıldı):** DB tarafı
`to_tsvector('simple', yh_immutable_unaccent(text))` (simple + unaccent). Migration notu:
"App normalize ASIL kaynaktır; DB unaccent DESTEKLEYİCİ/yedek (simetri)." Örnek:
`yh_immutable_unaccent('İğne Şifa Çakra') → 'Igne Sifa Cakra'` → `simple` küçük harf →
`igne sifa cakra`. Doküman §1 iki-adımlı sözleşmesi (İ→i / I→ı → diyakritik katlama)
izlendiğinde dört i-varyantı (I, İ, ı, i) her iki tarafta da **`i`**'ye yakınsıyor →
**bloklayıcı çelişki YOK**. Açık: DB `unaccent`'in lowercase `ı` (dotless) çıktısı
örnekte gösterilmedi → **kod turundan önce canlı PostgREST ile teyit edilecek** (tahminle
kodlanmayacak — A11).

**Durum:** Yalnız docs açılışı + karar kilidi + lexical ön-doğrulama yapıldı; **kod bu
turda yazılmadı**. Kod, kod-öncesi kesin lexical sözleşme doğrulaması + kullanıcı onayı
sonrası aynı çekirdek disipliniyle (saf + deterministik + fail-safe + harness) yazılacaktır.

## Bekleyen Onaylar

- **S2.14:** kod-öncesi kesin lexical sözleşme doğrulaması (canlı `unaccent` `ı`/`İ`/`I`/`i` teyidi) + kod turu onayı.

## Sonuç

- S2.01–S2.13 main'de; tümü doğrulandı (S2.13 = PR #4 `4c672e9`). **S2.14 açıldı** (docs;
  kod yok). Kapsam: retrieval Türkçe metin normalizasyonu ([1] boru hattı adımı). Kod,
  onay + lexical teyit sonrası yazılacaktır. `origin/main` değişmedi; push yapılmadı.
