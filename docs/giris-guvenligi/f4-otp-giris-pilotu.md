# F4 — Girişte e-posta OTP pilotu (tek uzman hesabı) · kontrollü canlı kabul planı

> Plan. Her adım ayrı Owner onayıyla uygulanır. Gerçek kodlar, parolalar, oturum bilgileri hiçbir yere yazılmaz.
> Sentetik provalar (CI `ci-f2`): `f4-otp-giris-provasi.harness.ts` (uçtan uca), `f4-kurtarma-guvenligi.harness.ts`
> (kilitlenme güvenliği + 3 negatif kontrol), tarayıcı: `f4-kurtarma-ui.e2e.ts` (Chrome + Edge, 5 genişlik).

## Neden güvenli
- Girişte ikinci doğrulama YALNIZ `users.mfa_required = true` olan hesapta istenir; ortam ayarı tek başına kimseye MFA açmaz.
- `AUTH_MFA_METHOD_SCOPE=test_accounts`: yöntemler yalnız `auth_mfa_test_accounts` listesindeki hesaplara sunulur.
  Listede olmayan hesap için "zorunluluğu aç" **409 NO_USABLE_METHOD** ile reddedilir.
- **Kurtarma önce (Risk A kapandı):** Owner dışı hesapta kullanılmamış kurtarma kodu yoksa zorunluluk açılamaz
  (**409 RECOVERY_REQUIRED**; panel düğmesi kapalı). Kodlar MFA açılmadan ÖNCE, parola + kayıtlı adrese gelen kodla kurulur
  (yalnız parolayı bilen biri kod üretemez). Kurulum hem API'de hem veritabanı fonksiyonunda AYNI kurallarla sınırlı: etkin,
  onaylı (`approval_status='approved'`), arşivde değil, "Pasif" değil, demo değil, admin / uzman, e-postası doğrulanmış,
  zorunluluğu henüz açılmamış VE test listesinde ETKİN kaydı olan hesap. API atlanıp fonksiyon doğrudan çağrılsa da (elinde
  geçerli e-posta kodu olsa bile) bu kurallar aşılamaz (sentetik testle kanıtlı). Kapsam koşulu pilot dönemine özgüdür: MFA test
  listesinin dışına genişletilirse kurulum fonksiyonu ayrı bir migration ile güncellenir (o zamana kadar kapalı).
- **Süre dolumu (Risk B kapandı):** test listesi kaydının süresi dolan zorunlu hesap e-posta yöntemini kaybetmez; listeye hiç
  alınmamış hesaplarda yanlış kapsam ayarı yine asıl yöntem açmaz.
- **Acil geri dönüş denetimli:** `auth_mfa_emergency_disable` (yalnız SQL konsolu; gerekçe; tek hesap; diğer hesapların MFA
  durumu işlem içinde karşılaştırılır, değişirse işlem geri alınır; `security_events` kaydı).

## Yayın ön koşulları (sırayla, her biri ayrı onay)
Önerilen sıra **migration → kod** (her iki sıra da güvenli: eski kod yeni fonksiyonları çağırmaz; yeni kod fonksiyon yokken
kurulumu ve Risk B uzatmasını KAPALI tutar — fail-closed; mevcut giriş davranışı değişmez).
1. **Migration `20280129100100_auth_mfa_pilot_safety_f4.sql`** production'a (yalnız yeni fonksiyonlar; tablo / veri değişmez).
   Ön koşul denetimi: F2 zinciri + `users.archived_at / access_restricted_at / approval_status` kolonları; eksikse migration DURUR.
   Geri alma: üç `DROP FUNCTION` (dosya başlığında).
2. **PR (F4 kurtarma güvenliği) merge** → production kodu.
3. Salt-okunur doğrulama: üç fonksiyon var; `auth_mfa_emergency_disable` service_role'e KAPALI; MFA zorunlu hesap 0.

## Canlı kabul sırası
| # | Kim / nerede | İşlem | Beklenen | Başarısızsa |
|---|---|---|---|---|
| 1 | Claude, salt-okunur | Pilot ön koşulları: uzman, etkin, onaylı, demo / arşiv / pasif değil, e-posta doğrulanmış; MFA zorunlu 0 | Hepsi PASS | Dur |
| 2 | Owner, SQL konsolu | Pilotu test listesine ekle (14 gün): `insert into public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) values ('<pilot>', 'F4 giriş OTP pilotu', '<owner>', now(), now() + interval '14 days');` | 1 satır | Satırı sil (`delete … where user_id='<pilot>'`) |
| 3 | Owner, Vercel (yalnız Production) | `AUTH_MFA_METHODS=email_otp`, `AUTH_MFA_METHOD_SCOPE=test_accounts` → yeniden yayın | READY; diğer hesaplarda giriş aynı | Değişkenleri sil → yeniden yayın |
| 4 | Pilot kullanıcı | Ayarlar › Hesap Güvenliği › Giriş Yöntemlerim › Kurtarma kodları › parola → **E-postama doğrulama kodu gönder** → kod → 10 kod; **kâğıda yaz**, "kaydettim" | 10 kod bir kez görünür | Yeni kod iste (60 sn); 5 yanlışta yeni kod |
| 5 | Owner, Üye Detayı › İki Aşamalı Giriş | Pilotta "Kurtarma kodu: 10" ve "Hazır"; başka bir uzmanda "Hazır değil" | Pilot düğmesi açık | Dur |
| 6 | Owner | Yalnız pilot için **Zorunluluğu aç** (gerekçe + onay) | Pilotun açık oturumları kapanır (beklenen); diğerleri sürer | Acil geri dönüş (aşağıda) |
| 7 | Pilot kullanıcı | Parola → **Kodu e-postama gönder** → bir kez bilerek yanlış kod → doğru kod → giriş | Yanlış kod uyarısı; doğru kodla giriş | Kurtarma koduyla giriş |
| 8 | Pilot kullanıcı | 60 sn içinde ikinci kod isteği | Bekleme mesajı | — |
| 9 | Pilot kullanıcı | Çıkış → parola → **Kurtarma kodu kullan** (kâğıttaki bir kod) | Giriş; o kod artık geçmez | Başka kod |
| 10 | Claude, salt-okunur | OTP `used`; oturum `mfa_method`; kurtarma kodu 9 aktif; MFA zorunlu yalnız 1; diğer 11 hesabın kayıt / oturum özeti aynı | PASS | Rapor + dur |
| 11 | (14 gün sonra) | Liste kaydının süresi dolar | Pilot e-posta + kurtarma koduyla girmeye devam eder | — |

