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

**Son güncelleme:** 2026-07-21 (S2.18 KAPANIŞ — kod tamamlandı; doküman kapanışı)

---

## Durum

**S2.18 TAMAMLANDI — Saf Retrieval Query Descriptor / Execution Contract (EX-D).**
Kod + harness yazıldı, doğrulandı ve commit edildi; bu doküman kapanışıdır. **Push YOK,
PR YOK, origin/main merge YOK, S2.19 BAŞLAMADI.**

**Commit zinciri (`work/yh-s2-18`):** `9bbe5da` (worktree tabanı = güncel origin/main
snapshot) → **`d00fe3d`** (`docs(ai): open S2.18 retrieval query descriptor`) →
**`ab1d5f5`** (`feat(yasam-hafizasi): add S2.18 retrieval query contract` — kod) →
**doküman kapanış commit'i** (bu adım; yalnız `docs/ai/`).

**Kod teslimi (`ab1d5f56cb6bd6ca53916b4e1c65b46bed295a57`, yalnız 2 dosya):**
- `lib/yasam-hafizasi/search/retrievalQuery.ts`
- `scripts/yh-retrieval-query-harness.ts`

`buildRetrievalQuery(plan: TsQueryPlan, visibility: VisibilityContext): RetrievalQueryDescriptor`
saf/deterministik/immutable/DB'siz üretildi. **DB execution S2.18'de YOK** — gerçek DB
adapter/RPC/DDL **S2.19 kapsamıdır**.

**Önceki durum (kayda alındı):** S2.17 (search_tsv tsquery Plan) **main/production'a merge
EDİLDİ** — **PR #13**, merge commit **`7344b6d`**. `origin/main` bu tarihten sonra
**`9bbe5da`**'ya ilerledi (yalnız **Danışan Yolculuğu / clients** mobil analiz + Word UX
düzeltmeleri — YH yüzeyine dokunmayan drift). **S2.18 worktree tabanı = `9bbe5da`**
(sabit SHA `9bbe5da82a2f9f5ccc4525b01a18141cf7ee77a3`), branch `work/yh-s2-18`.

---

## Görev

Yaşam Hafızası™ **Sprint 2 / S2.18 — Saf Retrieval Query Descriptor / Execution Contract
(EX-D)**. S2.17 `TsQueryPlan` çıktısını tüketen; **DB'siz, saf, deterministik** biçimde
retrieval sorgusunun **execution niyetini typed veri olarak** üreten bir builder.

**Temel:** S2.17 (`tsQueryPlan.ts`) **main'de** (PR #13, `7344b6d`). S2.18 bunun üstüne
inşa edilir; S2.17'ye dönülmez, değiştirilmez (yalnız import + tüketim).

## Amaç

Faz-2 boru hattının [3] adımının **saf yarısını** tamamlamak: `TsQueryPlan`'ı alıp,
gerçek DB yürütmesi için gereken **tüm kararları typed bir descriptor olarak** paketlemek —
**ama DB'ye gitmeden, SQL üretmeden, ts_rank hesaplamadan.** Gerçek `.textSearch`/`.rpc()`
yürütmesi + PostgreSQL fonksiyonu + DDL, **S2.19'a** (ayrı onay) bırakılır.

**Doğrulanmış sprint amacı (kanıtlı):** Sıradaki anayasal ünite `TsQueryPlan`'ı tüketen
**execution bağlantısıdır** (boru hattı §Boru Hattı: `[3] search_tsv SORGUSU`). **Evidence
Gate [4] DEĞİLDİR** — o downstream'dir ve `Candidate[]`'ı tüketir, `TsQueryPlan`'ı değil.
`04-phase-2-fast-search.md` §Boru Hattı + §3 + §9; `tsQueryPlan.ts` "Kapsam dışı" notu;
`search/types.ts` `Candidate` tipi bu sırayı doğrular.

## Kapsam (plan → typed execution descriptor)

Tek saf fonksiyon, `TsQueryPlan` (S2.17) + `VisibilityContext` (S2.13) alıp bir
**discriminated union** descriptor üretir:

- **`kind:'noop'`** → DB execution **YASAK**; `reason` sınırlı union.
- **`kind:'query'`** → güvenli descriptor; S2.19 adapter'ı **yalnız bunu** çalıştırabilir.

