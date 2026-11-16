# Giriş Güvenliği F2 — Gerçek Cihaz ve Canlı Kabul Kontrol Listesi

Bu liste, F2-A…F2-H kodunun canlıya alınmadan **önce** Owner'ın yapacağı ve yalnız gerçek cihaz / gerçek hesapla
doğrulanabilecek adımları toplar. Yerel ve CI testleri bu adımların yerine geçmez; burada işaretlenmeyen madde
**NOT TESTED** sayılır.

İlgili belgeler: `f2d-google-workspace-kurulum.md` (Workspace / DNS / OAuth ayrıntıları), `f2g-son-kabul.md` (yayın
sırası ve geri dönüş), `f2h-denetim-imha.md`.

## 1. Android uygulaması (2.0.0 / versionCode 16)

Entegrasyon dalı (Android deposu, yerel): `f2-entegrasyon-2.0.0`. Dal; 1.9.1 açılış düzeltmesini (ana kopyadaki
commitsiz çalışmanın birebir kopyası), F2-C QR onayını ve `fragment-ktx 1.6.2` düzeltmesini içerir.

- `fragment-ktx 1.6.2` neden var: `biometric 1.1.0` eski `fragment 1.2.5` getirir. Bu sürümde `registerForActivityResult`
  ile başlatılan kilit ekranı doğrulaması (Android 7–10 yedek yolu) "requestCode 16 bit" hatasıyla çökebilir.

### Owner adımları

1. Ana kopyadaki 1.9.1 çalışmasını ne yapacağınıza karar verin:
   - (a) 1.9.1 ayrı yayımlanacaksa önce ana kopyada commit'leyin.
   - (b) Doğrudan 2.0.0 yayımlanacaksa entegrasyon dalı zaten 1.9.1 değişikliklerini içerir.
2. Android Studio'da `f2-entegrasyon-2.0.0` dalını açın → **Build › Generate Signed App Bundle** (kendi yükleme
   anahtarınızla) → Play Console **Dahili test** kanalına yükleyin. Üretim kanalına göndermeyin.
3. Play Console → **Test ve yayınla › Uygulama bütünlüğü › Uygulama imzalama**:
   - **Uygulama imzalama anahtarı sertifikası** altındaki SHA-256 parmak izini kopyalayın. Yükleme anahtarının parmak izini
     kullanmayın.
   - Aynı sayfadaki hazır "Digital Asset Links JSON" örneği doğrudan kullanılabilir.
4. Parmak izini geliştirme oturumuna iletin. `public/.well-known/assetlinks.json` ancak bu değerle hazırlanır; değer tahmin
   edilmez. Biçim:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": { "namespace": "android_app", "package_name": "com.yasamsistemi.app",
                 "sha256_cert_fingerprints": ["<Play'deki uygulama imzalama SHA-256>"] }
   }]
   ```

   - Yayın adresi `https://www.yasamsistemi.com/.well-known/assetlinks.json` olacak ve 200, `application/json` dönmeli,
     yönlendirme olmamalı.
   - 16.11.2026 itibarıyla bu adres canlıda **404** döner. Bu beklenen durum: dosya henüz yok.

### Gerçek telefonda yapılacak testler

| # | Test | Beklenen |
|---|---|---|
| A1 | Dahili test sürümünü kur, aç | Açılış görseli en az ~2 sn görünür, ana sayfa gelir (1.9.1 davranışı) |
| A2 | Uygulama içi WebView: giriş, dosya yükleme, Word indirme | 1.9.0 ile aynı |
| A3 | `adb shell pm get-app-links com.yasamsistemi.app` | `www.yasamsistemi.com: verified` (assetlinks yayımlandıktan sonra) |
| A4 | Ayarlar › Güvenilir cihaz › eşleştir | Biyometri istemi, eşleştirme kodu; web'de cihaz "etkin" |
| A5 | Web'de girişte QR'ı telefon kamerasıyla okut | Doğrudan uygulamadaki onay ekranı açılır (tarayıcı değil); **tek** biyometri istemi; eşleştirme sayısı web ile aynı |
| A6 | Onayla / Reddet | Web girişi tamamlanır / reddedilir |
| A7 | Web'den cihazı iptal et, yeniden QR okut | Telefon onayı reddedilir |
| A8 | Parmak izi kayıtlı olmayan / yalnız PIN'li cihaz (mümkünse Android 7–10) | Kilit ekranı doğrulaması açılır, uygulama çökmez |
| A9 | Keystore türü (StrongBox / TEE) | Web'deki cihaz kaydında görünen değer not edilir; attestation "doğrulanmamış" kaydedilir (bilinçli) |

## 2. iPhone (Safari) — uygulama gerekmez

