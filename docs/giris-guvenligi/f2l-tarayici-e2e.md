# Giriş Güvenliği F2-L — Tarayıcı E2E ve CI Güvenlik Kabulü (17.11.2026)

Bağımlılık: F2-K (#813). Bu çalışmaya kadar F2 tarayıcı testleri GitHub CI'da hiç çalışmıyordu. `ci.yml` içindeki "tarayici"
işi yalnız kampanya testlerini çalıştırır.

## Çalıştırma

- **CI:** `.github/workflows/f2-tarayici.yml`. Ayrı ve yol filtreli bir iş akışıdır; F2 giriş güvenliği dosyaları değişince ya
  da elle tetiklenir. Sır kullanmaz; production'a, Supabase'e, Vercel'e ve Gmail'e istek atmaz.
- **Yerel:** önce sahte değerlerle `next build --webpack` (bkz. `f2c-ui.e2e.ts` başlığı), sonra
  `node scripts/giris-guvenligi/ci-f2-tarayici.mjs --out <boş-klasör> [--only f2c,f2k] [--negatif]`.

## Koşucu kuralları

`scripts/giris-guvenligi/ci-f2-tarayici.mjs` boş paket ya da sessiz atlama durumunda PASS vermez.

1. **Gerçek tarayıcı yoklaması:**
   - Google Chrome (`channel: chrome`), Microsoft Edge (`channel: msedge`) ve WebKit açılır; sürüm ve ikili yolu kanıta yazılır.
   - Edge yalnız kullanıcı ajanında `Edg/` belirteci varsa ve Microsoft Edge ikilisi bulunuyorsa sayılır; Chromium Edge sayılmaz.
2. **Güncel şema:** testler `F2_TEST_DB_WITH_F2K=1` ile F2-A…F2-K zincirinde koşar. Önceden her test kendi eski aşamasının şemasında
   koşuyordu.
3. **Sırayla çalıştırma (bellek):** her testten önce ve sonra kullanılan portlar (3987, 3988, 3989, 54398) boş olmalıdır; doluysa
   test koşturulmaz ve FAIL verilir.
4. **PASS koşulu:** çıkış kodu 0, `N PASS / 0 FAIL` özeti ve N'nin asgari sayıya eşit ya da büyük olması gerekir. Asgari sayılar
   gözlenen tam sayılardır; tek bir madde atlansa bile koşu kırmızı olur.
5. **`--negatif`:** f2k testi F2-K migration'ı olmadan koşar ve FAIL vermek zorundadır. Kritik kuralların FAIL listesinde görünmesi
   şarttır: işleme özel doğrulama, 6 haneli yazılan kod, yönetici oluşturma.

## Testler (CI, 17.11, `e938822b`)

Toplam 303 PASS / 0 FAIL. Negatif kontrol 15 FAIL verdi; üç kritik kural da yakalandı.

| Test | Kapsam | PASS |
|---|---|---|
| `f2c-ui` | QR girişi, Owner cihaz onayı, telefonda yanlış kod, 320/375 px (Chrome, Edge) | 36 |
| `f2d-ui` | E-posta kodu, yöntem seçimi, sayısal klavye, tarayıcı bağlama çerezi (Chrome, Edge, WebKit iPhone emülasyonu, Android emülasyonu) | 48 |
| `f2e-ui` | Kurtarma kodları (bir kez gösterim, indirme, yanlış kod, kullanım), Owner kurtarma talebi, 320/375/390 px | 68 |
| `f2g-ui` | Owner cihaz onayında işleme özel doğrulama penceresi, kanıtın tek kullanımı (Chrome, Edge, 375 px) | 16 |
| `f2i-mobil-ui` | Boşluklu yapıştırma, süresi dolmuş kod, yenileme, geri tuşu, ağ kesintisi, taşma (dört tarayıcı profili + 320 px) | 55 |
| `f2k-ui` | Aşağıdaki listede | 80 |

`f2k-ui` kapsamı:
- 6 haneli yazılan QR kodu; MFA tamamlanmadan oturum ve korumalı sayfa yok.
- Paralel sekmede yanlış kod iki isteği de kapatır; süresi dolmuş ve yeniden kullanılan istek.
- Owner yönetici oluşturma: pencere açılır, Vazgeç ve yanlış kodla yönetici oluşmaz, onaydan sonra MFA zorunlu yönetici oluşur.
- Başka hedefe ait ve kullanılmış kanıt geçmez; MFA'sız yeni yönetici oturum açamaz.
- 15 dakikayı geçen cihaz talebi listede görünmez.
- 320/375/390/768/1280 px'te taşma yok.

Tarayıcı dağılımı:

| Tarayıcı | PASS |
|---|---|
| Chrome | 97 |
| Edge | 77 |
| Chromium Android emülasyonu | 32 |
| WebKit iPhone emülasyonu | 28 |
| Ortak kurulum, DB ve telefon adımları | 69 |

## Sınırlar (gerçek değil, sentetik)

- **Telefon:** Node'da bir P-256 anahtarıdır. Android Keystore, biyometri ve App Links değildir.
- **WebKit:** Safari motoru emülasyonudur, gerçek iPhone Safari değildir. Test HTTPS vekili 1 günlük yerel test sertifikası kullanır.
- **E-posta:** sentetik sağlayıcıdır (yerel dosya). Gerçek Gmail kullanılmaz.
- **Yan fonksiyonlar:** yönetici oluşturmanın test DB'sinde olmayan yan fonksiyonları sade karşılıklardır
  (`testDb.installAdminStandIns`). Yetki kararı gerçek 001100 migration'ından gelir.
- **Kullanıcı detay ekranı:** minimal test DB'sinde "Kayıt bulunamadı" gösterir. Yükseltme senaryosu bu ekranın düğmesiyle değil,
  tarayıcının gerçek Owner oturumuyla gerçek route'a (`PATCH /api/admin/users/[id]`) gönderilen istekle doğrulanır.
- **Tarayıcıda olmayan senaryolar:** route düzeyinde, F2 CI paketinde test edilir. Bunlar:
  - e-posta kilidi, günlük sınır ve bekleme süresi,
  - başka hesaba ait kod,
  - e-posta değişikliği,
  - yetkisiz kurtarma,
  - cihaz reddi,
  - başarısız oturum bağlama kanıtı.
- **Tarayıcıda test edilmeyenler:** Android oturum bağlama ekranı (native yakalama), eski Android sürümü mesajları, yavaş bağlantı,
  çift tıklama ve ileri gezinme.

## Bu çalışmanın yakaladıkları

1. **`/api/admin/step-up` `admin_grant`'ı kabul etmiyordu (F2-K hatası).**
   - Etki: Owner arayüzden yönetici oluşturamıyor ve yükseltemiyordu (400 "Geçersiz istek"). Güvenlik açığı değildi; işlem
     kilitleniyordu.
   - Neden görünmedi: DB fonksiyonunu doğrudan çağıran testler bunu göremiyordu.
   - Düzeltme: izin listesine tek satır. Route testi düzeltmesiz 19/2, düzeltmeli 21/0.
2. **Test altyapısı: testler önceki testin sunucusuna bağlanıyordu.**
   - Linux'ta kapanış yalnız `npx`'i durduruyordu; `next-server` portta kalıyordu.
   - Düzeltme: süreç grubu sonlandırma ve koşucunun port koruması.
3. **`f2i` sahte PASS.**
   - Kod hiç gelmezse `"" === ""` eşitliği PASS sayılıyordu.
   - Düzeltme: 6 haneli kod şartı.
