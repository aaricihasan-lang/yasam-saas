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

**Son güncelleme:** 2026-07-20 (S2.17 açılış)

---

## Durum

**Aktif görev: S2.17 — search_tsv Query (tsquery Plan) — AÇILDI** (kod henüz YOK). İzole
worktree `work/yh-s2-17` (taban güncel `origin/main` = `dc94b98`). Bu turda yalnız worktree +
açılış karar kilidi + yerel Supabase API doğrulaması hazırlandı; **kod yazılmadı**,
`tsQueryPlan.ts`/harness **oluşturulmadı**, yalnız açılış docs commit'i yapılacaktır. Önceki
görev **S2.16 tamamlandı ve main'e merge edildi** (**PR #11**; kod `2192f74`, merge `dc94b98`);
aşağıda özetlenmiştir. Kod, kilitli sözleşme (aşağıda) + kullanıcı onayı sonrası yazılacaktır.

---

## Tamamlanan (main'de) — özet

- **S2.16 — Dictionary Expansion (Sözlük / Eş-Anlam Genişletme)** ✅ (**PR #11**; kod `2192f74`
  `feat(yasam-hafizasi): add S2.16 dictionary expansion`, merge `dc94b98`). Saf/deterministik/
  DB'siz `expandConcepts(base, normalizedText, entries): readonly Concept[]`
  (`lib/yasam-hafizasi/search/dictionaryExpansion.ts` + `scripts/yh-dictionary-expansion-harness.ts`).
  S2.15 query-origin çıktısını küratörlü snapshot ile additif genişletir; `[query prefix]` +
  `[synonym suffix]`; dedup=term (query synonym'i bastırır); yalnız `origin:"synonym"`;
  çok-kelime = bitişik alt-dizi; tek-sıçrama/transitif yok; `Object.freeze`; fail-safe; kavram
  tavanı yok. Giriş modeli `DictionaryEntry { canonical, synonyms[] }`. Harness 42/42.
  *(Kapanış docs'u S2.16 turunda yazılmamıştı; bu S2.17 açılışı S2.16'yı tamamlanmış-main
  gerçeğiyle kayda alır.)*
- **S2.15 — Kavram Kümesi (Concept Set)** ✅ (**PR #8**; kod `f56ec60`, merge `404841b`).
  `buildConceptSet(input): readonly Concept[]` — query-origin `Concept[]`; harness 42/42.
- **S2.14 — Retrieval Türkçe Metin Normalizasyonu** ✅ (**PR #6**; kod `dd29167`).
  `search/normalize.ts` + harness (83/83); query–index simetrisi production SELECT ile doğrulandı.
- **S2.13 — Retrieval Görünürlük Kararı** ✅ (**PR #4**, `4c672e9`): `search/visibilityScope.ts` (49/49).
- **S2.08–S2.12 — İndeksleyici write-side** ✅ (**PR #3**, `555030a`).
- **S2.04–S2.07** ✅ · **S2.01–S2.03** ✅ (retrieval tipleri · topic-dictionary DDL · sources).

Retrieval read-side boru hattı (`04-phase-2-fast-search.md`): **[1] normalize ✅ →
[2a] Concept Set ✅ → [2b] Dictionary Expansion ✅ → [3] search_tsv sorgu (BU GÖREV) →
[4] Kanıt Kapısı → [5] derece → [6] Neden**. Kilitli backlog: **search_tsv Query →
DB Execution/Adapter (+ts_rank/aday tavan) → Stone Exclusion Adapter → Evidence Gate →
Ranking → Retrieval Pipeline → Search UI**. S2.17 = **[3] search_tsv tsquery PLANI** (saf;
DB çalıştırma sonraki faz).

---

## Aktif Görev — S2.17 (search_tsv Query / tsquery Plan) — AÇILDI (kod yok)

**Başlık:** S2.17 — search_tsv Query (deterministik, güvenli tsquery planı üreticisi).

**Tek amaç:** S2.15 Concept Set + S2.16 Dictionary Expansion çıktısı (`readonly Concept[]`)
kullanılarak PostgreSQL full-text search için **güvenli, deterministik, DB'siz bir tsquery
planı** üretmek (kaynak: `04-phase-2-fast-search.md` §3). DB çalıştırma yapılmaz.

**Nihai fonksiyon (kullanıcı onaylı):**
```ts
export function buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan
```
> İmza küçük ve tip-güvenli: parametre **`unknown` YAPILMAZ**. Tamamen bozuk kök girdi bu saf
> internal fonksiyonun sorumluluğu değildir; yalnız dizi içindeki beklenmedik bozuk öğelere
> karşı fail-safe korunur (TS bypass/`any` yok).

**Nihai üretim tipleri:**
```ts
export interface TsQueryClause {
  readonly term: string;                 // S2.14-normalize lexeme(ler); phrase için boşlukla
  readonly origin: ConceptOrigin;        // downstream için korunur; tsquery'de AĞIRLIKLANDIRILMAZ
  readonly kind: "prefix" | "phrase";    // tek-token → prefix, çok-token → exact phrase
  readonly fragment: string;             // güvenli to_tsquery parçası: "isik:*" | "(anne <-> sutu)"
}
export interface TsQueryPlan {
  readonly config: "simple";             // DB simetrisi (sabit); Türkçe değil
  readonly column: "search_tsv";         // hedef kolon (sabit)
  readonly clauses: readonly TsQueryClause[];
  readonly tsquery: string;              // clause fragment'larının " | " OR-birleşimi; boşta ""
  readonly isEmpty: boolean;             // geçerli clause yok → true
}
```
> **`candidateLimit` ve `ts_rank` bu plana DAHİL DEĞİLDİR** (aşağıya bakınız).

**Kilitli sözleşme (kod öncesi, kullanıcı onaylı):**
- **Girdi** `readonly Concept[]`; **saf, deterministik, DB'siz**; **asla throw etmez**.
- **DB erişimi yok · RPC yok · adapter yok · migration yok · Supabase işlemi yok.**
- **Tenant/visibility filtresi yok · Stone Exclusion yok · Evidence Gate yok · Ranking yok · UI yok.**
- **Tek kelime concept → prefix** (`term:*`). **Çok kelimeli concept → exact phrase**
  (`(t1 <-> t2 …)`); **phrase'e prefix UYGULANMAZ** (KARAR 1: §3 prefix'i yalnız tek kelime için
  tanımlar; phrase-prefix yeni davranış icadı olur → yapılmaz).
- **Clause'lar `|` (OR) ile birleşir.** PostgreSQL text-search **config = `simple`** (DB trigger
  `to_tsvector('simple', unaccent(...))` ile simetrik; sorgu terimleri zaten S2.14-normalize).
- **Query güvenliği:** Ham kullanıcı girdisi tsquery'ye **doğrudan eklenmez**. Her lexeme S2.17
  içinde **yeniden allowlist doğrulamasından** (`^[a-z0-9]+$`) geçer. Yalnız doğrulanmış lexeme'ler,
  **kod tarafından belirlenen sabit PostgreSQL operatörleriyle** (`:*`, `<->`, `|`, `(`, `)`)
  serialize edilir; **operatörler kullanıcı girdisinden gelmez**. Geçersiz lexeme/clause
  **fail-safe biçimde atlanır**. Ortaya çıkan tsquery string'i **SQL metnine interpolate edilmez**
  (execution fazında PostgREST param değeri olarak taşınır).
- **Boş davranış:** Geçerli clause kümesi boşsa → `isEmpty: true` ve `tsquery: ""`. Boş/geçersiz
  tsquery **DB'ye gönderilmez** (bu kararı retrieval pipeline verir, S2.17 değil).
- **`YH_CANDIDATE_LIMIT` bu planın parçası DEĞİLDİR** (KARAR 2): Concept/tsquery boyutunu
  sınırlamaz; yalnız **PostgreSQL sorgusu çalıştıktan sonra dönen aday sayısını** sınırlar →
  `TsQueryPlan`'de **yok**, `buildTsQueryPlan` tarafından **okunmaz**, `config.ts` bu amaçla
  **import edilmez**, harness'te **test edilmez**; DB execution/retrieval adapter katmanında ele alınır.
- **`ts_rank` bu planın parçası DEĞİLDİR** (sıralama execution/S2.20).
- **Dedup:** Yeni semantik dedup katmanı **icat edilmez** (S2.15/S2.16 zaten term-dedup garantisi
  verir). Yalnız savunma amaçlı **serializer düzeyinde** aynı güvenli fragment tekrar oluşursa: ilk
  görünüm korunur, giriş sırası korunur, `origin` değiştirilmez, query/synonym öncelik sözleşmesi
  **yeniden uygulanmaz**.
- **Immutability:** çıktı planı + `clauses` + her `TsQueryClause` `Object.freeze`; her çağrı taze.

**Supabase textSearch API doğrulaması (yerel kurulu paket tipiyle KANITLANDI):**
- `@supabase/supabase-js` **^2.105.3** (lockfile 2.105.3) · `@supabase/postgrest-js` **2.105.3**.
- `textSearch(column, query, { config?: string; type?: 'plain' | 'phrase' | 'websearch' })`.
  **`type` omit → operatör `fts` = `to_tsquery`** (OR `|` + prefix `:*` + phrase `<->` tam desteği);
  `config` desteklenir (`fts(simple).<query>`). **`type: 'tsquery'` literali YOKTUR** (bu sürümde geçersiz).
- Sonuç: execution fazı (sonraki sprint) `.textSearch("search_tsv", plan.tsquery, { config: "simple" })`
  (type **verilmeden** → `to_tsquery`) kullanır. S2.17 yalnız `plan.tsquery` string'ini üretir; DB çağrısı yapmaz.

**Kapsam dışı (S2.17 DEĞİL):** DB execution/adapter · RPC · `ts_rank`/aday tavan (`YH_CANDIDATE_LIMIT`) ·
tenant/visibility filtresi · Stone Exclusion · Evidence Gate · Ranking · Retrieval Pipeline orkestrasyonu ·
Search UI · migration/SQL · config değişikliği.

**Yeniden kullanılan/dokunulmayan:** `search/types.ts` (`Concept`/`ConceptOrigin` type-only import) ·
`config.ts` · `normalize.ts` · `conceptSet.ts` · `dictionaryExpansion.ts` · `visibilityScope.ts` ·
indexer/* · migration'lar · `package.json` · lockfile — **değişmez**.

**Planlanan yeni dosyalar (bu turda OLUŞTURULMADI):**
- `lib/yasam-hafizasi/search/tsQueryPlan.ts` (`TsQueryClause`/`TsQueryPlan` + `buildTsQueryPlan`)
- `scripts/yh-tsquery-plan-harness.ts`

**Örnek çıktı sözleşmesi (edge-case, kod turunda harness'te doğrulanacak):**
`[]` → `{ config:"simple", column:"search_tsv", clauses:[], tsquery:"", isEmpty:true }` ·
`[{isik,query}]` → clause `isik:*`, `tsquery:"isik:*"` · `[{anne sutu,synonym}]` →
clause `(anne <-> sutu)` · `[{isik,query},{yurek,synonym}]` → `tsquery:"isik:* | yurek:*"`.

**Durum:** Yalnız worktree + açılış karar kilidi + API doğrulaması hazırlandı; **kod bu turda
yazılmadı**; yalnız açılış docs commit'i yapılacaktır (push/PR yok). Kod, kullanıcı onayı sonrası
aynı çekirdek disipliniyle (saf + deterministik + fail-safe + harness) yazılacaktır.

## Doğrulama planı (kod turu)

- Yeni **`yh-tsquery-plan-harness`** (prefix/phrase · OR-birleşim · injection-safe lexeme assert ·
  boş/bozuk giriş · determinizm · immutability · config/column sabitleri · fragment dedup).
- **S2.16** Dictionary Expansion + **S2.15** Concept Set + **S2.14** normalize regresyon harness'leri.
- `tsc --noEmit` · hedefli ESLint · güvenlik/kapsam grep · `git diff --check` + path-kapsam doğrulaması.

## Bekleyen Onaylar

- **S2.17:** açılış docs commit'i (bu tur) + **kod turu onayı**. Sonraki faz (DB execution/adapter +
  `ts_rank`/aday tavan + tenant/visibility) **otomatik açılmaz**.

## Sonuç

- S2.01–S2.16 main'de. **S2.17 açıldı** (worktree + karar kilidi + API doğrulaması + açılış docs; kod yok).
  Kapsam: retrieval [3] search_tsv tsquery planı (saf). Kod, onay sonrası yazılacaktır.
  `origin/main` (`dc94b98`) değişmedi; push/PR yapılmadı.
