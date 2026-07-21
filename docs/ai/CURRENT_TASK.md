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

**Son güncelleme:** 2026-07-21 (S2.19A AÇILIŞ — kod fazı başlıyor; production DDL/backfill/smoke S2.19B/C)

---

## Durum

**S2.19A AÇILDI — Retrieval Executor + Supabase Adapter + ts_rank RPC (kod fazı).**
S2.18 `RetrievalQueryDescriptor`'ı gerçek DB'ye bağlayan **impure execution katmanı**. Mimari:
**Alternatif A** (descriptor → PostgreSQL RPC → `Candidate[]`; weighted ranking DB'de; visibility +
stone exclusion **ORDER BY/LIMIT'ten ÖNCE**; `evaluateVisibility` post-fetch savunma).

**Fazlı teslim (kilitli):**
- **S2.19A (bu görev):** RPC migration dosyası (Dashboard-uygulanır) + `retrievalExecutor.ts` +
  `supabaseRetrievalAdapter.ts` + mock harness. **Canlı DB YOK.**
- **S2.19B (sonraki, ayrı onay):** production Dashboard DDL uygulaması + salt-okunur doğrulama SQL.
- **S2.19C (sonraki, ayrı onay):** canlı smoke + INV harness.

**Önceki durum (kayda alındı):** S2.18 (Retrieval Query Descriptor) **main/production'a MERGE
EDİLDİ** — **PR #15**, merge commit **`89815ef`** (kod `ab1d5f5`). `origin/main` sonrasında **PR #16**
(`2c1d728`, aromaterapi bilgi bankası; YH-dışı drift) ilerledi. **S2.19 worktree tabanı = `2c1d728`**
(güncel origin/main), branch `work/yh-s2-19`.

---

## Görev

Yaşam Hafızası™ **Sprint 2 / S2.19A — Retrieval Execution (Candidate Adapter)**. S2.18
`RetrievalQueryDescriptor` (kind=`query`) çıktısını tüketip, `yasam_hafizasi_index` üzerinde
**gerçek DB execution** ile §9 görünürlük + tsquery eşleşme + ağırlıklı ts_rank + LIMIT uygulayıp
**`Candidate[]`** üreten impure adapter + bunu mümkün kılan PostgreSQL RPC.

**Temel:** S2.18 (`retrievalQuery.ts`) **main'de** (PR #15, `89815ef`). S2.19 bunun üstüne inşa
edilir; S2.18/S2.17/S2.13 **değişmez** (yalnız import + tüketim).

## Amaç

Faz-2 boru hattının **[3] adımının impure yarısını** tamamlamak: descriptor → RPC → `Candidate[]`.
Evidence Gate **[4] downstream** (`Candidate[]` tüketir), **S2.20 kapsamı**.

## Kapsam (S2.19A — kod)

1. **RPC migration** `20260724000000_yh_search_candidates_rpc.sql` (Dashboard-uygulanır; idempotent):
   `public.yh_search_candidates(p_tsquery text, p_session_tenant uuid, p_allow_shared boolean,
   p_weights float4[], p_limit integer) RETURNS TABLE(...16 kolon...)`; plpgsql; STABLE; SECURITY
   INVOKER; pinned search_path; §9 WHERE (tenant/shared + is_client_pii=false + demo hariç + stone
   NOT EXISTS) **ranking/LIMIT'ten önce**; weighted `ts_rank(p_weights, search_tsv, to_tsquery)`;
   tie-breaker `ts_rank DESC, source_updated_at DESC NULLS LAST, id ASC`; REVOKE PUBLIC/anon/auth +
   GRANT service_role.
2. **`retrievalExecutor.ts`** (saf): `RetrievalExecutionResult` union + RPC satır tipi + saf
   `mapRowToCandidate` (kritik alan bozuk → satır düş; koleksiyon bozuk → boş) + `Candidate →
   VisibilityCandidate` + mevcut `evaluateVisibility` savunma geçişi (yeniden yazılmaz).
3. **`supabaseRetrievalAdapter.ts`** (impure): dar `RetrievalDbClient`; `getServerDb` (service_role);
   `createSupabaseRetrievalExecutor` + `createSupabaseStoneExclusionPort`; weights → `[A,B,C,D]`;
   limit → descriptor'dan; ham DB hata metni **sızmaz** → fail-closed `{kind:'error'}`.
4. **`yh-retrieval-executor-harness.ts`** (mock DB client).

## Son güvenlik kararı (S2.19A, kilitli)

- **SECURITY INVOKER:** service_role zaten RLS bypass → DEFINER gereksiz + ayrıcalık-yükseltme riski
  taşır. INVOKER + `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` +
  pinned `search_path` + şema-nitelikli adlar → yanlış çağrıda fail-closed, escalation yok.
- **p_weights fail-loud (sessiz varsayılan YOK):** descriptor S2.18 üretir → geçersiz weights =
  sözleşme hatası. NULL / `array_length != 4` / NULL eleman / negatif / non-finite → `RAISE
  EXCEPTION`; adapter ham mesajı sızdırmadan `{kind:'error', code:'retrieval-execution-failed'}`.
- **p_limit:** iş değeri değil DoS-korkuluğu → clamp (fail-safe); iş limiti 150 descriptor'dan.

## Kapsam DIŞI (S2.19A DEĞİL)

- Production Dashboard DDL uygulaması / backfill / canlı retrieval → **S2.19B/C**.
- **[4] Kanıt Kapısı (Evidence Gate)** — downstream, `Candidate[]` tüketir → **S2.20**.
- [5] derece · [6] "Neden?" · Retrieval Pipeline · module facet · UI · semantic · PII indeksi · AI.
- ts_rank'in TS'te hesaplanması (DB'de kalır); SQL string interpolation; dynamic SQL.

## Dokunulmayacak Dosyalar

- `retrievalQuery.ts` (S2.18), `tsQueryPlan.ts` (S2.17), `visibilityScope.ts` (S2.13 — yalnız import),
  `normalize.ts`/`conceptSet.ts`/`dictionaryExpansion.ts`, `config.ts`, `types.ts`, `flags.ts`,
  `indexer/*` (write-side), mevcut migration'lar, diğer tüm modüller.

## Değişmezler (INV)

- **INV-TENANT:** service_role RLS bypass → WHERE tek tenant sınırı; §9 WHERE + post-fetch
  `evaluateVisibility` savunma. Cross-tenant/PII/demo/stone **LIMIT'ten önce** dışlanır.
- **INV-FAIL-CLOSED:** beklenen DB/RPC hatası kontrollü `{kind:'error'}`; blanket try/catch YOK;
  bozuk satır düşer (görünmez), sorgu çökmez; noop descriptor → DB çağrısı YOK.
- **INV-SINGLE-SOURCE:** weights/limit descriptor'dan (config tek kaynak); SQL'de ikinci sabit YOK.

## Doğrulama (S2.19A)

- Yeni mock harness (≥26 kontrol): noop→DB-çağrısı-yok · query→RPC adı/param (tsquery/tenant/
  allowShared/weights=[A,B,C,D]/limit) · RPC-hata→fail-closed · ham-mesaj-sızmaz · bozuk-satır-düş ·
  cross-tenant/shared(±allowShared)/PII/demo/stone dışlama · stone-port-hata→fail-closed ·
  diğer-modülde-stone-çağrılmaz · evidence/topic/relation/tsRank mapping · determinizm · SQL-yok.
- Regresyon: S2.13 **49** · S2.14 **83** · S2.15 **42** · S2.16 **42** · S2.17 **57** · S2.18 **52**.
- `tsc --noEmit` · hedefli ESLint · `git diff --check` · yasaklı-kapsam grep.

## Commit (path-scoped, ayrı; `git add -A` YASAK)

1. `docs(ai): open S2.19 retrieval executor` → yalnız `docs/ai/`
2. `feat(yasam-hafizasi): add S2.19 retrieval RPC` → yalnız `supabase/migrations/2026…_yh_search_candidates_rpc.sql`
3. `feat(yasam-hafizasi): add S2.19 retrieval executor and adapter` → yalnız 2 lib + 1 harness
4. `docs(ai): close S2.19 retrieval executor` → yalnız `docs/ai/`

## Push / Production

- **Bu görevde push/PR/main-merge YOK.** Dashboard DDL **S2.19B'de** kullanıcıya verilir. **"Tam
  güvenli canlı retrieval" S2.19B/C tamamlanmadan İLAN EDİLMEZ.**

## Sonuç

- *(S2.19A açıldı — kod fazı. RPC/adapter/executor/harness yazılacak; canlı DB yok. Onaylandı:
  Alternatif A + INVOKER + p_weights fail-loud. Sonraki: docs açılış → migration → kod → docs kapanış.)*
