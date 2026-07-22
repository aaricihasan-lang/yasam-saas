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

**Son güncelleme:** 2026-07-22 (S2.19-BF / BF-1B-FIX — global sentetik tenant guard; production çağrısı YOK)

---

## Durum

**S2.19-BF / BF-1B-FIX — GLOBAL SENTETİK TENANT GUARD (kod-tam, yerel commit).**
BF-1B production ön kontrolü kanıtladı: `stone_knowledge_articles`'taki **239 aktif satırın tamamı**
sentetik seed/import namespace'i **`ADMIN_LIBRARY_TENANT_ID`**'ye bağlı; bu kimlik **gerçek kullanıcı /
gerçek tenant DEĞİLDİR** ve `public.users`'ta satırı olmaması **tasarım gereğidir**.

**BAĞLAYICI ÜRÜN KURALI (global tenant izolasyonu):**
- Her uzman Yaşam Hafızası'nda **yalnız kendi gerçek tenant verilerini** görür; başka uzmanların veya
  sistem şablonlarının verileri karışmaz.
- **Sentetik tenant gerçek kullanıcı değildir**; `tenant_id === ADMIN_LIBRARY_TENANT_ID` kayıtları
  indexe ALINAMAZ, **shared/null'a ÇEVRİLEMEZ**, eligible olamaz, writer'a ulaşamaz, hiçbir kullanıcı
  retrieval'ında görünemez. Kural **kaynak-bazlı ayar değil, YH geneli invariant'tır**.
- **Global/shared admin kütüphanesi ürün modeli YOKTUR.** Yalnız gerçek tenant kayıtları ve (ileride)
  adminin gönderdiği, **alıcının tenant'ında oluşmuş bağımsız snapshot/kopyalar** indexlenebilir.
- PII kaynaklar ana indexe girmez (BF-0 fail-closed korunur); demo exclusion korunur.

## Uygulanan değişiklik (bu görev)

- **`lib/tenancy/syntheticTenants.ts` (YENİ, saf/dependency-free):** `ADMIN_LIBRARY_TENANT_ID` +
  `SYNTHETIC_TENANT_IDS` (readonly) + `isSyntheticTenantId()` (exact-match; `null`/boş/case-varyant
  sentetik SAYILMAZ). **UUID tek kaynağı artık bu modüldür.**
- **`lib/auth/sessionTenant.ts`:** sabit buradan **re-export** (mevcut importer'lar değişmedi; davranış birebir).
- **`lib/yasam-hafizasi/indexer/indexSourcePage.ts` (Katman-1, mode-agnostik):** runSource sonrası /
  writer öncesi tek sınıflandırma — demo → `excludedDemo`, sentetik → `excludedSynthetic`, kalan →
  `eligibleUnits` (bir unit tek sayaçta; NULL/shared ve gerçek tenant davranışı DEĞİŞMEDİ).
  `IndexSourcePageResult.excludedSynthetic` zorunlu alan.
- **`lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts` (Katman-2, savunma derinliği):** writer'a
  sentetik unit ulaşırsa sessiz filtre değil **fail-fast `synthetic-tenant-unit`** throw.
- **`lib/yasam-hafizasi/indexer/adminIndexRequest.ts`:** `SafePageSummary.excludedSynthetic` zorunlu;
  response + audit özetine güvenli sayı olarak geçer. Route dosyası DEĞİŞMEDİ.
- **Driver (`scripts/yh-dogaltas-knowledge-dryrun-driver.ts`):** `SafePage.excludedSynthetic` zorunlu
  (eksik/negatif/string → `page-field-invalid` fail-closed) · **STATE_VERSION=2** ·
  `totalExcludedSynthetic` zorunlu state alanı (v1/eksik-metrik checkpoint **resume EDİLMEZ**; 0 sayılmaz) ·
  log/done özetinde sentetik sayaç. Diğer tüm BF-1A sözleşmeleri (dry-run-only, env-auth, retry yok,
  redirect yok, cursor guard'ları, checkpoint path) DEĞİŞMEDİ.

## BF-1C yeniden sınıflandırma

`dogaltas:knowledge` **gerçek backfill pilotu DEĞİLDİR** (indexlenebilir gerçek-tenant satırı 0).
BF-1C artık **"sentetik template tenant exclusion production smoke"**tur: beklenen sonuç
`fetched=239 (100+100+39, 3 sayfa)`, `excludedSynthetic=239`, `eligibleUnits=0`, `excludedDemo=0`,
`write=null`. Gerçek write/backfill pilotu, gerçek tenant verisi olan safe-non-pii kaynaklardan **ayrı
onayla** seçilecek.

## Kapsam DIŞI (bu görev DEĞİL)

Production SQL/API/dry-run (`--execute`)/write/backfill · push/PR/main-merge · Doğaltaş API/UI
değişikliği · retrieval RPC/visibilityScope değişikliği · migration · gönderim/snapshot akışı (ayrı ürün
fazı) · `word-report`/`knowledge-report` yerel UUID kopyalarının temizliği (ayrı borç).

## Doğrulama

Policy harness **14** (yeni) · driver harness (BF-1A 78 → sentetik alan/state-v2 testleriyle büyüdü) ·
adapters+orkestrasyon (37 → +E sentetik guard 11) · admin-route (65 → +2) · BF-0 guard 39 · run-source 42 ·
retrieval 49 · visibility 49 · `tsc --noEmit` · ESLint (değişen dosyalar, 0/0) · `git diff --check` ·
gerçek fetch=0 tripwire. **Production verisi değişmedi; write/backfill hâlâ YAPILMADI.**

## Sonuç

- *(BF-1B-FIX kod-tam: global sentetik tenant invariant'ı 2 savunma katmanıyla (orchestration filtre +
  writer fail-fast) uygulandı; UUID tek-kaynak `lib/tenancy`'ye taşındı; metrik `excludedSynthetic`
  demo'dan ayrı; driver checkpoint v2 fail-closed. Push/PR ve BF-1C ayrı onay bekler.)*
