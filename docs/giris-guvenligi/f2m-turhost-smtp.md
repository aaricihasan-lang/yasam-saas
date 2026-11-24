# F2-M — Turhost SMTP e-posta sağlayıcısı

Durum: **geliştirme / Draft.** Production'a gerçek e-posta gönderimi, gerçek kimlik bilgisi ve production migration'ı
bu aşamada YOK. Gmail API sağlayıcısı (F2-D, `f2d-google-workspace-kurulum.md`) olduğu gibi duruyor; ikisi
`EMAIL_PROVIDER` ile seçilir.

## 1. Ne değişti

| Parça | Değişiklik |
|---|---|
| `lib/email/smtpProvider.ts` | Yeni sağlayıcı (nodemailer). 465 doğrudan TLS / 587 zorunlu STARTTLS, sertifika doğrulaması kapatılamaz, otomatik tekrar yok. |
| `lib/email/provider.ts` | `EMAIL_PROVIDER=smtp` seçeneği; yeni hata kodları `smtp_auth_failed`, `smtp_tls_error`. |
| `lib/email/mime.ts` | İsteğe bağlı `Message-ID` başlığı (yalnız SMTP kullanır; Gmail yolu aynı). |
| `lib/auth/emailOtp.ts` | `emailLimits()` — bütün gönderim yolları tek yerden; `smtp` için varsayılan 200/gün (uyarı 150). |
| `supabase/migrations/20280103001200_auth_email_smtp_provider_f2m.sql` | Veritabanı `'smtp'` sağlayıcı adını kabul eder; SMTP kimlik / TLS hataları Owner'a bildirilir. |
| `/admin/eposta-durumu` | "Kurumsal posta (SMTP)" etiketi, SMTP hata etiketleri, ayar eksikse yalnız KOD olarak neden. |

OTP üretimi (6 hane, HMAC), süre (3 dk), deneme sınırı (5 → kilit), yeniden gönderim beklemesi (60 sn),
kullanıcı başına saatlik sınır, denetim kaydı ve QR alternatifi **değişmedi**.

## 2. Ortam değişkenleri (yalnız Vercel "Sensitive"; repoya / loga yazılmaz)

| Ad | Değer | Not |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | Yoksa / bilinmiyorsa e-posta yöntemi kapalı (varsayılan `disabled`). |
| `SMTP_HOST` | `srvm06.trwww.com` | Sertifika `*.trwww.com`. `mail.yasamsistemi.com` **kullanılmamalı** (ad uyuşmazlığı → `smtp_tls_error`). IP / `smtp://` / `:port` kabul edilmez. |
| `SMTP_PORT` | `465` (önerilen) veya `587` | Başka port reddedilir (25 dahil). |
| `SMTP_USER` | gönderici posta kutusu | Ayrı otomatik gönderici hesabı önerilir (bkz. §5). |
| `SMTP_PASSWORD` | posta kutusu parolası | Yalnız sunucu belleğinde; dönüşte / günlükte / istemcide yok. |
| `SMTP_SENDER` | `SMTP_USER` ile **aynı** adres | Farklıysa sağlayıcı kurulmaz (`smtp_sender_mismatch`). |
| `SMTP_SENDER_NAME` | `Yaşam Sistemi` | İsteğe bağlı. |
| `EMAIL_DAILY_LIMIT` / `EMAIL_WARN_AT` | — | Verilmezse smtp için 200 / 150. Turhost kesin sınırı teyit edilince ayarlanır. |
| `AUTH_OTP_PEPPER` | ≥32 karakter | Mevcut F2-D kuralı; yoksa e-posta yöntemi kapalı. |

Eksik / geçersiz ayarda sağlayıcı kurulmaz → e-posta yöntemi **sunulmaz**, MFA atlanmaz; QR çalışmaya devam eder.

## 3. Güvenlik kuralları

- **TLS:** 465'te bağlantı baştan şifreli; 587'de STARTTLS yoksa kimlik bilgisi gönderilmeden işlem durur
  (düz metne düşüş yok). En az TLS 1.2. `rejectUnauthorized` açıkça `true` — `NODE_TLS_REJECT_UNAUTHORIZED=0`
  bile kapatamaz (testle kanıtlı). Test CA'sı yalnız fonksiyon parametresiyle verilebilir; ortam değişkeni yolu yok.
