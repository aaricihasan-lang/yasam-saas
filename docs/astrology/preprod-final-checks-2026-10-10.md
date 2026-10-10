# Astroloji — Canlıya Geçiş Öncesi Son Kontroller (2026-10-10)

Yalnız kontrol ve hazırlık yapıldı.
- Production / Frankfurt / Tokyo, push / merge / deploy, production migration, Vercel env: **dokunulmadı**.
- Gerçek Roxy çağrısı: **0**. Diğer oturumların süreçlerine dokunulmadı.
- Branch `work/astrology-roxy` @ `8a1c950d` + bu not.

**Owner kararı (kayıt):** Vercel Pro'ya **ilk ticari satıştan önce** geçilecek. Şimdilik Free (Hobby) devam ediyor. Bu karar canlıya alma ya da ödeme izni değildir.

## 1. Android teknik hazırlık → teknik olarak HAZIR, cihazda DOĞRULANMADI
### Oturum
Android WebView (UA'da `; wv)` ya da `YasamSistemiAndroid/`) çerez kullanmaz; yalnız localStorage token + `x-session-token` başlığıyla çalışır.
- **İstemci:** `isAndroidWebViewClient()` → `webUsesCookieTransport()=false` → `readSessionToken()` token döner → Astroloji istemcisi `sessionTokenHeader()` ile başlığı gönderir.
- **Sunucu:** `isAndroidAppRequest` → çerez yok sayılır, yalnız başlık.
- **H6a (main `9923cfd6`, PR #377) ile değişmedi:** web çerez taşımasında token göndermez; Android aynen token + başlık.

### Testler
Main (H6a dahil) ile geçici birleşik ağaçta (yerel, sonra silindi):

| Test | Sonuç |
|---|---|
| Astroloji harness'leri | 485/0 |
| httponly-h6a | 19/0 |
| httponly-h5 | 30/0 |
| httponly-h1h4 | 29/0 |
| session-expiry-ux | 27/0 |
| tsc | 0 |

`httponly9c` Android UA kontrolü: çerezle 404, token başlığıyla 200.

### Yetki
Modül (`astrology`) ve Roxy yorumu (`astrology_provider_interp`) sunucuda platformdan bağımsız denetlenir:
- Modül kapalı / demo / başka uzman → 404.
- Yorum kapalıysa kolon DB'den okunmaz.

### Word/PDF
- **UI:** `SavedAnalyses.tsx` → `useIsAndroid()` ise düğmeler hiç render edilmez.
- **Sunucu:** `analyses/[id]/report` → `androidWordGuard` + `isAndroidUserAgent` → **403**, dosya üretilmez. Kapsam: Android uygulama WebView'i ve Android tarayıcı, telefon ve tablet. Yetkisiz Android isteği önce 404 alır (varlık sızmaz).
- **Test:** `report8` (72/0).

### Gerçek cihazda owner'ın yapacağı test (≈10 dk)
**Ön koşul:** Astroloji prod'da canlı olmalı. Test uzmanında `astrology` açık, `astrology_provider_interp` kapalı.

1. Android uygulamasında uzman hesabıyla giriş yap. Ana ekranda Astroloji kartı görünüyor mu?
2. Astroloji'yi aç → Çalışma Merkezi açılıyor ve danışan listesi geliyor mu ("Oturum bulunamadı" ya da boş sayfa yok)?
3. Yeni profil oluştur (sentetik isim, saat bilinmiyor) → kaydediliyor mu?
4. Kayıtlı bir analizi aç → teknik tablolar geliyor mu? Roxy yorumu bölümü "kapalı" mı?
5. Kayıtlı analiz ekranında **Word / PDF düğmesi görünmüyor** mu?
6. Uygulamayı kapat, 1 dk sonra yeniden aç → oturum duruyor mu, Astroloji yeniden giriş istemeden açılıyor mu?
7. Admin panelinden (bilgisayar) bu uzmanın Astroloji iznini kapat → telefonda sayfayı yenile → Astroloji erişimi kalkıyor mu?
8. İzni geri aç, `astrology_provider_interp`'i de aç → yeni hesapta yorum bölümü görünüyor mu? (Bu adım **1 gerçek Roxy çağrısı** harcar; owner onayıyla, isteğe bağlı.)
9. Çıkış yap → Astroloji adresi giriş ekranına yönlendiriyor mu?

Her adım için ekran görüntüsü yeterli. Bu liste uygulanmadan Android **PASS sayılmaz**.

## 2. Roxy kota durumu
**Test defteri:** `scripts/astrology/fixtures/golden9a/roxy-call-ledger-9a.json` → `total: 50`.
- Mutabakat: natal golden 1 + `fixtures/golden/` 46 + 9A 3 = **50**.
- 9A'dan (`a4c44d0f`) bu yana fixture dizininde değişiklik yok. 9B, 9C ve bu kontrolde gerçek çağrı **0**.

**Önemli:** Astroloji ve Human Design **aynı** `ROXY_API_KEY`'i kullanıyor (`lib/astrology/config.ts`, `lib/human-design/providers/roxy/config.ts`), yani aylık kota **ortak**. HD prod kullanımı da kotadan düşer. 50 yalnız Astroloji geliştirme testlerinin sayısıdır, kotanın toplam kullanımı değildir.

**Uygulama içi sınırlar:** uzman başına 200 analiz/gün, 120 yazma/10 dk. Kayıtlı analiz açma, Word ve PDF Roxy **harcamaz**. Hesap, teknik başına genelde 1 çağrıdır (dasha alt dönemleri gibi bazı teknikler daha fazla).

**Repo içinden doğrulanamaz.** Owner'dan Roxy panelinin şu ekran görüntüleri gerekiyor:
1. **Plan / abonelik sayfası:** plan adı, aylık istek kotası, yenilenme (reset) tarihi.
2. **Kullanım (usage) sayfası:** bu dönemde kullanılan / kalan istek; mümkünse günlük grafik.
3. **API anahtarları listesi (anahtar maskeli):** prod'da kullanılan anahtarın aktif olduğu ve kısıt (IP/domain) olup olmadığı.
4. **Aşım politikası:** kota dolunca istek reddi mi, ek ücret mi?

Kota dolarsa: Astroloji yeni hesapta sağlayıcı hatası verir (kayıtlı analizler ve raporlar çalışmaya devam eder). HD Roxy otomatik hesabı da etkilenir.

## 3. Vercel Free (Hobby) teknik koşulları
**Repo:**
- `maxDuration = 300` yalnız `app/api/admin/astroloji/engine/run` ve `app/api/astroloji/engine/run`'da.
- Çalışma bütçesi `ASTRO_RUN_BUDGET_MS` = 300 − 60 = 240 sn. Kilit 90 sn (2 × en kötü çağrı 45 sn).
- Rapor route'ları varsayılan süreyi kullanır.
- `vercel.json` / `vercel.ts` yok; ayarlar proje panelinde.

**Dolaylı kanıt:** main'de zaten `maxDuration = 300` kullanan route'lar var (`clients/word-report-bulk`, `ders-notu/temizle`) ve prod deploy'ları başarılı. Mevcut plan ve ayarlar 300 sn'yi kabul ediyor. Bu da **Fluid Compute'un açık olduğuna** işaret ediyor; Fluid kapalı Hobby'de üst sınır 60 sn olurdu ve deploy reddedilirdi.

**Canlıya geçmeden panelde kontrol edilecekler (yalnız bakılır, değiştirilmez):**
1. **Settings → Functions:** Fluid Compute **açık**; Function Region **fra1** (Frankfurt DB ile aynı).
2. **Settings → Functions → Max Duration:** varsayılan; route içindeki 300 sn'ye izin veriyor.
3. **Settings → Environment Variables (Production):**
   - `ROXY_API_KEY` mevcut (HD için zaten var).
   - `ROXY_API_BASE_URL` gerekmez; boşsa resmi adres kullanılır.
   - `ASTROLOGY_MODULE_ENABLED` **henüz yok** (yokluk = modül kapalı). Canlıya geçişte owner onayıyla deploy'dan **sonra** `true` yapılır.
   - `SESSION_COOKIE_MODE=primary` **değişmez**.
4. **Usage:** Hobby aylık fonksiyon kullanımı (Active CPU, çağrı sayısı) mevcut tüketimle birlikte sınıra uzak mı?
5. **Plan notu:** Hobby ticari kullanıma izin vermez. **Vercel Pro'ya ilk ticari satıştan önce geçilecek** (owner kararı). Pro yükseltmesi bu çalışmada yapılmadı.

## 4. Main / freeze durumu
**Main ilerledi:** `674f031b` → `a157ec31` (8 commit).
- **#377 HttpOnly H6a:** `lib/auth/**`, `app/layout.tsx`, `app/page.tsx` (3 satır).
- **#375 HD Word profesyonel düzen.**

**Branch:** main'in 63 commit önünde, 8 commit gerisinde. `git merge-tree` ile **çakışma yok**. Birleştirme branch'e uygulanmadı (riskli entegrasyon yok); doğrulama geçici ağaçta yapıldı (§1).

**Main'de yeni migration ya da yedek değişikliği yok.** Astroloji migration zinciri (000000–000700, sonra gelen) ve 9C yedekleme / rollback planı (`ASTROLOGY-PHASE9C-READINESS.md` §7) geçerliliğini koruyor.

**Freeze:** diğer oturumun (d2) H6a için kısa prod freeze bildirimi alındı. Merge veya deploy yapılmadı; freeze ihlali yok. Canlıya geçişten önce "freeze kalktı" teyidi gerekir.

## 5. Canlıya geçişi engelleyen açık sorunlar
- **Kod tarafında P0 / P1 / P2 yok.** H6a ile uyum doğrulandı.
- **Kod dışı engeller / koşullar:**
  1. H6a freeze'inin kalkması.
  2. Merge öncesi branch'in güncel main ile birleştirilip tam regresyonun (PG zinciri dahil) yeniden koşulması. Rutin; çakışma yok.
  3. Roxy kota teyidi (ekran görüntüleri, §2).
  4. Vercel panel teyidi (Fluid / fra1 / env, §3).
  5. Android gerçek cihaz testi (§1).

## 6. Owner'dan gereken kararlar
1. Canlıya alma zamanı ve onayı: merge, production migration 000000–000700 (yedekten sonra), `ASTROLOGY_MODULE_ENABLED=true`. Auth/env istisnası gereği açık onay.
2. Roxy: ortak kota yeterli mi, yoksa Astroloji için ayrı anahtar ya da plan mı?
3. Android cihaz testi canlıya geçiş öncesi mi (preview/test hesabı), yoksa canlıdan hemen sonra, modül yalnız test uzmanına açıkken mi?
4. Cihaz testinin 8. adımı için 1 gerçek Roxy çağrısına izin (isteğe bağlı).
5. Vercel Pro'ya geçiş tarihi (ilk ticari satıştan önce).