`kind:'query'` taşıdıkları (hepsi typed veri, **SQL string YOK** — nihai kod ile teyitli):
- `config: 'simple'` + `column: 'search_tsv'` + `tsquery` (S2.17 plan'ından **birebir**).
- **Visibility sözleşmesi** — S2.13 `VisibilityContext` **taşınır** (yeniden hesaplanmaz);
  yalnız `sessionTenantId` + `allowShared` (taze frozen kopya).
- **Ranking niyeti** — `requiresWeightedTsRank: true`, `weightsSource: 'YH_TSV_WEIGHTS'` +
  `weights` (değerin taze frozen kopyası: `A=1.0, B=0.6, C=0.35, D=0.15`),
  `direction: 'desc'`. **ts_rank hesaplanmaz.**
- **Limit niyeti** — `source: 'YH_CANDIDATE_LIMIT'` + `value: 150`. **Kesme yapılmaz.**

> **⚠️ invariantFilters UZLAŞTIRMASI (açılış önerisi ↔ nihai kod):** Açılış dokümanında
> geçen "**Invariant filtre niyeti** (`is_client_pii = false` + demo-skip typed bayrak)"
> önerisi **nihai kodda UYGULANMADI**. Nihai descriptor şunları **TAŞIMAZ:**
> `invariantFilters` · `requireNonPii` · `excludeDemo` · SQL WHERE · SQL fragment ·
> güvenlik filtresi string'i. **Bilinçli gerekçe:** `VisibilityContext` yalnız güvenilir
> session-tabanlı context'tir; S2.18 visibility politikasını **yeniden uygulamaz** ve
> ikinci bir tenant/shared/PII/demo karar motoru **oluşturmaz**. Yetkili aday görünürlük
> kararı **S2.13 `evaluateVisibility`** katmanında kalır; PostgreSQL WHERE/RPC
> materyalizasyonu **S2.19** kapsamıdır. (PII/demo `VisibilityContext`'te yok → descriptor'a
> ikinci kopya olarak da eklenmez; sahibi S2.13 + ana-indeks kısıtlarıdır.)

## Kararlar (K1–K7, onaylı — 7 mimari düzeltme)

- **K1 (Visibility yeniden üretme YOK):** S2.18, `sessionTenantId + allowShared` alıp S2.13
  kurallarını **yeniden hesaplamaz**. Mevcut **`VisibilityContext`** tipini (`search/visibilityScope.ts`)
  import edip **taşır**; tenant/shared/PII/demo'nun **ikinci bağımsız implementasyonu OLUŞTURULMAZ**.
  Satır-bazı yetkili karar `evaluateVisibility` (S2.13); WHERE materyalizasyonu S2.19. Yeni isim icat
  edilmez (mevcut tip/fonksiyon adları esas).
- **K2 (Fail-closed sonuç sözleşmesi):** Sonuç **discriminated union**: `kind:'noop'` (execution yasak)
  | `kind:'query'` (güvenli descriptor). `RetrievalQueryNoopReason` **sınırlı union**:
  `'empty-tsquery'` (plan boş/`isEmpty`) | `'invalid-visibility-context'` (session tenant boş/geçersiz →
  fail-closed). Adapter (S2.19) sözleşmesi: **yalnız `kind:'query'` çalıştırılabilir.**
- **K3 (String SQL YOK):** Descriptor içinde **SQL WHERE metni / fragment / birleştirilmiş
  güvenlik filtresi ÜRETİLMEZ.** Visibility/ranking/limit **typed veri**. SQL/RPC parametre dönüşümü
  **S2.19** sorumluluğu.
- **K4 (Ranking sınırı):** S2.18 **ts_rank hesaplamaz, DB'ye gitmez.** Descriptor yalnız execution
  niyetini taşır: weighted ts_rank gereksinimi + `YH_TSV_WEIGHTS` kaynağı/değeri + descending +
  `YH_CANDIDATE_LIMIT` kaynağı/değeri. **SQL ifadesi oluşturulmaz.**
- **K5 (Tek config kaynağı — drift borcu):** TypeScript config ile gelecekteki PostgreSQL RPC
  sabitlerinin **ayrışma (drift) riski** dokümante edilir. **S2.19 zorunluluğu:** ağırlık + limit ya
  descriptor'dan **RPC parametresi** olarak geçirilecek, ya SQL'de sabitlenirse **TS config ile
  senkronizasyonu doğrulayan harness** bulunacak. **S2.18'de DDL kararı verilmez.**
- **K6 (Immutability):** Saflık + immutability zorunlu. `Object.freeze` **kullanılır** (mevcut proje
  deseni — `tsQueryPlan.ts`/`visibilityScope.ts` bunu destekler). Asıl garantiler: (a) input mutasyonu
  yok, (b) yeni çıktı nesneleri, (c) input referanslarının kontrolsüz sızdırılmaması, (d) deterministik
  eşit çıktı. **Harness dördünü de doğrular.**
- **K7 (Module facet — kapsam dışı):** Boru hattı §8'e göre module facet **sunum-katmanı** işidir
  (tek retrieval tüm izinli modülleri kapsar; faset sayaçları fetch-sonrası). En dar kapsam adına
  **S2.18'e EKLENMEZ.** Sunucu-tarafı modül daraltma ileride gerekirse **ayrı karar** (yalnız
  `YhSourceModule` allowlist ile; serbest string kabul edilmez).

