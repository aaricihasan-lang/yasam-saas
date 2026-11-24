# F2-D — E-posta doğrulama kodu: Google Workspace / Gmail API kurulumu (Owner)

> Bu belge **Owner'ın elle yapacağı** adımları anlatır. Bu iş paketinde hiçbir satın alma, DNS değişikliği,
> hesap açma veya canlı ayar yapılmadı. Google arayüz adları zamanla değişebilir; her adımda Google'ın
> güncel yardım sayfasıyla karşılaştırın.

## 1. Ne kuruluyor?

Parolayı doğru giren kullanıcıya, ikinci doğrulama olarak **6 haneli bir kod** e-postayla gönderilir.

- Kod 3 dakika geçerlidir ve tek kullanımlıktır.
- Kod en fazla 5 kez yanlış girilebilir; 5. yanlışta o giriş isteği kalıcı olarak kapanır.
- Yeniden gönderim için 60 saniye beklenir. Bir giriş isteği için en fazla 3 kod gönderilir.
- Kullanıcı başına sınırlar: saatte en fazla 6 kod ve 24 saatte toplam 10 yanlış deneme.
- Veritabanında kodun kendisi tutulmaz; yalnız HMAC özeti (`AUTH_OTP_PEPPER`) saklanır.
- Gönderim başarısız olursa ikinci doğrulama **atlanmaz**. Kullanıcı QR yöntemine geçebilir veya sonra tekrar dener.

Gönderim, Google Workspace'teki **ayrı bir gönderici posta kutusundan** Gmail API ile yapılır.

- Yetki kapsamı yalnız `https://www.googleapis.com/auth/gmail.send`: gönderme izni var, okuma/silme/ayar izni yok.
- Alan geneli yetkilendirme (domain-wide delegation) ve hizmet hesabı **kullanılmaz**.
- Sağlayıcı katmanı değiştirilebilir (`lib/email/provider.ts`). İleride başka bir sağlayıcı yalnız yeni bir dosya ve `EMAIL_PROVIDER` değeriyle eklenir.

## 2. Ön koşullar (Owner kararı / satın alma gerektirir)

1. **Google Workspace aboneliği** ve `yasamsistemi.com` alan adının Workspace'e bağlanması.
2. **Gönderici posta kutusu.** Yalnız bu iş için ayrı bir kullanıcı açılır (ör. `dogrulama@yasamsistemi.com`). Bu bir Workspace lisansı gerektirir.
   - Owner'ın kişisel posta kutusu **kullanılmamalıdır**: o kutunun parolası değişince token iptal olur ve gönderim durur.
   - Bu kutuya 2 adımlı doğrulama zorunlu olmalı; parola yalnız Owner'da kalmalı.
3. **DNS paneline erişim.** Alan adının DNS kayıtlarının yönetildiği panel (Owner hangi panel olduğunu teyit eder).

## 3. Alan adı doğrulama ve e-posta kimlik doğrulaması (DNS)

> Mevcut DNS kayıtlarını **silmeden** ekleyin; değişiklikten önce mevcut kayıtların ekran görüntüsünü alın.