## Test süresinin dolması — açık kurallar
- **Süre dolumu MFA'yı OTOMATİK KALDIRMAZ.** `mfa_required` yalnız Owner (panel, taze MFA ile) veya `auth_mfa_emergency_disable`
  ile kalkar. 14 gün dolunca pilot aynen e-posta kodu + kurtarma koduyla girmeye devam eder (Risk B kuralı).
- Süre dolumu kapsamı GENİŞLETMEZ: listede olmayan, zorunlu olmayan hesaplar etkilenmez; kurulum da süresi dolmuş kayıtla kapanır.

| Senaryo | Sonuç | Kanıt (sentetik test) |
|---|---|---|
| 14 gün doldu, zorunluluk açık | E-posta kodu + kurtarma kodu sunulur; parola tek başına oturum açmaz; `mfa_required` aynen `true` | f4-kurtarma-guvenligi C, F |
| Owner test listesi kaydını SİLDİ | Yalnız kurtarma kodu sunulur (#833 kuralı); kurtarma koduyla giriş tamamlanır; zorunluluk DEĞİŞMEZ (açık kalır) | F1 |
| E-posta hizmeti kesildi | Kod gönderilemez (hata), tamamlama oturum açmaz; kurtarma koduyla giriş tamamlanır | F2 |
| `AUTH_MFA_METHODS` silindi | MFA kalkmaz; yalnız kurtarma kodu; parola yetmez (geri alma DEĞİL) | F3 |
| MFA'sız Owner panelden kapatmak istedi | 403 (taze MFA şart); zorunluluk değişmez — atlatma yok | F3 |
| Pilot kurtarma kodlarını da kaybetti | Acil geri dönüş (aşağıda) | D |

## Acil geri dönüş (pilot kilitlenirse / Owner kararı)
Owner MFA'sızken başkasının zorunluluğunu panelden **kaldıramaz** (F2-G). Bu nedenle denetimli SQL fonksiyonu kullanılır
(Supabase SQL konsolu; tek hesap; gerekçe 10–500 karakter):
```sql
select public.auth_mfa_emergency_disable('<pilot uuid>', '<gerekçe: ör. F4 pilot e-posta erişimi yok>');
-- beklenen: {"ok":true,"changed":true,"mfa_required_before":1,"mfa_required_after":0,"others_unchanged":true}
```
Doğrulama: `select count(*) filter (where mfa_required) from public.users;` → 0; `security_events`'te `mfa_emergency_disabled`.
**Yalnız `AUTH_MFA_METHODS`'u silmek geri dönüş DEĞİLDİR** (zorunluluk kalır; yalnız kurtarma kodu kalır).
Migration uygulanmadıysa son çare elle (tek işlem, yalnız pilot satırı):
`begin; set local yasam.mfa_policy = 'on'; update public.users set mfa_required = false, mfa_required_at = null where id = '<pilot>'; commit;`

## Pilotun güvenli kapatılması
1. Zorunluluğu kaldır: Owner MFA'lıysa panelden (taze MFA + işlem onayı), değilse `auth_mfa_emergency_disable`.
2. Test listesi kaydını bitir: `update public.auth_mfa_test_accounts set expires_at = now() where user_id = '<pilot>';`
   (Risk B kuralı yalnız ZORUNLU hesapta yöntem korur; zorunluluk kalkınca etkisizdir.)
3. `AUTH_MFA_METHODS` / `AUTH_MFA_METHOD_SCOPE` sil → yeniden yayın. Kurtarma kodları kullanıcıda kalabilir (zararsız).

## Sonraki aşama: Android QR
`AUTH_MFA_METHODS=qr_device,email_otp`; cihazsız hesaba QR sunulmaz (testte doğrulandı). Gerçek cihaz + Play 2.0.0 kabulü
ayrı Owner işi.

## Yasaklar (bu pilotta)
`AUTH_MFA_METHOD_SCOPE=all`, `AUTH_EMAIL_SELF_SERVICE_ROLES`, Owner'ın kendi zorunluluğu (kit kuralı ayrı aşama).
