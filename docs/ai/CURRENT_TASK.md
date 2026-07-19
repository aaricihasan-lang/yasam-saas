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

**Son güncelleme:** 2026-07-19 (S2.14 kapanış)

---

## Durum

**Aktif görev: S2.14 — Retrieval Türkçe Metin Normalizasyonu — TAMAMLANDI** (kod commit
`dd29167`; `origin/work/yh-s2-14`'e push edildi; **PR bekliyor**). İzole worktree
`work/yh-s2-14` (güncel `origin/main` = `91bcbab` ile senkron; branch HEAD sync merge
`ad03579`). Türkçe retrieval normalize birimi lexical sözleşme **canlı Supabase SELECT
ile doğrulandıktan** sonra yazıldı ve doğrulandı; kapanış docs commit'i ardından `main`
PR'ı hazırlanacaktır. `origin/main`'e push YOK; PR açılmadı. Önceki görev **S2.13
tamamlandı ve main'e merge edildi** (PR #4, `4c672e9`); aşağıda özetlenmiştir.

---

## Tamamlanan (main'de) — özet

- **S2.13 — Retrieval Görünürlük Kararı** ✅ (**PR #4**, main `4c672e9`). Saf/deterministik/DB'siz görünürlük karar birimi (`lib/yasam-hafizasi/search/visibilityScope.ts` + `scripts/yh-visibility-scope-harness.ts`); kod commit `e3b4e73`. Kurallar: tenant · shared (`allowShared` kesin true) · PII dışlama · demo dışlama · enjekte stone-exclusion port + port hatasında fail-closed. Doğrulamalar: yeni harness **49/49**, 8 regresyon EXIT 0 (`yh-index-smoke` **41/41**), `tsc` EXIT 0, ESLint 0/0, güvenlik grep temiz.
- **S2.08–S2.12 — İndeksleyici write-side** ✅ (**PR #3**, main `555030a`): `runIndexUnit`/`parentTenantLookup` · `runSource`/`indexSourcePage` · `indexWritePlan`/`supabaseIndexAdapters` · admin index-page route · index smoke (exact-owned-record dry-run). Ayrıntı `CHANGELOG_AI.md`'de.
- **S2.04–S2.07** ✅: `tenantResolve` (S2.04) · `extractFields` (S2.05, PR #1 `cd9c77c`) · `buildCandidate` (S2.07, PR #2 `2b19743`).
- **S2.01–S2.03** ✅: retrieval tipleri (`search/types.ts`) · topic-dictionary DDL · indeks kaynak config (`sources.ts`).

Retrieval read-side boru hattı (`04-phase-2-fast-search.md`): **[1] normalize → [2] sözlük → [3] search_tsv → [4] Kanıt Kapısı → [5] derece → [6] Neden**. S2.13 [3]'ün görünürlük yükleminı tamamladı; **[1] normalize henüz yok** → S2.14.

---

## Aktif Görev — S2.14 (Retrieval Türkçe Metin Normalizasyonu) — TAMAMLANDI (`dd29167`)

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

**Teslim edilen dosyalar:**
- `lib/yasam-hafizasi/search/normalize.ts` — `normalizeSearchText(input: unknown): NormalizedSearchText`; çıktı `{ normalizedText, tokens }`. Tam saf (hiç import yok); locale-bağımsız (`toLocaleLowerCase` YOK); fail-safe (string-olmayan/boş/işaret-only → `{ "", [] }`; hiçbir girdide throw yok); `Object.freeze` ile mutasyonsuz; deterministik. Türkçe fold: I/İ/ı/i→i · ç→c · ğ→g · ö→o · ş→s · ü→u · â→a · î→i · û→u; NFD + combining-mark strip → generic lowercase → noktalama/tire/altçizgi/sembol→boşluk → sadeleştir → whitespace tokenize. Stop-list/stemmer/concept-set/dedupe/sort YOK.
- `scripts/yh-normalize-harness.ts` — izole, DB'siz harness (83 assertion; production DB simetri fixture regression guard).

**Yeniden kullanılan/dokunulmayan:** `search/types.ts` · `visibilityScope.ts` · `tenantScope.ts` · `config.ts` · indexer/* · migration'lar · `package.json` · lockfile — **değişmedi** (A4/A6 korundu).

**Lexical sözleşme — canlı production Supabase salt-okunur SELECT ile DOĞRULANDI:**
index tarafı `to_tsvector('simple', yh_immutable_unaccent(text))` (unaccent → generic
lowercase). Teyit edilen query–index simetrisi: `IŞIK/Işık/ışık → isik` · `İĞNE/İğne/igne
→ igne` · `ŞİFA → sifa` · `ÇAKRA → cakra` · `GÖĞÜS → gogus` · `BÜTÜN → butun`. **Kritik
açık nokta kapandı: `ı → i`, `ışık → isik`.** App normalize (fold→generic-lowercase) DB
ile birebir aynı nihai token'ı üretir; `toLocaleLowerCase` gereksizdir.

**Doğrulamalar (GEÇTİ):**
- `npx tsx scripts/yh-normalize-harness.ts` → **EXIT 0, 83/83**.
- 9 regresyon harness → **EXIT 0** (extract-fields · build-candidate · run-index-unit · run-source · index-write-plan · **supabase-adapters 37** · admin-route 65 · **index-smoke 41** · **visibility 49**).
- `npx tsc --noEmit` → **EXIT 0**. Hedefli ESLint (2 S2.14 dosyası) → **0 error, 0 warning**. Güvenlik grep temiz (`normalize.ts` hiç import yok; supabase/DB/fetch/env/SQL/console/global-state yok). `git diff --check` temiz.

**Push durumu:** Kod commit `dd29167` (parent `596d21e`) + güncel main senkron merge
`ad03579` `origin/work/yh-s2-14`'e push edildi (`596d21e..ad03579`); local/remote **0/0**;
`origin/main` (`91bcbab`) **değişmedi**; **PR açılmadı**.

## Bekleyen Onaylar

- **S2.14:** bu kapanış docs commit'inin push'u → ardından `work/yh-s2-14` → `main` PR (Create a merge commit).

## Sonuç

- S2.01–S2.13 main'de (S2.13 = PR #4 `4c672e9`). **S2.14 tamamlandı** (`dd29167`,
  `origin/work/yh-s2-14`'te); production-teyitli query–index simetrisiyle doğrulandı;
  main'e karşı çakışmasız. S2.14 artık aktif değil, **tamamlanmış iş**. Sonraki S2.x
  aşaması **otomatik açılmaz**; yeni bir salt-okunur analiz turu + kullanıcı onayı gerektirir.