| Kayıt | Ad / Host | Değer | Not |
|---|---|---|---|
| TXT (Workspace doğrulama) | `@` | `google-site-verification=…` | Değeri Google Admin konsolu verir. |
| MX | `@` | Google'ın verdiği MX | **Yalnız** alan adının gelen postası da Google'a taşınacaksa. Sadece gönderim için MX değiştirmek gerekmez; mevcut gelen posta düzeni bozulmasın. |
| TXT (SPF) | `@` | `v=spf1 include:_spf.google.com ~all` | Alan adında **tek** SPF kaydı olmalı. Zaten bir `v=spf1` kaydı varsa yenisini eklemeyin; `include:_spf.google.com` mevcut kayda eklenir. |
| TXT (DKIM) | `google._domainkey` | Admin konsolu → Uygulamalar → Google Workspace → Gmail → **E-postanın kimliğini doğrula** → 2048 bit anahtar oluştur | Kayıt yayılınca aynı ekrandan **Kimlik doğrulamayı başlat**. |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yasamsistemi.com` | Önce `p=none` ile izleyin; birkaç hafta sorunsuzsa `p=quarantine`. |

Doğrulama:

1. Gönderici kutudan Owner'ın Gmail adresine bir test iletisi gönderin.
2. Gmail'de **Orijinali göster** ekranında SPF, DKIM ve DMARC değerlerinin üçü de **PASS** olmalı.

## 4. Google Cloud projesi ve OAuth istemcisi

Aşağıdaki adımlar Workspace yönetici hesabıyla, Workspace organizasyonu altında yapılır.

1. **Proje oluştur.** console.cloud.google.com → yeni proje (ör. `yasam-sistemi-eposta`). Faturalandırma gerekmez.
2. **Gmail API'yi etkinleştir.** API'ler ve Hizmetler → Kitaplık → **Gmail API** → Etkinleştir.
3. **OAuth izin ekranı.** Kullanıcı türü **Dahili (Internal)** seçilir.
   - Dahili uygulama Google uygulama doğrulaması gerektirmez.
   - Yenileme token'ı "test modu" gibi 7 günde düşmez.
   - Uygulama adı: "Yaşam Sistemi Doğrulama". Destek e-postası: Owner.
   - Kapsamlar: **yalnız** `.../auth/gmail.send`.
4. **OAuth istemcisi.** Kimlik bilgileri → Kimlik bilgisi oluştur → OAuth istemci kimliği → uygulama türü **Masaüstü uygulaması**.
   - İstemci kimliği ve gizli anahtarı bir parola yöneticisinde saklayın.
   - Bunları ekran görüntüsüne, sohbete veya repoya koymayın.
5. **(İsteğe bağlı) Erişimi kısıtla.** Admin konsolu → Güvenlik → API kontrolleri → bu istemciyi "Güvenilir" yapın ve yalnız gönderici kutunun organizasyon biriminde kullanılmasına izin verin.

## 5. Yenileme token'ını alma (tek seferlik)

Bu adım Owner'ın kendi bilgisayarında yapılır. Tarayıcıda **gönderici posta kutusuyla** oturum açılmış olmalıdır.

```powershell
$env:GMAIL_OAUTH_CLIENT_ID = "<istemci kimliği>"
$env:GMAIL_OAUTH_CLIENT_SECRET = "<gizli anahtar>"
node scripts/giris-guvenligi/gmail-oauth-setup.mjs --out C:\Gizli\gmail-refresh.json
node scripts/giris-guvenligi/gmail-oauth-setup.mjs --check C:\Gizli\gmail-refresh.json
```

Betik şu güvenceleri verir:

- Yalnız `gmail.send` ister. Google başka bir kapsam döndürürse token'ı **kaydetmez**.
- PKCE kullanır ve yalnız `127.0.0.1` üzerinden geri döner.
- Token'ı **ekrana yazmaz**; dosyayı repo içine ve var olan bir dosyanın üzerine yazmayı reddeder.
- `--check` yalnız token'ın yenilenebildiğini ve kapsamını doğrular; **e-posta göndermez**.

Dosyadaki `refresh_token` değeri Vercel'e girildikten sonra dosyayı güvenli şekilde silin.

## 6. Vercel ortam değişkenleri

Değerler **Production** ortamına ve **Sensitive** olarak girilir. Preview ortamına gerçek Gmail bilgisi girmeyin.

| Değişken | Değer | Açıklama |
|---|---|---|
| `EMAIL_PROVIDER` | `gmail` | `disabled` (varsayılan) = e-posta yöntemi kapalı. `synthetic` production'da reddedilir. |
| `GMAIL_OAUTH_CLIENT_ID` | istemci kimliği | |
| `GMAIL_OAUTH_CLIENT_SECRET` | gizli anahtar | Sensitive |
| `GMAIL_OAUTH_REFRESH_TOKEN` | §5'teki değer | Sensitive |
| `GMAIL_SENDER` | `dogrulama@yasamsistemi.com` | OAuth'u onaylayan kutu ile **aynı** olmalı. |
| `GMAIL_SENDER_NAME` | `Yaşam Sistemi` | İsteğe bağlı. |
| `AUTH_OTP_PEPPER` | en az 32 karakter rastgele değer | Sensitive. Kriptografik üretin, ör. `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))" \| Set-Clipboard` (ekrana basmadan panoya) ya da parola yöneticisinin üreticisi. Değiştirilirse yalnız o an geçerli kodlar düşer. |
| `AUTH_MFA_METHODS` | `qr_device,email_otp` | Hangi yöntemler açık. |
| `AUTH_MFA_METHOD_SCOPE` | `test_accounts` → sonra `all` | Önce yalnız Owner'ın test listesindeki hesaplar. |
| `AUTH_MFA_EMAIL_ROLES` | `expert` (varsayılan) | Yönetici hesapları e-posta yöntemi **almaz** (QR zorunlu). |
| `EMAIL_DAILY_LIMIT` | `1800` (varsayılan) | Kayan 24 saatte bu sayıya ulaşılınca gönderim durur ve Owner'a uyarı gider. |
| `EMAIL_WARN_AT` | `1500` (varsayılan) | Bu sayıda Owner'a "sınıra yaklaşıldı" uyarısı gider. |

## 7. Sınırlar

