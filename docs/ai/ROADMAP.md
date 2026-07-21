# YOL HARİTASI (ROADMAP)

> Bu dosya, projedeki **büyük modülleri ve sprintleri** üst düzeyde gösterir.
> Ayrıntılı güncel durum `PROJECT_STATUS.md`'de, aktif görev `CURRENT_TASK.md`'dedir.
>
> **Durum işaretleri:** ✅ Tamamlandı · 🟡 Devam ediyor · ⬜ Bekliyor
>
> **Kaynak notu:** Modül durumları, proje hafızası (`MEMORY.md` indeksi) ve repo
> içi doğrulanmış dosyalardan türetilmiştir. Yaşam Hafızası sprint durumları
> `docs/yasam-hafizasi/10-roadmap.md` ve `lib/yasam-hafizasi/` kaynak dosya
> başlıklarından doğrulanmıştır. Tarihler mutlaktır. Güncel gerçek için
> `PROJECT_STATUS.md` esas alınır.

---

## 1. Modül Genel Durumu

| Modül | Durum | Not (doğrulanmış / hafıza kaydı) |
|---|:--:|---|
| Kozmik / Cosmic Calendar | ✅ | Çekirdek motorlar + FAZ 2C/3A/3B/3C/4 + global konum FAZ 5 kilitli (maintenance mode) |
| Refleksoloji | ✅ | Maintenance mode; audit düzeltmeleri + FINAL kilit; production ready |
| Doğaltaş | ✅ | V3 audit FAZ A–B5 + liste perf kilitli; tenant-only mimari |
| Biyoenerji (enerji-beden) | ✅ | V3 UX birleştirme kilitlemeye hazır (görsel + perf P0/P1) |
| Ürün & Stok | ✅ | K-2 envanter + K-3 "cep stok defteri" DB-first |
| Danışan Yolculuğu | ✅ | Audit düzeltmeleri (IDOR/cascade/görüşme/confirm) |
| Ayarlar & Güvenlik | ✅ | /settings 5 sekme + hesap güvenliği (session guard, risk motoru) |
| Human Design | 🟡 | Hesap motoru + BodyGraph sunum kilitli; production entry point var; API route (FAZ 5/2) bekliyor |
| Aromaterapi | 🟡 | FAZ B1 AI'sız Blend Oluşturucu kilitli; sonraki fazlar açık |
| Şifa Rehberi | 🟡 | Çekirdek akış sağlam; legacy kolon fallback (liste kartı "0 bölüm") açık |
| Dijital İçerik | 🟡 | Blok-1 patch'leri; Blok-2/3 + kimliksiz AI uç güvenliği açık |
| Numeroloji | 🟡 | Sert QA: kritik RLS + hesap/görsel bulguları (~62/100), düzeltme bekliyor |
| **Yaşam Hafızası™** | 🟡 | Merkezi zeka katmanı; TASARIM tam + Sprint 1 + Sprint 2 kısmen (aşağıya bakınız) |

> **Not:** Modül "✅" işareti, ilgili sprint/faz kilidini ifade eder; her modülde
> bug/güvenlik/perf/polish backlog'u sürebilir. Bilinen kritik güvenlik riskleri
> `PROJECT_STATUS.md → Riskler` altındadır.

---

## 2. Yaşam Hafızası™ — Sprint Yol Haritası

**Tasarım (FAZ 0–7):** ✅ Tamamlandı — 12 doküman `docs/yasam-hafizasi/` altında
(Anayasa v1.0 + Kanıt Kuralı + mimari + faz tasarımları + roadmap).

**Uygulama iş sırası:** `Migration → Indexer → Retrieval → UI → Semantic → PII →
Derin Analiz → Admin → Test → Deploy`

### Sprint 0 — Hazırlık ⬜/🟡
- Açık kararlar + extension kurulumu (`unaccent`, `vector`), feature-flag iskelet, sınırda-PII sınıf kararı.
- *Durum: kısmen; feature-flag iskelet kodu mevcut (`config.ts`, `flags.ts`).*

