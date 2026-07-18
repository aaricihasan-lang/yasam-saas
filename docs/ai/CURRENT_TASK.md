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

**Son güncelleme:** 2026-07-19

---

## Durum

**Aktif görev: S2.13 — Retrieval Görünürlük Kararı — AÇILDI** (tasarım aşaması;
**kod henüz yok**). İzole worktree `work/yh-s2-13` (taban `origin/main` = `555030a`).
Bu turda yalnız docs uzlaştırma/açılış yapıldı. Önceki blok **S2.08–S2.12 tamamlandı
ve main'e merge edildi** (PR #3, merge commit `555030a`); aşağıda özetlenmiştir. Kod,
tasarım kararları (K1–K5, aşağıda kilitli) + kullanıcı onayı sonrası yazılacaktır.

---

## Tamamlanan Blok — S2.08–S2.12 (İndeksleyici write-side) ✅ (main'de)

Kaynak satırlarını tenant çözümü → alan çıkarımı → birim builder zincirinden geçiren
**indeksleyici write-side** tamamlandı ve **PR #3** ile main'e merge edildi.

**Git akışı:** 7 kaynak commit (`8cf503d` docs → `dd7a022` S2.08 → `172aa91` S2.09
→ `b8ffc67` S2.10 → `e171fa1` S2.11 → `2dc44d3` S2.12A → `93ae185` S2.12C) →
entegrasyon merge `fa9adbd` (`work/yh-s2-integration`) → **PR #3** (`work/yh-s2-integration`
→ `main`) **"Create a merge commit" ile merge edildi** → main `555030a` (ebeveynler
`0a3e8a4` + `fa9adbd`). **20 YH dosyası, +3580/−67; package/lock/migration/SQL yok.**

**Teslim edilen aşamalar:**
- **S2.08** — `runIndexUnit` + `makeParentTenantLookup` (`runIndexUnit.ts`, `parentTenantLookup.ts`): tenant çözümü → alan çıkarımı → birim builder orkestrasyonu; join-mode tenant için `ParentTenantLookup` **enjekte** edilir (çekirdek saf).
- **S2.09** — `runSource` (`runSource.ts`, `indexSourcePage.ts`): keyset cursor sayfalama, join parent preload, satır-bazlı hata izolasyonu.
- **S2.10** — `indexWritePlan` + `supabaseIndexAdapters` (`indexWritePlan.ts`, `supabaseIndexAdapters.ts`): `search_text` üretimi + camel→snake DB eşleme + hash-aware insert/update/unchanged plan; gerçek reader/parent/writer adapter'ları (fail-fast, chunk 200, `onConflict` upsert).
- **S2.11** — Admin index-page route (`adminIndexRequest.ts`, `app/api/admin/yasam-hafizasi/index-page/route.ts`): admin auth fail-closed + fail-closed demo kontrolü + dry-run/write ayrımı.
- **S2.12A/S2.12C** — Index smoke aracı (`indexSmokePlan.ts`, `scripts/yh-index-smoke.ts`): plan-only + **exact-owned-record dry-run** (pk+tenant tek sorgu; page/cursor/write/delete yok; allowlist `biyoenerji:symbols`).

**Kabul kriterleri — GEÇTİ (merge sonrası entegrasyon worktree'sinde doğrulandı):**
- 8 harness → **EXIT 0** (S2.05 · S2.07 · S2.08 · S2.09 42 · S2.10 plan 23 · S2.10 adapter 37 · S2.11 65 · **S2.12 smoke 41/41**).
- Tüm-proje `tsc --noEmit` → **EXIT 0**.
- ESLint (YH kapsamı) → **0 error** (1 eskiden-var warning: `yh-run-index-unit-harness.ts` kullanılmayan `ParentTenantLookup` type import'u; merge regresyonu değil).
- Production build: derleme + TypeScript aşamaları **geçti**; `Collecting page data` aşaması **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil, credential sağlanmadı.
- Güvenlik grep'leri: exact-owned-record pk+tenant tek sorgu; smoke'ta insert/update/upsert/delete yok; admin auth + demo fail-closed; browser-direct Supabase yok.

> Önceki tamamlanan görevler: **S2.07** (`2b19743`, PR #2) ve **S2.05** (`cd9c77c`, PR #1) — ayrıntı `CHANGELOG_AI.md`'de.

---

## Aktif Görev — S2.13 (Retrieval Görünürlük Kararı) — AÇILDI (kod yok)

**Başlık:** S2.13 — Retrieval Görünürlük Kararı (session + shared birleşik görünürlük filtresi).

**Tek amaç:** Retrieval adaylarının yalnız şu görünürlük kurallarına göre kapsamlanması
(kaynak: `docs/yasam-hafizasi/04-phase-2-fast-search.md` §9 "Tenant / Shared Değişmezi"):
- `tenant_id = session tenant`
- **VEYA** `tenant_id IS NULL` **VE** `allowShared = true` (isteğe bağlı shared referans)
- `is_client_pii = false` (PII fiziksel ayrı — INV-PII)
- demo tenant/source dışlama
- tenant'a özgü **stone exclusions** dışlama
- tenant yalnız **server-side session/auth** bağlamından; body/query'den asla
- boş/geçersiz tenant → **fail-closed** (throw)
- aynı girdi → **deterministik** aynı sonuç

**Mimari (kilitli kararlar):**
- **Saf** ve **deterministik** — DB'siz.
- **Dependency injection** — stone exclusions saf enjekte port (config sabiti DEĞİL).
- **Fail-closed** — tenant zorunlu; shared yalnız açıkça izinliyse.
- **Harness** ile doğrulanacak (izole, DB'siz).

**Planlanan yeni dosyalar:**
- `lib/yasam-hafizasi/search/visibilityScope.ts`
- `scripts/yh-visibility-scope-harness.ts`

**Muhtemel yeniden kullanım (mümkün olduğunca değiştirmeden):**
- `lib/yasam-hafizasi/tenantScope.ts` (`TenantScope`, `buildTenantScope`, `applyMainIndexScope` — session+shared+PII yüklemi çekirdeği zaten burada).

**Kapsam dışı (S2.14+ / sonraki S2.x):**
- `search_tsv` sorgusu · DB adapter · gerçek retrieval query · ranking · Kanıt Kapısı
  · derece · "Neden gösterildi?" · production write · SQL/migration · Admin UI.

**Durum:** Yalnız docs açılışı + karar kilidi yapıldı; **kod bu turda yazılmadı**.
Kod, kullanıcı onayı sonrası aynı çekirdek disipliniyle (saf + DI + fail-closed +
harness) yazılacaktır.

## Bekleyen Onaylar

- **S2.13:** kod öncesi kullanıcı onayı (worktree hazır, kararlar kilitli).

## Sonuç

- S2.05 (`cd9c77c`), S2.07 (`2b19743`), **S2.08–S2.12 (`555030a`, PR #3)** main'de;
  tümü doğrulandı. S2.13 açıldı (docs); kod, onay sonrası yazılacaktır.