| # | Test | Beklenen |
|---|---|---|
| I1 | Parola → e-posta kodu → giriş | Kod Gmail kutusuna gelir, giriş tamamlanır |
| I2 | Kurtarma koduyla giriş | Kod bir kez geçer, ikinci kullanım reddedilir |
| I3 | Ayarlar › kurtarma kodu üret / indir | Dosya iner; kodlar ekranda yalnız bir kez |
| I4 | E-posta değişikliği | Eski ve yeni adrese bildirim; yeni adres doğrulanmadan geçmez |
| I5 | 320 / 375 / 390 px ve özel tarama | Taşma yok; özel tarama modunda giriş çalışır |

## 3. Google Workspace (e-posta kodu)

Ayrıntılı adımlar `f2d-google-workspace-kurulum.md` §2–§8'dedir. Özet sıra:

1. Workspace aboneliği ve alan doğrulama TXT kaydı.
2. Yalnız bu iş için gönderici kutu (ör. `dogrulama@…`): 2 adımlı doğrulama zorunlu.
3. DNS: SPF (tek kayıt; varsa `include:_spf.google.com` eklenir), DKIM (2048 bit, Admin konsolundan), DMARC `p=none`.
   - Gelen posta Google'a taşınmayacaksa MX değişmez.
4. Google Cloud projesi:
   - Gmail API etkin.
   - OAuth izin ekranı **Dahili**; kapsam **yalnız** `gmail.send`.
   - Masaüstü OAuth istemcisi.
5. `scripts/giris-guvenligi/gmail-oauth-setup.mjs --out …` ile yenileme token'ı alın, ardından `--check` çalıştırın.
   Betik e-posta göndermez ve token'ı ekrana yazmaz.
6. Vercel **Production** ortam değişkenlerini (Sensitive) girin:
   - `EMAIL_PROVIDER=gmail`
   - `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`
   - `GMAIL_SENDER` (OAuth'u onaylayan kutu)
   - `GMAIL_SENDER_NAME`
   - `AUTH_OTP_PEPPER` (≥32 karakter)
7. Gerçek gönderim testi (§8): yalnız Owner'ın kendi kutularına.
   - "Orijinali göster" ekranında SPF / DKIM / DMARC üçü de PASS olmalı.
   - Spam klasörü kontrol edilir.

**Açık karar — `AUTH_MFA_EMAIL_ROLES`:** `f2d` belgesine göre varsayılan `expert`; yöneticiler e-posta yöntemi
almaz, QR zorunludur. Owner hesabının telefonu yoksa e-posta ile girebilmesi için `expert,admin` gerekir. Owner'ın
kritik işlem e-posta kodu (step-up) bu ayardan bağımsızdır.

## 4. Production ortam değişkenleri — doğrulama

Bu değerler kod tarafından okunur. 16.11.2026'da **doğrulanamadı**: bu makinedeki Vercel CLI oturumunun süresi dolmuş
(API 403). Oturumu yenilemek kimlik dosyasını değiştireceği için yapılmadı. Owner kendi terminalinde:

```powershell
vercel login
vercel env ls production
```

`env ls` değerleri göstermez, yalnız ad ve ortamı listeler. Gizli değerleri sohbete veya ekran görüntüsüne koymayın.

| Değişken | Beklenen | Tür |
|---|---|---|
| `SESSION_EXPIRY_ENFORCE` | tanımsız veya açık | düz |
| `SESSION_COOKIE_MODE` | `primary` | düz |
| `REQUIRE_DB_SUPER_ADMIN_MARKER` | `true` | düz |
| `AUTH_MFA_METHODS` | `qr_device,email_otp` | düz |
| `AUTH_MFA_METHOD_SCOPE` | önce `test_accounts`, sonra `all` | düz |
| `AUTH_MFA_EMAIL_ROLES` | §3'teki karar | düz |
| `EMAIL_PROVIDER` | `gmail` (kurulum bitene kadar `disabled`) | düz |
| `GMAIL_OAUTH_*`, `GMAIL_SENDER(_NAME)` | §3 | Sensitive |
| `AUTH_OTP_PEPPER`, `RATE_LIMIT_SECRET`, `LOGIN_IP_PEPPER` | dolu, ≥32 karakter | Sensitive |
| `EMAIL_DAILY_LIMIT` / `EMAIL_WARN_AT` | 1800 / 1500 (varsayılan) | düz |

## 5. Canlı PASS koşulu

§1 A1–A8, §2 I1–I5, §3 madde 7 ve §4 tablosu Owner tarafından doğrulanmadan canlı kabul PASS verilmez. Yayın sırası
ve migration `000200`'ün en son uygulanması için bkz. `f2g-son-kabul.md`.