### Sprint 1 — Şema + Indexer 🟡
- **A1 merkezi sabitler/tipler** ✅ — `lib/yasam-hafizasi/config.ts`, `tenantScope.ts`, `flags.ts`
- İndeks tabloları (`yasam_hafizasi_index` + `..._PII`) + RLS + lexical backfill: ⬜ (DDL Dashboard'dan)

### Sprint 2 — Retrieval (Hızlı Tarama) 🟡
| Aşama | İş | Durum | Doğrulama |
|---|---|:--:|---|
| **S2.01** | Lexical Retrieval ortak tipleri (Concept/Evidence/Candidate/RankedResult) | ✅ | `search/types.ts` |
| **S2.02** | Küratörlü eş-anlam/kavram sözlüğü DDL (`yh_topic_dictionary`) | ✅ | `config.ts` (YH_TABLES.topicDictionary); DDL Dashboard'dan |
| **S2.03** | İndeks kaynak config (17 kaynak, kolon-rol eşleme, deklaratif) | ✅ | `indexer/sources.ts` |
| **S2.04** | Tenant Resolver (saf fonksiyon, fail-closed, column/join mode) | ✅ | `indexer/tenantResolve.ts` |
| **S2.05** | JSONB alan çıkarımı (metin/tag/relation ayrıştırma) | ✅ | `indexer/extractFields.ts` + `scripts/yh-extract-fields-harness.ts` (`b5d726f`, PR #1 merge `cd9c77c`) |
| **S2.07** | İndeks-birimi builder (yazma-yanı `BuiltIndexUnit`: group_key + content_hash + title/snippet) | ✅ | `indexer/buildCandidate.ts` + `scripts/yh-build-candidate-harness.ts` (`380e44f`, PR #2 merge `2b19743`; harness 28/28) |
| **S2.08** | Index-unit runner + `ParentTenantLookup` enjeksiyonu | ✅ | `indexer/runIndexUnit.ts` + `parentTenantLookup.ts` (`dd7a022`, PR #3 merge `555030a`) |
| **S2.09** | Source runner (keyset cursor sayfalama, join parent preload, hata izolasyonu) | ✅ | `indexer/runSource.ts` + `indexSourcePage.ts` (`172aa91`, PR #3) |
| **S2.10** | Index write plan + Supabase adapters (search_text, hash-aware upsert plan, fail-fast writer) | ✅ | `indexer/indexWritePlan.ts` + `supabaseIndexAdapters.ts` (`b8ffc67`, PR #3) |
| **S2.11** | Admin index-page route (admin auth + demo fail-closed + dry-run/write ayrımı) | ✅ | `indexer/adminIndexRequest.ts` + `app/api/admin/yasam-hafizasi/index-page/route.ts` (`e171fa1`, PR #3) |
| **S2.12A** | Index smoke aracı (plan-only) | ✅ | `indexer/indexSmokePlan.ts` + `scripts/yh-index-smoke.ts` (`2dc44d3`, PR #3) |
| **S2.12C** | Exact-owned-record smoke dry-run (pk+tenant tek sorgu; write/delete yok) | ✅ | `indexSmokePlan.ts` + `scripts/yh-index-smoke-harness.ts` (`93ae185`, PR #3; smoke 41/41) |
| **S2.13** | Retrieval görünürlük kararı (session + shared birlikte filtre; saf/DB'siz, stone exclusions enjekte port) | ✅ | `search/visibilityScope.ts` + `scripts/yh-visibility-scope-harness.ts` (`e3b4e73`, **PR #4 merge `4c672e9`**; harness **49/49**) |
| **S2.14** | Retrieval Türkçe metin normalizasyonu (saf/DB'siz; §1 simetrik normalize + tokenizasyon; stemmer/stop-list YOK) | ✅ | `search/normalize.ts` + `scripts/yh-normalize-harness.ts` (`dd29167`, **PR #6**; harness **83/83**; query–index simetrisi production SELECT ile doğrulandı) |
| **S2.15** | Kavram Kümesi / Concept Set (saf/DB'siz; query → normalize token → query-origin `Concept[]`; phrase/dictionary/synonym YOK) | ✅ | `search/conceptSet.ts` + `scripts/yh-concept-set-harness.ts` (`f56ec60`, **PR #8 merge `404841b`**); `buildConceptSet(input): readonly Concept[]`; dedup=term/ilk-sıra; `Object.freeze`; fail-safe |
| **S2.16** | [2b] Dictionary Expansion (saf/DB'siz; S2.15 query-origin çıktısını küratörlü snapshot ile additif synonym-origin `Concept`'lerle genişletir; çok-kelime = bitişik alt-dizi; tek-sıçrama/transitif yok) | ✅ | `search/dictionaryExpansion.ts` + `scripts/yh-dictionary-expansion-harness.ts` (`2192f74`, **PR #11 merge `dc94b98`**); `expandConcepts(base, normalizedText, entries): readonly Concept[]`; giriş `DictionaryEntry { canonical, synonyms[] }`; harness 42/42 |
| **S2.17** | [3] `search_tsv` tsquery PLANI (saf/DB'siz; `Concept[]` → güvenli deterministik tsquery; tek kelime prefix, çok kelime exact phrase, OR birleşim, config `simple`, lexeme allowlist re-assert; **DB/RPC/adapter/ts_rank/candidate-limit YOK**) | ✅ **PR #13 `7344b6d`** | `search/tsQueryPlan.ts` + `scripts/yh-tsquery-plan-harness.ts` (feature kod `1ab8601`; harness **57/57**); `buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan`. main'de |
| **S2.18** | [3-saf] **Retrieval Query Descriptor / Execution Contract (EX-D)** — S2.17 `TsQueryPlan` çıktısını tüketir; **DB'siz/saf/deterministik**; execution niyetini typed descriptor olarak üretir (config/column/tsquery + S2.13 `VisibilityContext` taşınır + ranking intent: `YH_TSV_WEIGHTS`/desc/`YH_CANDIDATE_LIMIT`); fail-closed `kind:'noop'\|'query'`; **string SQL YOK · ts_rank YOK · DB YOK · `invariantFilters`/`requireNonPii`/`excludeDemo` YOK** | ✅ **PR #15 `89815ef`** | `search/retrievalQuery.ts` + `scripts/yh-retrieval-query-harness.ts` (kod `ab1d5f5`; harness **52/52**); `buildRetrievalQuery(plan, visibility): RetrievalQueryDescriptor`. Visibility kararı S2.13'te; WHERE/RPC + görünürlük→LIMIT 150 sırası S2.19. main'de |
| **S2.19A** | [3-impure] **Retrieval Executor + Supabase Adapter + ts_rank RPC** — descriptor → `public.yh_search_candidates` RPC → `Candidate[]`; weighted ts_rank DB'de; §9 görünürlük + stone `NOT EXISTS` **ORDER BY/LIMIT'ten ÖNCE**; `evaluateVisibility` post-fetch savunma; SECURITY INVOKER + p_weights fail-loud | ✅ **PR #17 `0a1348d`** main'de | `search/retrievalExecutor.ts` + `search/supabaseRetrievalAdapter.ts` + `scripts/yh-retrieval-executor-harness.ts` (**49/49**) + `migrations/20260724000000_yh_search_candidates_rpc.sql`. ts_rank `[A,B,C,D]→{D,C,B,A}` |
| **S2.19B** | production Dashboard DDL uygulaması + salt-okunur doğrulama SQL | ✅ **production'da** (RPC uygulandı + doğrulama PASS: INVOKER/STABLE/service_role-only/trigger/GIN). `yasam_hafizasi_index` **BOŞ** → C beklemede |
| **S2.19-BF/BF-0** | **Kaynak PII Sınıflandırma Guard'ı** — 17 kaynağa zorunlu `classification` (**safe-non-pii 15 / pii 1 / unclassified 1 / deferred 0**); yalnız `safe-non-pii && enabled` indekslenir (fail-closed; dry-run + write); INV-PII ana index CHECK değişmez | 🟡 Kod fazı (`work/yh-bf0` @ `f67afb5`) | `indexer/sources.ts` (classification) + `sourceGuard.ts`(yeni) + `adminIndexRequest.ts` (403 `source-not-indexable`) + `indexSourcePage.ts` (son savunma) + harness. Driver/dry-run/write DIŞI |
| **S2.19-BF/BF-1 → S2.19C** | **BF-1:** pilot `aromaterapi:oils` + local Node driver → admin route (cursor, dry-run zorunlu, resumable) · **S2.19C:** canlı smoke + INV harness | ⬜ | Ayrı onay; **otomatik açılmaz**. "Tam güvenli canlı retrieval" C öncesi ilan edilmez |
| **S2.20+** | **[4] Kanıt Kapısı (Evidence Gate)** (`Candidate[]` tüketir) → [5] derece → [6] "Neden?" → Retrieval Pipeline | ⬜ | Ayrı mimari analiz/onay; **otomatik açılmaz** |

> **S2.05, S2.07, S2.08–S2.12, S2.13, S2.14, S2.15, S2.16, S2.17 tamamlandı ve main'de** (PR #1 `cd9c77c`, PR #2 `2b19743`, PR #3 `555030a`, PR #4 `4c672e9`, **PR #6** `dd29167`, **PR #8** `404841b`/`f56ec60`, **PR #11** `dc94b98`, **PR #13** `7344b6d` = S2.17, **PR #15** `89815ef` = S2.18). `origin/main` sonrasında **PR #16 `2c1d728`** (aromaterapi bilgi bankası; **YH-dışı drift**). **S2.19A — Retrieval Executor + Supabase Adapter + ts_rank RPC: KOD-TAM** (`work/yh-s2-19`; docs `75976f5` + migration `cbbbf4a` + kod `d9ebdd5`; Alternatif A; **canlı DB YOK; push/PR YOK**). Production DDL uygulaması **S2.19B**, canlı smoke **S2.19C**, Evidence Gate **S2.20+** (kapsam dışı, otomatik açılmaz). "Tam güvenli canlı retrieval" B/C öncesi ilan edilmez. ROADMAP'te **S2.06 yoktur**.

### Sprint 3 — UI (Hızlı Tarama) ⬜
Ana modül ekranı · sonuç kartı · derece görsel dili · "Neden?" · modül filtresi · a11y · responsive.

### Sprint 4 — Semantic ⬜
`yh_embeddings` · embedding backfill · pgvector KNN · RRF füzyon · fallback (additif).

### Sprint 5 — PII ⬜
PII tablo/indexer · client-scope retrieval · `pii_safe` C-builder · audit · RTBF · cross-client harness.

### Sprint 6 — Derin Analiz ⬜
`ConceptExtractor` adapter (AI yalnız anlama) · zorunlu JSON schema + doğrulayıcı · injection red-team · cache/rate-limit/circuit-breaker.

### Sprint 7 — Admin + Ops ⬜
Admin health paneli · reconcile · rebuild · maliyet raporu · flag yönetimi · alarmlar.

### Sprint 8 — Test + Deploy ⬜
Golden set tam koşum · performans/latency · UX/a11y · feature-flag kademeli rollout · canlı smoke.

---

## 3. Genel Değişmezler (Yaşam Hafızası)

Tüm sprintler boyunca korunur (kaynak: `00-overview.md`, `10-roadmap.md`):

- **INV-1** — Kanıtsız aday görünmez ("Kanıt yoksa sonuç yok").
- **INV-2** — "Neden?" yalnız Evidence kaydından, deterministik şablonla (AI yok).
- **INV-TENANT / INV-PII** — Tenant/PII izolasyonu her sorguda.
- **Additivite** — Semantic/AI additiftir; yokluğunda Hızlı Tarama tek başına çalışır.
- **Anayasa** — 10 madde + Kanıt Kuralı; çelişkide madde kazanır.

---

## 4. Dokümantasyon Altyapısı (docs/ai)

| İş | Durum |
|---|:--:|
| `CLAUDE_PROTOCOL.md` (çalışma protokolü) | ✅ |
| `PROJECT_STATUS.md` (proje durumu) | 🟡 (yaşayan) |
| `CURRENT_TASK.md` (aktif görev) | 🟡 (yaşayan) |
| `ARCHITECTURE_DECISIONS.md` (mimari kararlar) | 🟡 (yaşayan) |
| `CHANGELOG_AI.md` (karar günlüğü) | 🟡 (yaşayan) |
| `ROADMAP.md` (bu dosya) | 🟡 (yaşayan) |