- **Workspace gönderim sınırı.** Kullanıcı başına kayan 24 saatte yaklaşık 2.000 ileti; deneme (trial) aboneliğinde çok daha düşük. Bu yüzden varsayılan blok sınırı 1800, uyarı eşiği 1500 olarak ayarlandı.
  - Sınır aşılırsa Google 24 saate kadar gönderimi durdurabilir. Sistem bundan önce kendi kendini durdurur.
- **Gmail API kotası.** Kota birim sınırları Cloud Console → Gmail API → Kotalar ekranında görünür. Bizim hacmimizde bağlayıcı olan, günlük gönderim sınırıdır.
- **Token iptali.** Yenileme token'ı şu durumlarda geçersizleşir ve gönderim `oauth_invalid_grant` ile durur:
  - gönderici kutunun parolası değişirse;
  - Owner erişimi kaldırırsa;
  - token uzun süre (≈6 ay) kullanılmazsa.

  Bu durumda Owner Bildirim Zili'ne **"doğrulama e-postası gönderim uyarısı"** düşer ve §5 yeniden yapılır.
- **Hacim aşılırsa.** Günlük 1500'ün kalıcı olarak aşılması beklenirse ikinci bir gönderici kutu veya işlem e-postası sağlayıcısı gerekir. Bu, `EmailProvider` katmanında yeni bir sağlayıcı olarak eklenir.

## 8. Gerçek gönderim testi (Owner kontrolündeki kutulara) — HENÜZ YAPILMADI

Kurulumdan sonra ve kullanıcılara açmadan **önce** yapılır.

1. **Durum ekranı.** `/admin/eposta-durumu` → yapılandırma **Hazır** görünmeli.
2. **Test iletisi.** "Kendime test iletisi gönder" ile Owner'ın kendi adresine kod içermeyen bir ileti gider.
   - Gelen kutusunda mı, istenmeyen klasöründe mi düştüğüne bakın.
   - **Orijinali göster** ekranında SPF/DKIM/DMARC **PASS** olmalı.
3. **Uçtan uca giriş.** `AUTH_MFA_METHOD_SCOPE=test_accounts` iken Owner'ın test listesine eklediği, Owner'a ait bir uzman test hesabı kullanılır.
   - Ayarlar → Giriş Yöntemlerim → e-postayı doğrula.
   - Owner bu hesapta zorunluluğu açar.
   - Çıkış → giriş → kod e-postayla gelir → giriş tamamlanır.
   - Test şu ortamlarda tekrarlanır: Chrome (Windows), Edge (Windows), Android telefonda Chrome, iPhone'da Safari.
4. **Farklı gelen kutuları.** Gmail, Outlook/Hotmail, iCloud ve Yandex kutularında teslim ve istenmeyen klasörü durumu not edilir.
5. **Sonuç.** Her madde için PASS/FAIL kaydı tutulur. Bu yapılmadan e-posta yöntemi genel kullanıma açılmaz.

## 9. Canlıya alma sırası (her adım ayrı Owner onayı)

1. **Ön koşul.** F2-A (#792) → F2-B (#795) → F2-C (#797) merge edilmiş ve migration'ları uygulanmış olmalı (000000 → 000100 → 000200 → 000300).
2. **Migration.** `20280103000400_auth_email_otp_f2d.sql` uygulanır.
   - Eklemelidir; kimse zorunlu yapılmaz, mevcut satırlar değişmez.
   - Uygulama sonrası salt-okunur doğrulama yapılır.
3. **Kod.** Deploy edilir. `EMAIL_PROVIDER` hâlâ `disabled` → yöntem görünmez, davranış değişmez.
4. **Kurulum.** §2–§6 (satın alma, DNS, OAuth, env).
5. **Owner testi.** §8 Owner test kutularıyla.
6. **Kontrollü açılış.** `AUTH_MFA_METHOD_SCOPE=test_accounts` ile seçili uzmanlar e-postalarını doğrular; Owner zorunluluğu tek tek açar.
7. **Genel açılış.** `AUTH_MFA_METHOD_SCOPE=all`.
   - Yöntemi olmayan (e-postası doğrulanmamış, cihazı olmayan) hesapta zorunluluk **açılamaz**; DB reddeder.
8. **Geri alma.** `EMAIL_PROVIDER=disabled`.
   - E-posta yöntemine bağlı zorunlu kullanıcılar varsa önce onların zorunluluğu kapatılmalı veya QR cihazı olmalı. Aksi halde giriş yapamazlar; MFA atlanmaz.

## 10. Hukuki not

E-posta adresi güvenlik amaçlı ikinci doğrulama için işlenir. Aydınlatma metni ve KVKK güncellemesi hukuki süreçte ayrıca ele alınır; bu belge hukuki görüş değildir. Kod, adres ve token loglanmaz:

- Gönderim kaydında yalnız alıcı adresinin özeti ve sağlayıcı hata kodu tutulur.