## Kapsama Dahil Değil (S2.18 DEĞİL)

- Gerçek DB execution: `.textSearch(...)` / `.rpc()` / Supabase client çağrısı → **S2.19**.
- PostgreSQL fonksiyonu / RPC / DDL / production SQL / migration → **S2.19** (ayrı onay + Dashboard).
- `ts_rank` hesaplama, aday satır getirme, gerçek dictionary/stone-exclusion Supabase adapter'ı.
- **[4] Kanıt Kapısı (Evidence Gate)** — **downstream, kapsam dışı.** `Candidate[]` tüketir; ayrı ünite.
- [5] derece · [6] "Neden?" · Retrieval Pipeline orkestrasyonu · module facet (K7).
- UI / route / semantic / PII / AI.

## Dokunulmayacak Dosyalar

- `lib/yasam-hafizasi/search/tsQueryPlan.ts` (S2.17), `visibilityScope.ts` (S2.13),
  `normalize.ts` (S2.14), `conceptSet.ts` (S2.15), `dictionaryExpansion.ts` (S2.16),
  `types.ts` (S2.01), `config.ts`, `flags.ts` — **değişmez; yalnız import.**
- `docs/yasam-hafizasi/` (salt-okunur tasarım kaynağı).
- Tüm uygulama kodu (`app/`, `components/`, diğer `lib/`) ve diğer oturumların working-tree
  değişiklikleri — **dokunulmaz** (bkz. paralel-oturum izolasyonu + commit-scope).

## Yapılmayacaklar

- Saflık ihlali: Supabase/fetch/env/DB/IO/`Date`/`Math.random`/global mutable state — **yasak.**
- String SQL / WHERE metni / birleştirilmiş filtre üretimi (K3).
- Visibility kurallarının ikinci implementasyonu (K1).
- ts_rank hesaplama veya DB çağrısı (K4). DDL kararı (K5).
- Git işlemi (stage/commit/push), SQL, migration, API değişikliği — **onaysız.**

## Riskler

- **R1 — Visibility çift-implementasyon:** tenant/shared/PII/demo mantığı S2.18'de yeniden yazılırsa
  S2.13 ile ayrışır → K1: yalnız `VisibilityContext` taşınır, karar motoru yazılmaz.
- **R2 — Config/SQL drift:** weights/limit ileride SQL'de sabitlenip TS config'ten ayrışabilir →
  K5: S2.19 için RPC-parametre VEYA sync-harness zorunluluğu kaydedildi.
- **R3 — Sızıntı/execution:** boş/bozuk plan yürütülebilir descriptor üretirse INV-TENANT riski →
  K2: fail-closed `kind:'noop'`; adapter yalnız `kind:'query'` çalıştırır.
- **R4 — Kapsam kayması:** Evidence Gate/ranking/facet S2.18'e sızarsa → kapsam dışı kilitlendi.
- **R5 — Çoklu oturum / paylaşımlı index:** izole worktree + yalnız yeni dosya + path-scoped commit.

## Teslim Edilen Çıktılar (KOD AŞAMASI — TAMAMLANDI, `ab1d5f5`)

- ✅ `lib/yasam-hafizasi/search/retrievalQuery.ts` — saf, fail-safe, deterministik, DB'siz.
  - `buildRetrievalQuery(plan: TsQueryPlan, visibility: VisibilityContext): RetrievalQueryDescriptor`
  - Yeni tipler **bu dosyada** (`RetrievalQueryDescriptor` discriminated union +
    `RetrievalQueryNoopReason` + `RetrievalTsvWeights`/`RetrievalRankingIntent`/`RetrievalLimitIntent`);
    `types.ts` değişmedi (S2.17 deseni).
- ✅ `scripts/yh-retrieval-query-harness.ts` — izole harness (`tsx`).

## Doğrulama (KOD AŞAMASINDA — GEÇTİ)

