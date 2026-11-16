# Giriş Güvenliği F2-G — Owner İşleme Özel Doğrulama ve Son Kabul Hazırlığı

Migration: `supabase/migrations/20280103000700_auth_owner_step_up_f2g.sql` (F2-A…F2-F'ye bağımlı, ekleyici).

## 1. Owner işleme özel yeniden doğrulama (step-up)

| Kritik işlem | Kanıt (action) | Hedef |
|---|---|---|
| Güvenilir cihaz onayı | `device_approve` | cihaz |
| Başka kullanıcının MFA zorunluluğunu kaldırma | `mfa_disable` | kullanıcı |
| Hesap kurtarma yürütme | `recovery_execute` | kurtarma talebi |

- Kanıt; Owner hesabına, isteği açan oturuma, işlem türüne ve hedef kayda bağlıdır. 5 dakika ve bir kez geçerlidir.
- Doğrulama yalnız Owner'ın aktif güvenilir telefonuyla (QR + eşleştirme sayısı) veya doğrulanmış e-postasına giden 6 haneli kodla
  yapılır. Kurtarma kodu bu amaçla geçmez. Kanıt bir oturum açamaz.
- Kanıt, işlemle aynı veritabanı işleminde satır kilidiyle tüketilir (yarış yok). Başarısız işlem (ör. teyit kutusu
  işaretlenmemiş) kanıtı harcamaz. Owner'ın telefonu iptal edilirse o telefonun onayladığı, henüz kullanılmamış kanıt da düşer.
- 000600'ın 30 dakikalık "taze oturum" kuralı korunur; kanıt bunun ÜZERİNE gelir.
- Ret, kanıt istemez (yalnız yetkiyi azaltır). Owner ilk cihazı (SQL bootstrap) ve çevrimdışı kurtarma kiti bu kurala bağlı değildir.
- **İnsan kontrolü ayrıca zorunludur:** onaydan önce uzmanı kayıtlı numarasından arayıp ekrandaki kodu ona okutmak.

**Kanıtlanan saldırı:** yalnız 5 dakikalık çalınmış Owner oturumu olan saldırgan bir uzmanın parolasını sıfırlayıp kendi
telefonunu o uzman adına eşleştirse bile onu onaylatamaz. Ayrıca uzmanın MFA zorunluluğunu kaldıramaz, kurtarma yürütüp bilet alamaz.
Bunlar `session-f2g`, `f2g-routes`, `f2g-step-up-concurrency` ve tarayıcı testlerinde doğrulandı.

**Kalan risk:** Saldırgan, çalınmış oturumla bir onay isteği başlatıp Owner'ın e-postasına "kritik işlem onayı" kodu
düşürebilir. Owner beklemediği bir kodu kimseyle paylaşmamalıdır (e-postada yazıyor).

## 2. Production şema denetimi (yalnız katalog — kayıt verisi okunmadı)

Salt-okunur `BEGIN READ ONLY … ROLLBACK` ile:
- `users.archived_at`, `users_archived_inactive_chk` ve `admin_archived_user_guard` tetikleyicisi production'da var.
- Arşiv / kalıcı silme fonksiyonlarının gövde md5'leri test veritabanındakilerle **birebir** aynı (5/5).
  Test: `scripts/giris-guvenligi/f2-purge.harness.ts`.
- F2 tabloları production'da henüz yok (beklenen).
- `users`'a bağlı 51 FK var. Bunlardan bazı HD eğitim tabloları `RESTRICT` (eğitmen / onaylayan alanları); bu F2 dışında,
  mevcut bir davranış. Eğitmen olarak işaretli bir uzmanın kalıcı silmesi bu yüzden reddedilebilir.

## 3. Saklama politikası altyapısı

`auth_audit_retention_policy` her denetim tablosu için şunları tutar: süre (gün), hukuki gerekçe, imha yöntemi
(`karar_bekliyor` / `silme` / `anonimlestirme`), karar veren ve tarih. Süre ancak gerekçe, karar veren ve tarihle birlikte
girilebilir. `auth_audit_retention_report()` yalnız sayım yapar.

Korunan kayıtlar `subject_user_id` ve cihaz kimliği taşıdığı için anonim değildir; **takma adlı kişisel veri** olarak
sınıflandırıldı. Hukuki karar kesinleşince: politika satırı güncellenir ve imha yürütücüsü (onaylı, ayrı bir migration)
eklenir. Değiştirilemezlik tetikleyicileri bu sürümde değiştirilmedi; hiçbir kayıt silinmedi.

## 4. Tek production yayını

1. Ekleyici migration'lar (eski kod canlıyken): `000000` → `000100` → `000300` → `000400` → `000500` → `000600` → `000700`.
2. **Birleştirme hazırlığı (zorunlu):** #797'nin dalı (`work/giris-guvenligi-f2c`) #799'un dalına normal merge ile alınır.
   Ağaç değişmez; yalnız geçmiş birleşir. Bu yapılmazsa alttan-üste birleştirmede `lib/backup/schema.generated.ts` çakışır
   (geçici klonda kanıtlandı).
3. Zincir üstten aşağı birleştirilir: #806 → f2f, #803 → f2e, #802 → f2d, #799 → f2c, #797 → f2b, #795 → f2a; en son
   #792 → main. Yöntem "merge commit" olmalı, squash kullanılmamalı. Geçici klonda: 7 adım çakışmasız, main'e tek commit
   (tek Vercel deploy), sonuç ağacı main + F2-G birleşimiyle birebir.
4. Canlı doğrulama: Owner + test hesapları; QR, e-posta kodu, kurtarma kodu, kritik işlem onayı.
5. `000200` en son.

**Geri dönüş (rollback) — sentetik veritabanında kanıtlandı (`pg:deploy-order-f2-rollback`):**
- `000200` yerindeyken eski koda dönülürse admin web girişi reddedilir (erişim kaybı).
- INSERT yetkisi geri verilirse MFA'sız hesaplar eski yolla girer. MFA zorunlu hesaplar için doğrudan oturum,
  `create_session_v2` ve bekleyen oturum onayı yine reddedilir. Yani MFA atlatması olmaz, ama bu hesaplar eski kodla
  **giremez**. Geri dönüşten önce bu hesaplar için Owner kararı gerekir.
- Var olan MFA'lı oturumlar geçerli kalır; pasif hesabın oturumu geçersiz.

## 5. Canlıya geçiş ön koşulları (production değeri doğrulanmadı — Owner kontrol eder)

| Ayar | Gereken | Not |
|---|---|---|
| `SESSION_EXPIRY_ENFORCE` | Tanımsız veya açık | Yalnız acil kapatma anahtarı; `0/false/off/no` süre zorlamasını kapatır |
| `SESSION_COOKIE_MODE` | `primary` | `off` ise HttpOnly oturum çerezi kullanılmaz |
| `REQUIRE_DB_SUPER_ADMIN_MARKER` | `true` | Owner kararı yalnız DB işaretine dayanır |
| `AUTH_MFA_METHODS` | `qr_device,email_otp` | |
| `AUTH_MFA_METHOD_SCOPE` | önce `test_accounts`, sonra `all` | |
| `AUTH_MFA_EMAIL_ROLES` | `expert` (+ Owner için `admin`) | Owner'ın kritik işlem e-posta kodu bu ayardan bağımsızdır |
| `EMAIL_PROVIDER`, `GMAIL_*`, `AUTH_OTP_PEPPER` | Gmail + ≥32 karakter pepper | Pepper değişirse açık e-posta kodları geçersizleşir |

## 6. Android

- `master` 3c8f5a6 (1.9.0) + commitsiz 1.9.1 (versionCode 15; `build.gradle.kts`, `MainActivity.kt`, `SplashOverlayView.kt`).
- `f2c-qr-onay` 40811df (2.0.0-f2c, versionCode 16), taban 3c8f5a6.
- Geçici klonda birleştirme denemesi: yalnız `versionCode/versionName` satırı çakışıyor; `MainActivity.kt` otomatik birleşiyor.
- **Güvenli sıra:** (1) 1.9.1 çalışmasını Owner commit'ler / yayımlar (15) → (2) `f2c-qr-onay` merge → sürüm `versionCode 16`,
  `versionName 2.0.0` (1.9.1 yayımlanmadıysa yine 16) → (3) derleme + birim testleri → (4) dahili test kanalı.
- Gerçek cihazda yapılacak testler: Play App Signing SHA-256 → `assetlinks.json` → App Link açılışı; Keystore anahtarı
  (StrongBox/TEE); biyometri istemi (tek istem, v1.1); QR okutma + eşleştirme sayısı; cihaz iptali sonrası red;
  attestation kararı (şu an "doğrulanmamış" kaydediliyor).

## 7. iPhone (Safari) kabul planı

Uygulama gerekmez. Sırasıyla: parola → e-posta kodu → giriş; kurtarma koduyla giriş; Ayarlar › kurtarma kodu üretme ve
indirme; e-posta değişikliği (QR veya kurtarma oturumu gerekir); 320/375/390 görünümleri; özel tarama modunda
`__Host-` çerezleri.

## 8. Google Workspace / Gmail

Workspace aboneliği ve gönderici adres; alan doğrulama; DNS: SPF, DKIM, DMARC; Google Cloud projesi + Gmail API + OAuth
istemcisi; `gmail-oauth-setup.mjs` ile yalnız `gmail.send` yenileme token'ı; Vercel env; Yönetim › E-posta durumu → test
iletisi; gerçek alıcı kutularıyla kod ve güvenlik bildirimi testi; kota uyarısı eşiği.
