# F4 — Girişte e-posta OTP pilotu (tek uzman hesabı) · kontrollü canlı kabul planı

> Plan. Her adım ayrı Owner onayıyla uygulanır. Gerçek kodlar, parolalar, oturum bilgileri hiçbir yere yazılmaz.
> Ürün kodu değişmez: pilot, mevcut F2/F3 altyapısının yapılandırmasıdır. Sentetik prova:
> `scripts/giris-guvenligi/f4-otp-giris-provasi.harness.ts` (CI `ci-f2`).

## Neden güvenli
- Girişte ikinci doğrulama YALNIZ `users.mfa_required = true` olan hesapta istenir. Ortam ayarı tek başına kimseye MFA açmaz.
- `AUTH_MFA_METHOD_SCOPE=test_accounts`: yöntemler yalnız `auth_mfa_test_accounts` listesindeki hesaplara sunulur.
  Listede olmayan hesap için Owner ekranı "zorunluluğu aç"ı **409 NO_USABLE_METHOD** ile reddeder (yanlışlıkla açılamaz).
- Zorunluluk açılınca yalnız o hesabın MFA'sız oturumları kapanır; diğer hesapların oturumları sürer.

## Ön koşullar (hepsi sağlanmadan başlanmaz)
1. Pilot hesap: uzman, etkin, demo / arşiv / pasif değil; e-postası doğrulanmış (F3, 26.11 — PASS).
2. Pilot kullanıcı kod e-postalarına erişebiliyor; aynı anda Owner ulaşılabilir.
3. MFA zorunlu hesap sayısı 0 (salt-okunur kontrol).

## Uygulama sırası
1. **SQL konsolu (Owner):** pilotu kontrollü test listesine ekle (en çok 14 gün önerilir; tablo üst sınırı 90 gün):
   `insert into public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at)
    values ('<pilot uuid>', 'F4 giriş OTP pilotu', '<owner uuid>', now(), now() + interval '14 days');`
2. **Vercel (yalnız Production, gizli değil):** `AUTH_MFA_METHODS=email_otp`, `AUTH_MFA_METHOD_SCOPE=test_accounts`.
   `AUTH_MFA_EMAIL_ROLES` girilmez (varsayılan `expert`). `qr_device` bu aşamada eklenmez. → yeniden yayın.
3. **Gönderimsiz kontrol:** Owner › Üye Detayı › pilot › İki Aşamalı Giriş Yönetimi: e-posta yöntemi "kullanılabilir", hesap
   "hazır". Başka bir uzmanda "hazır değil" görünmeli.
4. **Owner:** yalnız pilot için "Zorunluluğu aç" (gerekçe + onay). Pilotun açık oturumları kapanır (beklenen).
5. **Pilot kullanıcı (gerçek):** parola → "Kodu e-postama gönder" → kodu yalnız ekrana gir → giriş. Ayrıca: bir kez yanlış kod
   (hata mesajı), 60 sn içinde yeni kod isteği (bekleme mesajı).
6. **Pilot kullanıcı:** Ayarlar › Giriş Yöntemlerim › **Kurtarma kodları oluştur** → 10 kod bir kez görünür; kâğıda yazılır.
7. **Salt-okunur doğrulama (Claude):** OTP `used`, oturum `mfa_method=email_otp`, diğer 11 hesabın kayıt / oturum özeti aynı,
   MFA zorunlu yalnız 1.

## Kilitlenmeye karşı
- E-posta erişimi yoksa: kurtarma koduyla giriş (testte doğrulandı; e-posta servisi kapalıyken de çalışır).
- Test listesi süresi dolarsa: e-posta yöntemi kalkar, kurtarma kodu sürer; parola tek başına yetmez (fail-closed).
- **Owner MFA'sızken başkasının zorunluluğunu panelden KALDIRAMAZ** (F2-G: son 30 dk MFA'lı Owner oturumu + işleme bağlı kanıt).
  Bu nedenle pilot için acil geri dönüş SQL konsolundandır (yalnız pilot satırı, tek işlem):
  `begin; set local yasam.mfa_policy = 'on'; update public.users set mfa_required = false, mfa_required_at = null where id = '<pilot uuid>'; commit;`
  (Koruma ayarı olmadan doğrudan UPDATE reddedilir — testte doğrulandı.) Ayrıca `AUTH_MFA_METHODS` silinip yeniden yayın yapılabilir;
  bu yalnız yöntemi kaldırır, zorunluluğu kaldırmaz.

## Güvenli yayın koşulları
- Kod değişikliği yok; yalnız iki ortam değişkeni + test listesi satırı + Owner ekranından tek hesap zorunluluğu.
- `AUTH_MFA_METHOD_SCOPE=all` bu aşamada YASAK. `AUTH_EMAIL_SELF_SERVICE_ROLES` girilmez.
- Pilot bitince: zorunluluk kaldırma (Owner MFA'lıysa panelden, değilse SQL acil yolu) → test listesi satırının süresi
  doldurulur → `AUTH_MFA_METHODS` / `AUTH_MFA_METHOD_SCOPE` silinir → yeniden yayın.
- QR (Android 2.0.0) sonraki aşamada `AUTH_MFA_METHODS=qr_device,email_otp`; cihazsız hesaba QR sunulmaz (testte doğrulandı).
