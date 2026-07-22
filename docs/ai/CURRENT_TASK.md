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

**Son güncelleme:** 2026-07-22 (S2.19-BF / BF-1A AÇILIŞ — oils dry-run pilot driver'ı; production çağrısı YOK)

---

## Durum

**S2.19-BF / BF-1A AÇILDI — `aromaterapi:oils` Dry-Run Pilot Driver.** Production'da **ileride**
çalıştırılacak, yalnız **dry-run** yapabilen, fail-closed, cursor-bazlı, resumable local Node driver
+ mock harness geliştirmesi. **Bu fazda gerçek production API çağrısı / dry-run / SQL / write / backfill
YAPILMAZ.**

**Önceki durum (kayda alındı):** BF-0 (kaynak PII sınıflandırma guard'ı) **production main'de kapalı**
(PR #20, merge `8a9eb2c`; classification zorunlu + fail-closed guard; ana index CHECK değişmedi). S2.19A
merge + S2.19B RPC production'da; `yasam_hafizasi_index` **BOŞ** → backfill gerekli. Worktree tabanı =
güncel origin/main `8a9eb2c`, branch `work/yh-bf1a`.

## Görev

`scripts/yh-oils-dryrun-driver.ts` (dry-run-only) + `scripts/yh-oils-dryrun-driver-harness.ts` (mock).
Driver, mevcut admin route'u (`POST /api/admin/yasam-hafizasi/index-page`) header-bazlı auth ile çağırıp
sayfa sayfa dry-run yapacak — **BF-1C'de**. BF-1A yalnız kodu ve mock harness'i teslim eder.

## Auth sözleşmesi (kanıtlı — kod DEĞİŞMEZ)

Route auth = `verifyAdminRequest` (`lib/auth/adminGuard.ts:30-114`): iki header `x-admin-id` +
`x-session-token`; token→userId (`getActiveSessionUserId`, `user_sessions.session_token`+`is_active`),
binding `tokenUserId===adminId`, `role='admin' && active=true`. **Cookie/CSRF/origin/middleware YOK;
nodejs runtime.** Session token = **bearer-eşdeğeri gizli** → yalnız env-var.

## Kilitli kararlar (kullanıcı onaylı)

- **Response sözleşmesi (DÜZELTİLDİ):** dry-run yalnız `{ok:true, mode:'dry-run', sourceKey, page:
  {fetched, produced, skipped, eligibleUnits, excludedDemo, nextCursor, hasMore}, write:null}` döner.
  **`plannedInsert`/`plannedUpdate`/`unchanged`/`processed` YOK** — driver bunları beklemez/toplamaz.
- **Sabitler (compile-time; CLI/env/config ile DEĞİŞTİRİLEMEZ):** `SOURCE_KEY='aromaterapi:oils'` ·
  `MODE='dry-run'` · `LIMIT=100` · `MAX_PAGES=50` · `MAX_ROWS=5000` · `PAGE_DELAY_MS=500` ·
  `REQUEST_TIMEOUT_MS=120000`. **Driver'da `'write'` request mode HİÇ kullanılmaz.**
- **Auth env-only:** `YH_BASE_URL` (https origin), `YH_ADMIN_ID` (uuid), `YH_SESSION_TOKEN`. CLI arg
  DEĞİL; loglanmaz; hata mesajına/state'e/body'ye yazılmaz; `.env` oluşturulmaz; commit edilmez;
  fixture'da gerçek değer yok.
- **CLI kapısı:** yalnız `--execute` ve `--resume`. Argümansız → no-op (ağ çağrısı YOK). `--resume`
  tek başına → ağ çağrısı YOK. Bilinmeyen/tekrar arg → fail-closed red. Gerçek çalışma: `--execute`
  veya `--execute --resume`.
- **Checkpoint repo-DIŞI:** `os.tmpdir()/yasam-hafizasi/yh-oils-dryrun-state.json` (atomik yaz;
  secret/içerik/URL/id/token/response YOK). `.gitignore` değişmez.
- **redirect: 'error'** (yönlendirme takip edilmez); endpoint path hard-coded eklenir.

## Kapsam DIŞI (BF-1A DEĞİL)

- Gerçek production API çağrısı / dry-run çalıştırma → **BF-1C** (kullanıcı onayı olmadan başlamaz).
- Production ön kontrol SQL → **BF-1B**. Write kapısı → **BF-2 (ayrı hard gate)**. S2.19C.
- Production route/adapter/migration/BF-0 guard/retrieval pipeline değişikliği. package.json/.gitignore/
  dependency/dotenv.

## Dokunulmayacak (git ile kanıtlanacak)

`app/api/admin/yasam-hafizasi/index-page/route.ts` · `adminGuard.ts` · `adminIndexRequest.ts` ·
`indexSourcePage.ts` · `sources.ts` · `sourceGuard.ts` · Supabase adapter'ları · retrieval pipeline +
RPC · migration/schema · `CHECK(is_client_pii=false)` · `package.json` · `.gitignore`.

## Fail-closed DUR koşulları (driver)

HTTP ≠200 (401/403/429/5xx) · retry YOK · schema/`ok`/`mode`/`sourceKey`/`write`/`page` ihlali · negatif/
kesirli metrik · cursor tekrar/geri · `hasMore=true`+null/invalid-uuid cursor · maxPages/maxRows aşımı ·
redirect · timeout/network · bozuk JSON · env geçersiz (ağdan önce çık) · bozuk/uyumsuz state.

## Test planı (harness ≥50; gerçek ağ YOK)

Mock fetch/sleep/time/state; CLI kapısı · body builder (4 alan, afterId ilk istekte yok) · exact response
validation · cursor monotonluk/tekrar/geri/null/invalid · maxPages/maxRows · tüm HTTP hata kodları · redirect/
timeout/network · secret redaction (token/adminId/body/içerik loglanmaz) · checkpoint atomik+secret-yok ·
resume kuralları · sleep 500ms/son-sayfada yok · harness gerçek URL'ye çağrı yapmaz.

## Commit (path-scoped, ayrı; `git add -A` YASAK)

1. `docs(ai): open BF-1A oils dry-run driver` → yalnız `docs/ai/`
2. `feat(yasam-hafizasi): add oils dry-run pilot driver` → yalnız `scripts/yh-oils-dryrun-driver.ts` +
   `scripts/yh-oils-dryrun-driver-harness.ts`
3. `docs(ai): close BF-1A oils dry-run driver` → yalnız `docs/ai/`

## Push / Production

- **Bu görevde push/PR/main-merge YOK · production/API/SQL/dry-run/write/backfill YOK · BF-1B/1C/BF-2/
  S2.19C YOK.**

## Sonuç

- *(BF-1A açıldı — dry-run-only pilot driver + mock harness. Gerçek çağrı yok. Sıradaki: driver → harness →
  docs kapanış. Sonra BF-1B ön kontrol SQL, BF-1C canlı dry-run — ayrı onay.)*