- **Zaman aşımı:** DNS / bağlantı / karşılama 10 sn, soket 15 sn, toplam 25 sn.
- **Mükerrer e-posta yok:** sağlayıcı hiçbir durumda kendiliğinden yeniden göndermez. Kopma / zaman aşımı → `network`;
  kullanıcı 60 sn bekleyip "yeniden gönder" ile ister (yeni kod eskisini geçersiz kılar).
- **Gizli bilgi:** dönüş yalnız `{ ok, providerMessageId }` veya `{ ok:false, code, retryable }`. Sunucu yanıt metni,
  adres, parola dışarı çıkmaz; nodemailer günlüğü kapalı. Önbellek anahtarında parola yalnız SHA-256 parmak izi.
- **Hata kodları:** `smtp_auth_failed`, `smtp_tls_error`, `quota` → Owner zil bildirimi (yükte adres / kod / parola yok).
  `rejected` (5xx), `provider_down` (4xx), `network`.

## 4. Turhost sunucusunun salt-okunur ölçümü (22.11.2026; giriş / gönderim YOK)

| Port | TLS | Sertifika | Not |
|---|---|---|---|
| 465 | TLS 1.3 | `*.trwww.com`, GlobalSign, sistem kökleriyle geçerli, 07.02.2027'ye kadar | 220 karşılama |
| 587 | STARTTLS **var** → TLS 1.3 | aynı | TLS sonrası `AUTH PLAIN LOGIN CRAM-MD5` |

## 5. Gerçek gönderim öncesi Owner kararları / bağımlılıklar

1. **Ayrı gönderici hesabı** (ör. `dogrulama@yasamsistemi.com`). `info@` parolası IMAP ile bütün kutuyu okur; sızarsa insan
   yazışmaları açığa çıkar. Ayrı kutu yalnız gönderim için kullanılır.
2. **Turhost yazılı teyidi:** Kurumsal 1 paketinin kesin saatlik / günlük gönderim sınırı ve otomatik (işlemsel) OTP
   gönderimine izin. Sınıra göre `EMAIL_DAILY_LIMIT` ayarlanır.
3. **Production migration 001200** (F2 zinciri 001100'den sonra; 000200 yine EN SON). Migration olmadan `smtp` seçilirse
   veritabanı reddeder ve hiç e-posta gitmez (fail-closed; testle kanıtlı).
4. **Teslim edilebilirlik:** SPF Turhost'u içeriyor; DKIM imzasının uygulama gönderimlerinde de atıldığı ve DMARC
   (`p=none`) raporlarının temiz olduğu ilk gerçek test iletisinde doğrulanır.
5. **Vercel'den bağlantı:** Turhost'un yurt dışı / bulut IP'lerinden SMTP girişine izin verdiği ilk test iletisinde ölçülür.

## 6. Testler

| Test | Kapsam |
|---|---|
| `scripts/giris-guvenligi/smtp-provider.check.ts` | Sahte SMTP sunucusu (smtp-server + ham TLS): 465/587 başarı, STARTTLS yok, 535, güvenilmeyen / yanlış adlı sertifika, `NODE_TLS_REJECT_UNAUTHORIZED=0`, bağlantı reddi, karşılama ve toplam zaman aşımı, DATA sonrası kopma (tek ileti), kota / ret sınıfları, başlık enjeksiyonu, yapılandırma doğrulaması, sağlayıcı seçimi, günlük sınır, gizli bilgi sızıntısı. |
| `scripts/giris-guvenligi/smtp-otp.harness.ts` | Gerçek PostgreSQL F2 zinciri: 001200 yokken red (bağlantı yok), gönderim + denetim kaydı, tek kullanım, yeniden gönderim, 5 yanlış → kilit, süre, kimlik / TLS hatasında kodun kullanılamaması + Owner bildirimi, kota, kısıt, migration idempotentliği ve eski dosyanın reddi. |
| `pg:session-f2k-on-f2m`, `pg:f2-postflight`, `pg:deploy-order-f2-*-full` | F2-K sözleşmesi ve yayın sırası 001200 ile. |

Test sertifikaları her koşuda `openssl` ile geçici klasörde üretilir; depoda özel anahtar yoktur.