- Adım-0 salt-okuma: `TsQueryPlan`/`VisibilityContext`/`YH_TSV_WEIGHTS`/`YH_CANDIDATE_LIMIT`
  tip ve şekilleri (yapıldı).
- Harness matrisi (geçti): boş plan → `kind:'noop'`/`empty-tsquery` · geçersiz session tenant →
  `kind:'noop'`/`invalid-visibility-context` · geçerli → `kind:'query'` (config/column/tsquery/
  visibility taşındı) · weights == `YH_TSV_WEIGHTS` · limit == `YH_CANDIDATE_LIMIT` · direction='desc' ·
  immutability (freeze + input mutasyon yok + fresh output + ref sızıntısı yok) · determinizm ·
  **SQL string üretilmediği** grep-assert.
- **Sonuçlar:** yeni harness **52/52 PASS** · S2.13 **49/49** · S2.14 **83/83** · S2.15 **42/42** ·
  S2.16 **42/42** · S2.17 **57/57** · TypeScript PASS · hedefli ESLint PASS · `git diff --check` PASS.

## S2.19 MİMARİ ZORUNLULUĞU — Görünürlük ↔ LIMIT 150 sırası (S2.18'de UYGULANMAZ)

> **Bu kural yalnız dokümana yazılır; S2.18 kodunda UYGULANMAZ, S2.19 henüz BAŞLAMAZ.**
> Kullanıcı ayrıca SQL çalıştırmayacaktır. `YH_CANDIDATE_LIMIT = 150` aday tavanı S2.19
> DB execution'ında materyalize edilirken **kabul edilen tek mantıksal sıra** şudur:

1. **tenant/shared görünürlük sınırı**
2. **PII/demo güvenlik şartları**
3. **`search_tsv` eşleşmesi**
4. **weighted PostgreSQL `ts_rank`**
5. **rank DESC**
6. **`YH_CANDIDATE_LIMIT = 150`**
7. sonuçlar üzerinde **S2.13 `evaluateVisibility` savunma katmanı**

**Yanlış ve KABUL EDİLMEYEN sıra:** önce rank + `LIMIT 150` → sonra görünmeyen adayları ele.
**Sebep:** görünmeyen kayıtlar ilk 150 adayın içinde yer kaplayabilir; sonradan elenseler bile
görünür kayıtların aday havuzuna girmesini engelleyebilir. Bu, **veri sızıntısı olmasa bile**
eksik ve yanlış top-N sonucu üretir. Görünürlük sınırı **LIMIT'ten ÖNCE** uygulanmalıdır.

## Commit

- **Bu görev üç ayrı, izole commit'tir (path-scoped):**
  1. ✅ **Doküman açılışı** (`d00fe3d`): yalnız `docs/ai/`.
  2. ✅ **S2.18 kod** (`ab1d5f5`): `lib/yasam-hafizasi/search/retrievalQuery.ts`,
     `scripts/yh-retrieval-query-harness.ts`.
  3. **Doküman kapanışı** (bu adım): yalnız `docs/ai/CURRENT_TASK.md`, `PROJECT_STATUS.md`,
     `ROADMAP.md`, `CHANGELOG_AI.md`.
- `git add .` / `git add -A` / `git commit -a` **YASAK**; yalnız ilgili path'ler stage edilir.

### Commit Mesajları

```
docs(ai): open S2.18 retrieval query descriptor        (d00fe3d) ✅
feat(yasam-hafizasi): add S2.18 retrieval query contract  (ab1d5f5) ✅
docs(ai): close S2.18 retrieval query contract         (bu adım)
```

## Push

- **Yalnızca ayrı kullanıcı onayıyla.** Push öncesi `git fetch` + ahead/behind kontrolü.
  **Bu adımda push YOK, PR YOK, origin/main merge YOK.**

## Sonuç

- *(S2.18 TAMAMLANDI — saf Retrieval Query Descriptor / Execution Contract. Kod `ab1d5f5`
  (2 dosya) yazıldı ve doğrulandı: yeni harness 52/52, 5 regresyon PASS, TS/ESLint/diff-check
  PASS. Nihai descriptor `invariantFilters`/`requireNonPii`/`excludeDemo`/SQL taşımaz — visibility
  kararı S2.13'te, WHERE/RPC materyalizasyonu S2.19'da. DB execution/RPC/DDL + Evidence Gate
  **S2.19+ (kapsam dışı, otomatik başlamaz)**. Bu adım doküman kapanışı; push/PR/merge YOK.)*
