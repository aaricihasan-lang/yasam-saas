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

**Son güncelleme:** 2026-07-20 (S2.17 kapanış)

---

## Durum

**Aktif geliştirme YOK.** En son görev **S2.17 — search_tsv Query (tsquery Plan)**
geliştirme ve doğrulama olarak **tamamlandı**; **feature branch commit'i hazır**
(`work/yh-s2-17` @ `46fd460`; feature kod `1ab8601`). **Push ve PR bekliyor;
main/production'a MERGE EDİLMEDİ.** Sıradaki sprint **S2.18** olarak planlanıyor;
**henüz açılmadı, kod yazılmadı** (mimari analiz bekliyor).

> **Durum ayrımı (önemli):** S2.17 için (1) kod tamamlandı ✅ · (2) feature branch'e
> commit edildi ✅ · (3) main/production'a merge edildi ❌. Yalnız ilk iki durum gerçekleşti.

---

## Son Tamamlanan Görev — S2.17 (search_tsv Query / tsquery Plan) — feature branch'te tamamlandı

**Başlık:** S2.17 — search_tsv Query (deterministik, güvenli tsquery planı üreticisi).

**Amaç:** S2.15 Concept Set + S2.16 Dictionary Expansion çıktısı (`readonly Concept[]`)
kullanılarak PostgreSQL full-text search için **güvenli, deterministik, DB'siz bir tsquery
planı** üretmek (kaynak: `04-phase-2-fast-search.md` §3). **S2.17 DB çalıştırmaz** — yalnız
`plan.tsquery` string'ini ve yapısal plan'ı üretir.

**Teslim edilen dosyalar (feature kod `1ab8601`):**
- `lib/yasam-hafizasi/search/tsQueryPlan.ts` — `buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan`
  + `TsQueryClause`/`TsQueryPlan`/`TsQueryClauseKind` tipleri.
- `scripts/yh-tsquery-plan-harness.ts` — izole harness (20 test grubu / 57 assertion).

**Uygulanan sözleşme (kilitli, doğrulandı):**
- Saf · deterministik · immutable · fail-safe · **DB'siz** · yan-etkisiz; **asla throw etmez**.
- Girdi `readonly Concept[]` (imza `unknown` **değil**; yalnız dizi-içi bozuk öğeye küçük guard; `any` yok).
- **Tek kelime concept → prefix `term:*`.** **Çok kelimeli concept → exact phrase `(t1 <-> t2)`;
  phrase'e prefix UYGULANMAZ** (KARAR 1).
- Clause'lar giriş sırasıyla **`|` (OR)** ile birleşir. PostgreSQL text-search **config = `simple`**;
  hedef kolon **`search_tsv`** (DB trigger `to_tsvector('simple', unaccent(...))` ile simetrik).
- **Query güvenliği:** ham girdi doğrudan eklenmez; her lexeme **`^[a-z0-9]+$` allowlist**'ten
  yeniden geçer; tek geçersiz lexeme → o concept clause'u **tamamen atlanır**; operatörler
  (`:*`, `<->`, `|`, `(`, `)`) yalnız koddan; SQL interpolation/DB çağrısı yok.
- **Serializer düzeyinde fragment dedup:** aynı güvenli fragment tekrarında ilk görünüm + ilk
  `origin` korunur (S2.15/S2.16 semantik dedup'ı yeniden uygulanmaz).
- **Boş/geçersiz:** hepsi elenirse `clauses:[]`, `tsquery:""`, `isEmpty:true`.
- **Immutability:** plan + `clauses` + her `TsQueryClause` `Object.freeze`; her çağrı taze; girdi mutasyonsuz.

**Kapsam dışı (S2.17 DEĞİL):** `candidateLimit`/`YH_CANDIDATE_LIMIT` · `ts_rank`/weights ·
DB execution · Supabase client · `textSearch` çağrısı · RPC · tenant/visibility filtresi ·
Stone Exclusion · Evidence Gate · Ranking · Retrieval Pipeline · UI · migration.

**Supabase textSearch API kanıtı (yerel kurulu paket tipiyle):** `@supabase/supabase-js` &
`@supabase/postgrest-js` **2.105.3**. `textSearch(column, query, { config?; type?: 'plain'|'phrase'|'websearch' })`.
**`type` omit → `fts` = `to_tsquery`** (OR/prefix/phrase); **`type:'tsquery'` literali YOK**.
Execution fazı (S2.18+) `.textSearch("search_tsv", plan.tsquery, { config: "simple" })` (type verilmeden) kullanacak.

**Doğrulamalar (feature kod turunda, `1ab8601` sonrası koşuldu):**
- S2.17 harness **57/57** · S2.16 regresyon **42/42** · S2.15 regresyon **42/42** · S2.14 regresyon **83/83**.
- `tsc --noEmit` **PASS** · hedefli ESLint **PASS** · `git diff --check` **PASS** · yasaklı kapsam grep temiz.

**Git durumu:** `work/yh-s2-17` commit zinciri — `1b8a147` (açılış docs) → `4f743c1` (ilk main sync) →
`1ab8601` (feature kod) → `46fd460` (son main sync) → kapanış docs (bu tur). ahead 4/behind 0
vs origin/main (`95efcab`); working tree temiz. **Push/PR yok; main/production'a merge edilmedi.**

---

## Sıradaki Sprint — S2.18 (henüz açılmadı, kod yok)

**Beklenen kapsam (S2.18'e ait — S2.17'ye karıştırılmaz):** DB Execution/Adapter
(`.textSearch("search_tsv", tsquery, { config:"simple" })`, type omit → `to_tsquery`) +
`ts_rank`/aday tavan (`YH_CANDIDATE_LIMIT`) · gerçek Supabase dictionary/stone-exclusion adapter ·
tenant/visibility filtresi · [4] Kanıt Kapısı · [5] derece · [6] "Neden?" · Retrieval Pipeline ·
INV-1/INV-2 harness. **Her aşama ayrı salt-okunur mimari analiz + kullanıcı onayıyla açılır;
otomatik açılmaz.**

## Bekleyen Onaylar

- **S2.17:** feature branch **push** + **PR** onayı (henüz yapılmadı).
- **S2.18:** mimari analiz turu onayı (sprint henüz açılmadı).

## Sonuç

- S2.01–S2.16 main'de. **S2.17 geliştirme + doğrulama tamamlandı; feature branch (`work/yh-s2-17`)
  commit'i hazır; push/PR bekliyor; main/production DEĞİL.** origin/main (`95efcab`) değişmedi.
  Sıradaki S2.18 ayrı analiz/onayla açılacak.
