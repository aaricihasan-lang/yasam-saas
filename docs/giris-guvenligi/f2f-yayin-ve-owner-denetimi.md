# Giriş Güvenliği F2-F — Silme × Denetim Saklama, Owner Yetki Denetimi, Yayın Planı

Migration: `supabase/migrations/20280103000600_auth_purge_audit_retention_f2f.sql` (F2-A…F2-E'ye bağımlı, ekleyici, veri silmez).

## 1. Kalıcı silme kusuru

**Belirti:** Güvenilir cihaz kaydı (F2-C) veya kurtarma olayı (F2-E) olan arşiv uzmanı Owner kalıcı olarak silemiyordu;
işlem tamamen geri alınıyordu (veri kaybı yok, fail-closed).

**Kök neden:** `admin_purge_archived_expert` (değiştirilmedi) `user_id uuid` kolonu olan her tabloyu ve tenant tablolarını
siler; silinemeyen satır kalırsa her şeyi geri alır.
- `auth_device_decisions` → `auth_trusted_devices` FK'si `ON DELETE CASCADE`: cihaz silinince karar satırı da silinmeye
  çalışılır; yalnız-eklenebilir tetikleyici reddeder.
- `auth_recovery_events.user_id`: silme döngüsü doğrudan DELETE dener; yalnız-eklenebilir tetikleyici reddeder.

**Çözüm (güvenlik geçmişi korunur, koruma kaldırılmaz):**
- Karar kaydının cihaz FK'si kaldırıldı (değer korunur). Cihaz / hesap silinse de karar geçmişi kalır.
- Olay tablosundaki kolon `subject_user_id` oldu (hesaba FK yok); silme döngüsünün kapsamına girmez, satırlar korunur.
- İki tabloda da UPDATE / DELETE yasağı aynen sürer. Satırlarda adres, kod veya özet yoktur (takma kimlik).

**Saklama sınıflandırması (kalıcı silmede):**

| Tablo | Davranış | Gerekçe |
|---|---|---|
| `auth_device_decisions`, `auth_recovery_events` | **Korunur** | Değiştirilemez güvenlik denetimi (Owner kararları, kurtarma) |
| `admin_audit_log`, `provisioning_events` (mevcut) | Korunur, referans NULL | Mevcut tasarım |
| `security_events` | Silinir | Mevcut tasarım (Owner kararı 2026-10-07: "Hesap + tüm iş verisi") |
| Oturumlar, cihazlar, kurtarma kodları, challenge'lar, e-posta kodları / değişiklik istekleri, kurtarma talepleri | Silinir | Sır / kısa ömürlü / kişisel veri |
| `auth_email_deliveries` | Silinir | Alıcı yalnız özet; hesapla birlikte gider |

Korunan denetim satırları için **saklama süresi** (KVKK) Owner / hukuk kararıdır. Bu sürüm yalnız saklar; ileride
süre belirlenirse ayrı, onaylı bir temizlik işi gerekir.

## 2. Owner yetkileri ve hesap devralma

Varsayım: saldırgan Owner'ın **oturum çerezini** ele geçirdi (parola / telefon / e-posta yok).

| İşlem | Koruma | Devralmaya yeter mi? |
|---|---|---|
| Kullanıcı parolası sıfırlama | Yalnız ana yönetici; kullanıcının oturumları kapanır | Hayır — MFA zorunlu kullanıcı yine ikinci doğrulama ister |
| Kullanıcının e-postasını değiştirme | Yalnız ana yönetici; adres değişince doğrulama düşer (F2-E) | Hayır — e-posta kodu doğrulanmamış adrese gitmez |
| Başka kullanıcının MFA'sını kapatma | **Son 30 dk'da ikinci doğrulamayla açılmış Owner oturumu** (F2-F) | Bayat çerezle hayır |
| Güvenilir cihaz onayı | Taze Owner oturumu (F2-F) + parmak izi teyidi + telefon / yüz yüze; kendi cihazı yasak | Bayat çerezle hayır |
| Kurtarma talebi açma / yürütme | Taze Owner oturumu (F2-F) + Owner parolası + 72 saat + kullanıcı bildirimi / iptali | Bayat çerezle hayır |
| Yeni Owner cihazı | Yalnız SQL konsolu kodu veya çevrimdışı kitle açılmış taze oturum + parola | Hayır |
| Çevrimdışı kurtarma kiti | Yalnız SQL konsolu | Hayır |
| Owner kendi MFA'sını kapatma | Yasak | Hayır |

**Kalan risk:** Owner oturumu, açıldıktan sonraki 30 dakika içinde çalınırsa ve saldırgan kullanıcının parolasını da
sıfırlarsa, kendi cihazını o kullanıcı adına eşleştirip onaylayabilir. Onay ekranındaki bağımsız kimlik teyidi kuralı
(kullanıcıyı kayıtlı numarasından arayıp kodu ona okutmak) bu riski insan adımıyla sınırlar. Tam kapatma için işlem
başına ek doğrulama (her onayda QR / e-posta kodu) ayrı bir geliştirme olarak önerilir.

## 3. Tek production yayını (sentetik veritabanında kanıtlanan sıra)

1. **Migration'lar (eski kod canlıyken):** `000000` → `000100` → `000300` → `000400` → `000500` → `000600`.
   Kanıt: `pg:deploy-order-f2-pre` — eski kod yolları çalışır, MFA zorunlu kullanıcıya doğrudan oturum açılamaz.
2. **Kod:** PR zinciri tek seferde main'e (bkz. 4).
3. **Canlı doğrulama** (Owner hesabı + test hesapları; giriş, QR, e-posta kodu, kurtarma kodu).
4. **`000200` en son.** Kanıt: `pg:deploy-order-f2-post` — yeni kodun bütün oturum yolları çalışır, doğrudan INSERT kapanır.
   Eski kod canlıdayken `000200` uygulanırsa admin web girişi reddedilir (kesinti, atlatma değil).

## 4. Vercel otomatik deploy

- `main`'e her merge **otomatik production deploy** tetikler. Zincir PR'ları tek tek main'e alınırsa ara sürümler canlıya
  çıkar (ör. yalnız F2-A). Bu yüzden:
  - Zincir **üstten aşağı** birleştirilir: #802 → f2d dalına, #799 → f2c'ye, #797 → f2b'ye, #795 → f2a'ya; en sonda
    yalnız #792 main'e alınır → **tek deploy**. Ara birleşmeler yalnız preview üretir. ("Create a merge commit"; squash YOK.)
  - Ek koruma (isteğe bağlı): birleştirme öncesi Vercel'de "Ignored Build Step" ile production'ı geçici duraklatmak veya
    birleştirmeyi bakım penceresinde yapmak.
- Geri dönüş: `000200` uygulanmadan önce Vercel "Instant Rollback" güvenlidir (migration'lar ekleyici). `000200`
  uygulandıktan sonra eski koda dönülecekse önce `GRANT INSERT ON public.user_sessions TO service_role` gerekir
  (MFA'lı kullanıcı varken önerilmez).

## 5. Gerçek cihaz ve Google testleri için Owner'dan gerekenler

**Android**
- Play Console → App Signing → **uygulama imzalama anahtarı SHA-256** (yükleme anahtarı değil).
- `https://www.yasamsistemi.com/.well-known/assetlinks.json` yayımı (paket adı + SHA-256) ve App Link doğrulaması.
- F2-C sürümünün (`2.0.0-f2c`, kod 16) Android 1.9.1 ana çalışmasıyla birleştirme kararı; test için dahili test kanalı.
- En az bir gerçek cihaz: Android sürümü, model; StrongBox / TEE olup olmadığı (Keystore + biyometri davranışı).
- Cihaz attestation: şu an "unverified" kaydediliyor; doğrulama isteniyorsa Google kök sertifika zinciri politikası kararı.

**iPhone**
- Gerçek iPhone + Safari (uygulama gerekmez; e-posta kodu ve kurtarma kodu yolu).

**Google Workspace / Gmail**
- Workspace aboneliği ve gönderici adres (ör. `no-reply@…`), alan adı doğrulaması.
- DNS: SPF, DKIM (Workspace'ten anahtar), DMARC kaydı.
- Google Cloud projesi, Gmail API, OAuth istemcisi ve yalnız `gmail.send` kapsamlı yenileme token'ı
  (`scripts/giris-guvenligi/gmail-oauth-setup.mjs`, belge: `f2d-google-workspace-kurulum.md`).
- Vercel production env: `EMAIL_PROVIDER=gmail`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, `GMAIL_SENDER`, `GMAIL_SENDER_NAME`, `AUTH_OTP_PEPPER` (≥32 karakter), `AUTH_MFA_METHODS`,
  `AUTH_MFA_METHOD_SCOPE=test_accounts` (önce), `AUTH_MFA_EMAIL_ROLES`.
- Test için gerçek alıcı kutuları (Owner + bir test uzmanı) ve gönderim kotası izni.
