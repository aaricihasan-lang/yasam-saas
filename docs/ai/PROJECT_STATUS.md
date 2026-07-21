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

**Son güncelleme:** 2026-07-22 (S2.19-BF/BF-0 KOD-TAM — sınıflandırma guard'ı commit; production/backfill YOK)

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

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.05 + S2.07 + **S2.08–S2.12 (PR #3, `555030a`)** + **S2.13 (PR #4, `4c672e9`)** + **S2.14 (PR #6)** + **S2.15 (PR #8, `f56ec60`)** + **S2.16 (PR #11, `dc94b98`)** + **S2.17 (search_tsv tsquery Plan): main'e MERGE EDİLDİ — PR #13, merge `7344b6d`** origin/main'de. `origin/main` sonrasında **`9bbe5da`**'ya ilerledi (yalnız Danışan Yolculuğu/clients mobil+Word UX; **YH-dışı drift**). **S2.18 (Retrieval Query Descriptor / EX-D): main'e MERGE EDİLDİ — PR #15, merge `89815ef`** (kod `ab1d5f5`). `origin/main` sonrasında **PR #16 `2c1d728`** (aromaterapi bilgi bankası; YH-dışı drift). **AKTİF: S2.19A — Retrieval Executor + Supabase Adapter + ts_rank RPC (kod fazı)** açıldı — `work/yh-s2-19` @ `2c1d728`. Fazlı: **S2.19A** kod+migration+mock harness (canlı DB YOK) → **S2.19B** production Dashboard DDL+doğrulama → **S2.19C** canlı smoke+INV. Kilitli backlog (S2.20+): Evidence Gate → Ranking → Retrieval Pipeline → Search UI.

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.19A — Retrieval Executor + Supabase Adapter + ts_rank RPC (kod fazı)** (Alternatif A: S2.18 descriptor → PostgreSQL RPC `public.yh_search_candidates` → `Candidate[]`; weighted ts_rank DB'de; §9 görünürlük + stone `NOT EXISTS` **ORDER BY/LIMIT'ten ÖNCE**; `evaluateVisibility` post-fetch savunma) — **KOD TAMAMLANDI ve commit edildi** (`work/yh-s2-19` @ `2c1d728`; docs açılış `75976f5` + migration `cbbbf4a` + kod `d9ebdd5`; **push/PR YOK**). **⚠️ production DDL UYGULANMADI · backfill TEYİT EDİLMEDİ · canlı retrieval DOĞRULANMADI · "tam güvenli canlı retrieval" İLAN EDİLMEDİ — S2.19B/C açık.** Teslim: `supabase/migrations/20260724000000_yh_search_candidates_rpc.sql` (Dashboard-uygulanır; plpgsql/STABLE/**SECURITY INVOKER**/pinned search_path; §9 WHERE görünürlük+stone önce; weighted `ts_rank([A,B,C,D]→{D,C,B,A})`; tie-breaker `ts_rank DESC, source_updated_at DESC NULLS LAST, id ASC`; **p_weights fail-loud** RAISE; p_limit DoS-clamp; REVOKE PUBLIC/anon/auth + GRANT service_role) + `lib/yasam-hafizasi/search/retrievalExecutor.ts` (saf: `RetrievalExecutionResult` union + saf `mapRowToCandidate`/`buildVisibilityCandidate` + `executeRetrieval` orkestrasyon; noop→DB-çağrısı-yok; kritik-alan-bozuk→satır-düş; koleksiyon-bozuk→boş; `evaluateVisibility` çağrısı; **blanket try/catch YOK**; ranking TS'te YOK) + `lib/yasam-hafizasi/search/supabaseRetrievalAdapter.ts` (impure: dar `RetrievalDbClient`; `getServerDb` service_role; RPC+stone port fabrikaları; ham DB mesajı sızmaz; **any yok**) + `scripts/yh-retrieval-executor-harness.ts` (**mock DB**). Doğrulamalar: yeni harness **49/49 PASS**, S2.13 **49/49**, S2.14 **83/83**, S2.15 **42/42**, S2.16 **42/42**, S2.17 **57/57**, S2.18 **52/52**, `tsc --noEmit` **PASS**, hedefli ESLint **0 error/0 warning**, `git diff --check` **PASS**. Şema uzlaştırma kanıtlı: index 2 migration (ALTER yok, RLS service_role-only), `stone_exclusions(tenant_id text, stone_id uuid, PK)`; demo=`tenant_id=YH_DEMO_TENANT_ID`. **Kapsam dışı (S2.20+):** Evidence Gate · derece · "Neden?" · Retrieval Pipeline · UI · semantic · PII indeksi.
- Yaşam Hafızası **S2.18 — Saf Retrieval Query Descriptor / Execution Contract (EX-D)** (saf + deterministik + immutable + fail-closed + DB'siz; S2.17 `TsQueryPlan` + S2.13 `VisibilityContext` → typed execution descriptor) — **kod TAMAMLANDI ve commit edildi** (`work/yh-s2-18`; kod commit **`ab1d5f5`** `feat(yasam-hafizasi): add S2.18 retrieval query contract`; **henüz push/PR YOK, origin/main merge YOK, S2.19 başlamadı**). Teslim (yalnız 2 dosya): `lib/yasam-hafizasi/search/retrievalQuery.ts` (`buildRetrievalQuery(plan: TsQueryPlan, visibility: VisibilityContext): RetrievalQueryDescriptor`; discriminated union `kind:'noop'` (execution YASAK; reason `'empty-tsquery'|'invalid-visibility-context'`) | `kind:'query'` (config `simple` + column `search_tsv` + S2.17 tsquery birebir + S2.13 `VisibilityContext` taşınır + ranking intent `requiresWeightedTsRank`/`YH_TSV_WEIGHTS` frozen kopya/`direction:'desc'` + limit intent `YH_CANDIDATE_LIMIT=150`); açık type-guard fail-closed, **blanket try/catch YOK**; her katman `Object.freeze`; config referansı sızmaz) + `scripts/yh-retrieval-query-harness.ts`. **Nihai descriptor `invariantFilters`/`requireNonPii`/`excludeDemo`/SQL WHERE/fragment TAŞIMAZ** — açılış önerisi bilinçli uzlaştırıldı: visibility yeniden hesaplanmaz, yetkili aday kararı S2.13 `evaluateVisibility`'de kalır, WHERE/RPC materyalizasyonu S2.19. **Kapsam dışı (S2.19+):** gerçek DB/Supabase `.textSearch`/`.rpc` · ts_rank hesaplama · migration/DDL · Evidence Gate · derece · "Neden?" · module facet · UI. Doğrulamalar: yeni harness **52/52 PASS**, S2.13 regresyon **49/49**, S2.14 **83/83**, S2.15 **42/42**, S2.16 **42/42**, S2.17 **57/57**, `tsc --noEmit` **PASS**, hedefli ESLint **PASS**, `git diff --check` **PASS**. SQL/migration/package/lock yok. **S2.19 mimari zorunluluğu (yalnız dokümante — S2.18'de UYGULANMADI):** aday tavanı sırası görünürlük→PII/demo→tsv eşleşme→ts_rank→rank DESC→LIMIT 150→S2.13 savunma; "önce rank+LIMIT sonra ele" sırası **kabul edilmez** (görünmeyen kayıtlar top-150 slotunu kaplayıp eksik/yanlış top-N üretir).
- Yaşam Hafızası **S2.17 — search_tsv Query (tsquery Plan)** (saf + deterministik + immutable + fail-safe + DB'siz + yan-etkisiz; `Concept[]` → güvenli tsquery planı) — **main/production'a MERGE EDİLDİ** (**PR #13**, merge commit **`7344b6d`**; feature kod **`1ab8601`** `feat(yasam-hafizasi): add S2.17 search_tsv query plan`). `origin/main` sonrasında **`9bbe5da`**'ya ilerledi (YH-dışı DY/clients drift). Teslim: `lib/yasam-hafizasi/search/tsQueryPlan.ts` (`buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan` + `TsQueryClause`/`TsQueryPlan`; tek kelime → prefix `term:*`; çok kelime → exact phrase `(t1 <-> t2)`, **phrase-prefix YOK**; clause'lar `|` OR; config `simple`; kolon `search_tsv`; her lexeme `^[a-z0-9]+$` allowlist re-assert; geçersiz clause atlanır; serializer fragment dedup; boş → `clauses:[]`/`tsquery:""`/`isEmpty:true`; `Object.freeze`) + `scripts/yh-tsquery-plan-harness.ts`. **Kapsam dışı:** `candidateLimit`/`YH_CANDIDATE_LIMIT` · `ts_rank` · DB execution · Supabase/`textSearch`/RPC · tenant/visibility · Stone Exclusion · Evidence Gate · Ranking · Retrieval Pipeline · UI · migration. Doğrulamalar: S2.17 harness **57/57**, S2.16 regresyon **42/42**, S2.15 regresyon **42/42**, S2.14 regresyon **83/83**, `tsc --noEmit` **PASS**, hedefli ESLint **PASS**, `git diff --check` **PASS**, yasaklı kapsam grep temiz. SQL/migration/package/lock yok. Supabase kanıtı: `postgrest-js@2.105.3` `textSearch` `type` omit → `fts`=`to_tsquery`; `type:'tsquery'` literali YOK.
- Önceki aşama: Yaşam Hafızası **S2.16 — Dictionary Expansion (Sözlük / Eş-Anlam Genişletme)** (saf + deterministik + DB'siz + fail-safe; S2.15 query-origin çıktısını küratörlü snapshot ile additif synonym-origin `Concept`'lerle genişletir) **tamamlandı ve main'e merge edildi** (**PR #11**; kod commit `2192f74` `feat(yasam-hafizasi): add S2.16 dictionary expansion`; merge `dc94b98`; güncel `origin/main` = `dc94b98` bu kodu içerir). Teslim: `lib/yasam-hafizasi/search/dictionaryExpansion.ts` (`expandConcepts(base, normalizedText, entries): readonly Concept[]` + `DictionaryEntry { canonical, synonyms[] }`; `[query prefix]`+`[synonym suffix]`; dedup=term/query bastırır; yalnız `origin:"synonym"`; çok-kelime=bitişik alt-dizi; tek-sıçrama/transitif yok; `Object.freeze`; kavram tavanı yok) + `scripts/yh-dictionary-expansion-harness.ts`. Doğrulamalar (S2.16 kod turunda): yeni harness **42/42**, S2.15 regresyon **42/42**, S2.14 regresyon **83/83**, `tsc --noEmit` EXIT 0, hedefli ESLint 0/0, `git diff --check` temiz. SQL/migration/package/lock yok. *(S2.16 turunda ayrı "close" docs commit'i yazılmamıştı; bu S2.17 açılışı S2.16'yı tamamlanmış-main gerçeğiyle kayda alır.)*
- Önceki aşama: Yaşam Hafızası **S2.15 — Kavram Kümesi (Concept Set)** (saf + deterministik + DB'siz, yalnız query-origin `Concept[]`) **tamamlandı ve main'e merge edildi** (**PR #8**; kod commit `f56ec60` `feat(yasam-hafizasi): add S2.15 concept set`; merge `404841b`). Teslim: `lib/yasam-hafizasi/search/conceptSet.ts` (`buildConceptSet(input: unknown): readonly Concept[]` → `normalizeSearchText(input).tokens` → her benzersiz token `{ term, origin:"query" }`; dedup=term/ilk-sıra; sort yok; `canonical` omit; `Object.freeze`; fail-safe boş dizi) + `scripts/yh-concept-set-harness.ts`. Phrase/dictionary/synonym YOK (S2.16'ya bırakıldı). SQL/migration/package/lock yok. *(S2.15 turunda ayrı "close" docs commit'i yazılmamıştı; bu S2.16 açılışı S2.15'i tamamlanmış-main gerçeğiyle kayda alır. Harness pass sayısı bu oturumda yeniden koşulmadı.)*
- Önceki aşama: Yaşam Hafızası **S2.14 — Retrieval Türkçe Metin Normalizasyonu** (saf + deterministik + fail-safe + locale-bağımsız + mutasyonsuz normalize birimi) **tamamlandı ve main'e merge edildi** (**PR #6**; kod commit `dd29167`). Teslim: `lib/yasam-hafizasi/search/normalize.ts` (`normalizeSearchText` → `{ normalizedText, tokens }`; tam saf, hiç import yok) + `scripts/yh-normalize-harness.ts`. Türkçe fold I/İ/ı/i→i · ç→c · ğ→g · ö→o · ş→s · ü→u · â/î/û→a/i/u; NFD+combining-strip→generic lowercase; stop-list/stemmer/concept-set YOK. **Query–index simetrisi production Supabase salt-okunur SELECT ile doğrulandı** (`ışık→isik`, `İğne→igne`, `Göğüs→gogus`, `Bütün→butun`). Doğrulamalar: yeni harness **83/83**, 9 regresyon harness EXIT 0 (`yh-index-smoke` **41/41**, `visibility` **49/49**, `supabase-adapters` **37**), `tsc --noEmit` EXIT 0, hedefli ESLint **0 error/0 warning**, güvenlik grep temiz. SQL/migration/package/lock yok.
- Önceki aşama: Yaşam Hafızası **S2.13 — Retrieval Görünürlük Kararı** (saf + deterministik + DB'siz + DI + fail-closed görünürlük karar birimi) **tamamlandı ve main'e merge edildi** (**PR #4**, merge commit `4c672e9`, ebeveynler `c412334` + `608f576`; kod commit `e3b4e73`). Teslim: `lib/yasam-hafizasi/search/visibilityScope.ts` (`evaluateVisibility` + kapalı reason-code union) + `scripts/yh-visibility-scope-harness.ts`. Kurallar: tenant görünürlüğü · açık `allowShared` ile shared · PII dışlama · demo tenant/source dışlama · enjekte stone-exclusion port + port hatasında fail-closed. **Gerçek Supabase/DB implementasyonu YOK** (sonraki S2.x). Doğrulamalar: yeni harness **49/49**, 8 regresyon harness EXIT 0 (`yh-index-smoke` **41/41**), `tsc --noEmit` EXIT 0, hedefli ESLint **0 error/0 warning**, güvenlik grep'leri temiz. PR #4 net katkısı 6 YH dosyası (+751/−59); package/lock/migration/SQL yok.
- Önceki aşama: Yaşam Hafızası **S2.08–S2.12 — İndeksleyici write-side** (runner + source + write plan/adapter + admin route + smoke) **tamamlandı ve main'e merge edildi**. Git akışı: 7 kaynak commit (`8cf503d`→`93ae185`) → entegrasyon merge `fa9adbd` (`work/yh-s2-integration`) → **PR #3** (`work/yh-s2-integration` → `main`, "Create a merge commit") → main **`555030a`** (ebeveynler `0a3e8a4` + `fa9adbd`). **20 YH dosyası, +3580/−67; package/lock/migration/SQL yok; YH-dışı değişiklik yok.**
- **Aşamalar:** S2.08 `runIndexUnit`+`makeParentTenantLookup` (`dd7a022`) · S2.09 `runSource` (`172aa91`) · S2.10 `indexWritePlan`+`supabaseIndexAdapters` (`b8ffc67`) · S2.11 admin index-page route (`e171fa1`) · S2.12A index smoke (`2dc44d3`) · S2.12C exact-owned-record dry-run (`93ae185`).
- **Kabul kriterleri geçti (entegrasyon worktree'sinde doğrulandı):** 8 harness **EXIT 0** (**S2.12 smoke 41/41**); tüm-proje `tsc --noEmit` **EXIT 0**; ESLint YH kapsamı **0 error** (1 eskiden-var warning); güvenlik grep'leri temiz. Production build: derleme + TypeScript **geçti**, `Collecting page data` **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil.
- Önceki aşamalar: **S2.07** (`2b19743`, PR #2) · **S2.05** (`cd9c77c`, PR #1).

## Son Commit

- **`ab1d5f5`** (`work/yh-s2-18`, **push YOK**) — S2.18 kod `feat(yasam-hafizasi): add S2.18 retrieval query contract`; `retrievalQuery.ts` + harness. Ebeveyn `d00fe3d` (`docs(ai): open S2.18 retrieval query descriptor`), taban `9bbe5da`. Bu adımda ayrıca doküman kapanış commit'i (`docs(ai): close S2.18 retrieval query contract`, yalnız `docs/ai/`).
- **PR #13 merge** (`7344b6d`) — S2.17 (`1ab8601` `feat(yasam-hafizasi): add S2.17 search_tsv query plan`) → main. `tsQueryPlan.ts` + harness main'de. `origin/main` sonrasında **`9bbe5da`** (PR: DY/clients mobil+Word UX, YH-dışı).
- **PR #11 merge** (`dc94b98`) — S2.16 (`2192f74` `feat(yasam-hafizasi): add S2.16 dictionary expansion`) → main. Kod `dictionaryExpansion.ts` + harness main'de.
- Önceki: `404841b` — **PR #8 merge** (S2.15 → main); `dd29167` — **PR #6 merge** (S2.14 → main); `4c672e9` — **PR #4 merge** (S2.13 → main); `555030a` — **PR #3 merge** (S2.08–S2.12); `2b19743` — S2.07; `cd9c77c` — S2.05.

## Son Push

- **S2.17:** `work/yh-s2-17` push edildi; **PR #13 merge edildi** (`7344b6d`) → `origin/main`. tsquery Plan birimi main'de. (Sonraki drift: `origin/main` = `9bbe5da`, YH-dışı DY/clients.)
- **S2.16:** kod commit `2192f74` (+ docs açılış `45d8c07` + origin/main sync merge `f595bd1`) `origin/work/yh-s2-16`'ya push edildi; **PR #11 merge edildi** (`dc94b98`) → `origin/main`. Dictionary Expansion birimi main'de.
- **S2.15:** kod commit `f56ec60` `origin/work/yh-s2-15`'e push edildi; **PR #8 merge edildi** (`404841b`) → `origin/main`. Concept Set birimi main'de.
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

- **S2.19-BF / BF-0 — Kaynak PII Sınıflandırma Guard'ı: KOD-TAM** (`work/yh-bf0`; docs açılış `761bfd7` + kod `b69942f`; push/PR YOK). 17 kaynağa zorunlu `classification` (**safe-non-pii 15 / pii 1 / unclassified 1 / deferred 0**) + yalnız `safe-non-pii && enabled` indekslemeye izin veren fail-closed guard (dry-run + write; **pii=refleksoloji:notes, unclassified=kisisel_arsiv:archives** reddedilir). INV-PII: ana index CHECK değişmez. `sources.ts`(classification) + `sourceGuard.ts`(yeni) + `adminIndexRequest.ts`(403 `source-not-indexable`) + `indexSourcePage.ts`(son savunma) + harness (**39/39**). Guard harness + tüm indexer/retrieval regresyon + tsc/ESLint(0 error)/diff-check PASS; retrieval/migration/CHECK **değişmedi** (git-kanıtlı). **Backfill/dry-run/write/S2.19C DIŞI; production'a dokunulmadı.** Bkz. `CURRENT_TASK.md`.
- **Tamamlanan (production):** **S2.19A merge** (PR #17, `0a1348d`) + **S2.19B** RPC `yh_search_candidates` Dashboard'dan uygulandı + doğrulama PASS (INVOKER/STABLE/service_role-only/trigger/GIN). **`yasam_hafizasi_index` BOŞ** → S2.19C beklemede.
- **Onay bekleyen:** **BF-1** (pilot `aromaterapi:oils` + local Node driver → admin route) → **S2.19C** (canlı smoke). **Otomatik başlamaz.** Not: ROADMAP'te **S2.06 yoktur**.

## Bekleyen İşler

- Yaşam Hafızası **S2.18 push + PR** (onayla) → **S2.19** (otomatik açılmaz): gerçek DB Execution/Adapter (`.textSearch`/`.rpc`) + PostgreSQL weighted ts_rank **RPC/DDL** (Dashboard) + `YH_CANDIDATE_LIMIT` + gerçek Supabase dictionary/stone-exclusion adapter + **config/SQL drift çözümü** (RPC-param VEYA sync-harness) + **görünürlük→PII/demo→tsv→ts_rank→rank DESC→LIMIT 150→S2.13 savunma sırası** (bkz. `CURRENT_TASK.md`; LIMIT görünürlükten sonra) → **[4] Kanıt Kapısı (Evidence Gate)** → [5] derece → [6] "Neden?" → Retrieval Pipeline → INV harness. Her aşama ayrı salt-okunur analiz + kullanıcı onayıyla.
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
