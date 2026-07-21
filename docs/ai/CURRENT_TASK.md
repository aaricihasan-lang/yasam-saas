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

**Son güncelleme:** 2026-07-22 (S2.19-BF / BF-0 AÇILIŞ — kaynak PII sınıflandırma guard'ı)

---

## Durum

**S2.19-BF / BF-0 AÇILDI — İndeks Kaynağı PII Sınıflandırması + Guard.** Production backfill
öncesi zorunlu hazırlık: 17 indeks kaynağının **PII sınıflandırması** + yalnız `safe-non-pii &&
enabled` kaynağın indekslenmesine izin veren **fail-closed guard**. Backfill driver / dry-run /
write / S2.19C **bu kapsamda DEĞİL.**

**Önceki durum (kayda alındı):** S2.19A (Retrieval Executor + Adapter + ts_rank RPC) **main'e MERGE
EDİLDİ** (PR #17, merge `0a1348d`; kod `d9ebdd5`). **S2.19B** production'da: RPC `yh_search_candidates`
Dashboard'dan uygulandı + salt-okunur doğrulama **PASS** (fonksiyon/INVOKER/STABLE/service_role-only/
trigger/GIN teyitli). **`yasam_hafizasi_index` BOŞ (backfill yok)** → S2.19C canlı smoke'a
geçilemedi; sıradaki gerçek faz **S2.19-BF**. Worktree tabanı = güncel origin/main `f67afb5`,
branch `work/yh-bf0`.

---

## Görev

Yaşam Hafızası™ **Sprint 2 / S2.19-BF / BF-0 — Kaynak PII Sınıflandırma Guard'ı**. `YH_INDEX_SOURCES`
registry'sindeki 17 kaynağa **zorunlu `classification` alanı** ekleyip, indekslemeyi (dry-run + write)
**yalnız `safe-non-pii && enabled=true`** kaynaklarla sınırlayan saf, fail-closed guard.

## Amaç

Backfill'in **INV-PII**'yi ihlal etmesini yapısal olarak imkânsız kılmak: danışan/PII-riskli veya
sınıflandırılmamış kaynaklar ana PII-DIŞI index'e (`CHECK(is_client_pii=false)`) **zorla yazılamaz.**

## Nihai sınıflandırma (kullanıcı onaylı)

**safe-non-pii (15):** refleksoloji:protocols · sifa_rehberi:guides · sifa_rehberi:guide-sections ·
biyoenerji:subconscious-causes · biyoenerji:symbols · biyoenerji:chakras · biyoenerji:imaginations ·
dogaltas:stones · dogaltas:minerals · dogaltas:knowledge · dogaltas:combinations · aromaterapi:oils ·
aromaterapi:reference-sheets · aromaterapi:reference-rows · aromaterapi:blends
**pii (1):** refleksoloji:notes (config-flagged; serbest-metin seans notu)
**unclassified (1):** kisisel_arsiv:archives (serbest-form kişisel; F5'e ertelenecek)
**deferred (0):** registry'de yok (union'da korunur). Registry-dışı `bioenergy_sessions` vb. **eklenmez.**

> Kanıt: 17 kaynağın **hiçbirinde `client_id`/danışan FK yok**; PII riski yalnız serbest-metin.
> refleksoloji:notes + personal_archives serbest-form → fail-closed reddedilir.

## INV-PII (anayasal — DEĞİŞMEZ)

- `public.yasam_hafizasi_index` yalnız **PII-DIŞI** içindir; `CHECK(is_client_pii=false)` **değişmez.**
- pii/unclassified/deferred/disabled kaynak **hiçbir koşulda** (dry-run VEYA write) indekslenmez.
- İzin **yalnız** `classification==='safe-non-pii' && enabled===true` → aksi **fail-closed reddedilir**.
- enabled ile classification **bağımsız**; enabled=true classification'ı geçersiz kılamaz.

## Kapsam (BF-0 — kod)

1. `sources.ts`: `SourceClassification` union + `SourceConfig`'e **zorunlu `classification`** + 17 girişe
   nihai değer (varsayılan YOK, cast YOK, optional YOK).
2. `sourceGuard.ts` (yeni, saf): `enabled!==true`→red · `classification!=='safe-non-pii'`→red · yalnız
   ikisi de → kabul; ayrıştırılmış sonuç (indexable/disabled/pii/unclassified/deferred). DB/env/side-effect YOK.
3. `adminIndexRequest.ts`: `validateAdminIndexRequest`'te guard; bilinen-ama-bloklu → internal
   `source-not-indexable`, HTTP **403**, response `{ok:false, error:{code:'source-not-indexable'}}`
   (classification sızmaz). `unknown-source` (400) korunur.
4. `indexSourcePage.ts`: başlangıçta **son savunma** — reader/writer'dan ÖNCE non-indexable reddi.
5. `scripts/yh-source-classification-guard-harness.ts` (yeni; gerçek API/DB YOK).

## Kapsam DIŞI (BF-0 DEĞİL)

- Backfill driver (BF-1) · dry-run/write/backfill çalıştırma · S2.19C canlı smoke.
- Retrieval katmanı (S2.13–S2.19: descriptor/executor/RPC/visibilityScope/Candidate/tsQueryPlan) — dokunulmaz.
- `yasam_hafizasi_index` migration/CHECK · production schema/SQL/API.

## Dokunulmayacak (değişmezlik — git ile kanıtlanacak)

`retrievalQuery.ts` · `retrievalExecutor.ts` · `supabaseRetrievalAdapter.ts` ·
`20260724…_yh_search_candidates_rpc.sql` · `visibilityScope.ts` · `tsQueryPlan.ts` · `types.ts` ·
`config.ts` · index migration'ları · demo tenant guard · adapter read/write/cursor sözleşmeleri.

## Guard katmanları (savunma derinliği; en küçük güvenli kapsam)

1. **Compile-time:** `classification` zorunlu alan → sınıflandırmasız kaynak eklenemez.
2. **Request validation (birincil runtime):** dry-run + write aynı chokepoint'ten geçer.
3. **indexSourcePage başlangıcı (son savunma):** doğrudan çağrıya karşı.

## Test planı (harness ≥28 + regresyon)

safe+enabled kabul · safe+disabled red · pii±enabled red · unclassified red · deferred red · unknown
red · dry-run/write pii+unclassified red · non-indexable'da reader/writer çağrılmaz · pilot
aromaterapi:oils kabul · sınıf sayıları 15/1/1/0 · 17 kaynak · her kaynak classification taşır · demo
guard regresyonu · safe kaynak dry-run/write yolu değişmez · classification response'a sızmaz.
Regresyon: mevcut indexer + S2.13–S2.19 harness'leri + tsc + ESLint + diff-check.

## Commit (path-scoped, ayrı; `git add -A` YASAK)

1. `docs(ai): open BF-0 source classification guard` → yalnız `docs/ai/`
2. `feat(yasam-hafizasi): guard index sources by PII classification` → sources.ts + sourceGuard.ts +
   adminIndexRequest.ts + indexSourcePage.ts + harness (+ gerekirse route minimal hata-eşleme)
3. `docs(ai): close BF-0 source classification guard` → yalnız `docs/ai/`

## Pilot & Driver (kayıt — BF-0 DEĞİL)

- **BF-1 pilot kaynağı:** `aromaterapi:oils` (en zengin çok-alan içerik; safe-non-pii; shared destekli).
- **BF-1 driver:** local Node → mevcut admin route (service_role sunucuda kalır; cursor loop; dry-run
  zorunlu; resumable). **BF-0'da yazılmaz.**

## Push / Production

- **Bu görevde push/PR/main-merge YOK · production/SQL/API/backfill YOK · S2.19C YOK.**

## Sonuç

- *(BF-0 açıldı — kaynak PII sınıflandırma guard'ı. Sıradaki: sources.ts classification → sourceGuard →
  entegrasyon → harness → docs kapanış. Kod/commit onaylı; production'a dokunulmaz.)*
