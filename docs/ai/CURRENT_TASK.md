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

**Son güncelleme:** 2026-07-22 (S2.19-BF / BF-1A — pilot kaynak `dogaltas:knowledge`'e değiştirildi; production çağrısı YOK)

---

## Durum

**S2.19-BF / BF-1A KOD-TAM — `dogaltas:knowledge` Dry-Run Pilot Driver.** Yalnız **dry-run** yapabilen,
fail-closed, cursor-bazlı, resumable local Node driver + mock harness. **Bu fazda gerçek production API
çağrısı / dry-run / SQL / write / backfill YAPILMADI.**

**⚠️ PİLOT KAYNAK KARARI (değişti):** Eski `aromaterapi:oils` → **YENİ `dogaltas:knowledge`**. Gerekçe:
Aromaterapi modülü başka bir akışta **aktif geliştirme** altında (hareketli şema/içerik); pilot **stabil**,
PII-dışı, bilgi-makalesi kaynağa taşındı. **Yaşam Hafızası kapsamı değişmedi; aromaterapi verisine
dokunulmadı; production dry-run yapılmadı.**

**Commit zinciri (`work/yh-bf1a`):** `8a9eb2c` (BF-0 merge) → `40a1a97` (docs açılış) → `ba43d4a`
(`feat: add oils dry-run pilot driver` — ilk driver) → `595526b` (docs kapanış) → **`40d0069`**
(origin/main merge — YH-dışı aromaterapi PR#21) → **`c706ea2`** (`feat: switch dry-run pilot to stone
knowledge` — rename) → **`75391a7`** (`feat: set stone knowledge pilot source and checkpoint` — içerik) →
doküman düzeltmesi (bu adım). **Push/PR/main-merge YOK.**
> Not: `reset/rebase/amend` yasak olduğundan geçmiş commit'ler yeniden yazılmadı; pilot değişikliği
> yeni commit'lerle uygulandı. `ba43d4a` tarihsel olarak "oils" adını taşır (geçmiş kayıt; içerik artık
> `dogaltas:knowledge`).

**Doğrulama (GEÇTİ):** pilot harness **78/78** (gerçek fetch=0 tripwire; `aromaterapi:oils` üretilemez
testleri dahil) · BF-0 guard **39** · admin-route **65** · run-source **42** · adapters **37** ·
retrieval-executor **49** · visibility **49** · `tsc --noEmit` PASS · ESLint 0/0 · `git diff --check` PASS.
Değişmezlik git-kanıtlı: route/adminGuard/adminIndexRequest/indexSourcePage/sources/sourceGuard/RPC/
package.json/.gitignore **UNCHANGED**. Secret taraması: gerçek URL/uuid/token/bearer/.env YOK.

## `dogaltas:knowledge` sözleşmesi (gerçek repo — kanıtlı)

`sources.ts`: sourceKey `dogaltas:knowledge` · table `stone_knowledge_articles` · pk `id` (uuid) · tenant
`column`/`tenant_id` `allowSharedNull:true` (NULL=paylaşımlı kütüphane) · active `is_active` · updated
`updated_at` · classification **`safe-non-pii`** · route `resolveYhSourceConfig` kabul eder ·
**client_id/PII kolonu YOK**. Response sözleşmesi (SafePageSummary) **source-agnostik → değişmedi**.

## Driver dosyaları

- `scripts/yh-dogaltas-knowledge-dryrun-driver.ts` (dry-run-only)
- `scripts/yh-dogaltas-knowledge-dryrun-driver-harness.ts` (mock; gerçek ağ YOK)
- Checkpoint: `os.tmpdir()/yasam-hafizasi/yh-dogaltas-knowledge-dryrun-state.json` (repo-dışı; state.sourceKey=`dogaltas:knowledge`)

## Kilitli kararlar (DEĞİŞMEDİ)

- `SOURCE_KEY='dogaltas:knowledge'` · `MODE='dry-run'` · `LIMIT=100` · `MAX_PAGES=50` · `MAX_ROWS=5000` ·
  `PAGE_DELAY_MS=500` · `REQUEST_TIMEOUT_MS=120000` (compile-time; CLI/env/config ile değişmez).
- `'write'` request mode kod yolu **yok** (BF-2 ayrı gate). sourceKey CLI/env ile seçilemez.
- Auth env-only (`YH_BASE_URL`/`YH_ADMIN_ID`/`YH_SESSION_TOKEN`); loglanmaz/state'e/body'ye yazılmaz.
- CLI yalnız `--execute`/`--resume`; argümansız/`--resume`-tek → no-op (ağ çağrısı YOK); `redirect:'error'`.
- Response exact SafePageSummary (**`plannedInsert/update/unchanged` yok**); cursor tekrar/geri/null →
  fail-closed; retry YOK.

## Kapsam DIŞI (BF-1A DEĞİL)

Gerçek production API/dry-run → **BF-1C** · ön kontrol SQL → **BF-1B** · write → **BF-2 (ayrı hard gate)** ·
S2.19C. Production route/adapter/migration/BF-0 guard/retrieval pipeline/package.json/.gitignore değişikliği.

## Commit (path-scoped)

Pilot değişikliği: `feat(yasam-hafizasi): switch dry-run pilot to stone knowledge` (`c706ea2`, rename) +
`feat(yasam-hafizasi): set stone knowledge pilot source and checkpoint` (`75391a7`, içerik) →
`docs(ai): record stone knowledge pilot decision` (bu adım; yalnız `docs/ai/`).

## Push / Production

- **Bu görevde push/PR/main-merge YOK · production/API/SQL/dry-run/write/backfill YOK · BF-1B/1C/BF-2/
  S2.19C YOK.** Sıradaki gated adım: BF-1B production ön kontrol SQL (`stone_knowledge_articles`).

## Sonuç

- *(BF-1A pilot kaynağı `dogaltas:knowledge`'e taşındı (stabil, PII-dışı). Driver+harness güncel (78/78);
  güvenlik sözleşmesi değişmedi; eski oils dosyaları kaldırıldı. Route/adapter/migration/BF-0 guard
  değişmedi. **Gerçek API/SQL/dry-run/write YOK; push/PR YOK.** Sıradaki: BF-1B ön kontrol SQL — ayrı onay.)*
