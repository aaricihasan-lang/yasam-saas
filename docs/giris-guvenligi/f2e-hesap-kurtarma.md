# Giriş Güvenliği F2-E — Güvenli Hesap Kurtarma

Bu belge F2-E'nin tasarımını, Owner işletim adımlarını ve yayın / geri dönüş planını anlatır.
Migration: `supabase/migrations/20280103000500_auth_account_recovery_f2e.sql` (F2-A…F2-D'ye bağımlı, ekleyici).

## 1. İlkeler

- Kurtarma **hiçbir zaman** ayrı bir oturum açma yolu değildir. Her kurtarma girişi:
  parola → MFA challenge (`auth_mfa_begin`) → ikinci doğrulama → `auth_finalize_login` (F2-B'nin TEK oturum noktası).
- `users.mfa_required` kurtarma sırasında **hiçbir koşulda** değişmez (yürütme fonksiyonu bunu ayrıca denetler).
- Düz kod yalnız oluşturulduğu yanıtta / SQL konsolunda bir kez görünür. DB'de yalnız
  `sha256("yasam-recovery-v1:" ‖ kullanıcı id ‖ ":" ‖ kod)` özeti vardır; loglara, e-postalara, yedeklere girmez.
- Kod e-postayla veya üçüncü taraf hizmetle **gönderilmez**. E-postayla giden bildirimler kod içermez.
- Bütün kurtarma işlemleri değiştirilemez `auth_recovery_events` tablosuna ve `security_events`'e yazılır.

## 2. Senaryolar

| Senaryo | Kullanıcı ne yapar | Güvenlik |
|---|---|---|
| A. Kurtarma kodu | Girişte "Telefonuma veya e-postama erişemiyorum — kurtarma kodu kullan" | 10 kod, 28 karakter base32 (140 bit), tek kullanım; challenge başına 5, kullanıcı başına 24 saatte 10 yanlış |
| B. Telefon kaybı | E-posta kodu veya kurtarma koduyla girer → Ayarlar › Giriş Yöntemlerim › cihazı **İptal et** | İptal edilen cihaz QR okuyamaz / onaylayamaz; onunla açılmış oturumlar kapanır; yeni telefon yine Owner onayıyla |
| C. Telefon değişimi | Eski telefonla QR girişinden sonraki 30 dk içinde "Bu telefonu yenisiyle değiştir" | Yeni telefon F2-C akışıyla (Owner onayı + cihaz imzası) eşleşir; aktifleştiği anda eski telefon otomatik iptal |
| D. E-posta kaybı | QR veya kurtarma koduyla girer → "E-posta adresimi değiştir" + parola + yeni adrese gelen kod | E-posta koduyla açılmış oturum adresi değiştiremez; eski adrese bildirim; danışan / analiz verisi etkilenmez |
| E. Her şeyin kaybı | Owner'a başvurur | Owner kimliği doğrular, talep açar; **72 saat** bekleme (DB CHECK); kullanıcı iptal edebilir; yürütmede tek kullanımlık 24 saatlik bilet |
| F. Owner kaybı | Kâğıttaki çevrimdışı kitten bir kod | Owner'ın diğer bütün oturumları kapanır; 30 dk içinde bir kez yeni telefon eşleştirme kodu |

Adres herhangi bir yoldan değişirse (Owner paneli dahil) `email_verified_at` sıfırlanır ve bekleyen e-posta kodları
geçersizleşir. Böylece e-posta yöntemi doğrulanmamış bir adrese hiçbir zaman gitmez.

## 3. Owner işletim adımları

### 3.1 Çevrimdışı kurtarma kiti (yalnız SQL konsolu)

```sql
select * from public.auth_owner_offline_kit_issue();
```

- 5 kod döner; **bir daha gösterilmez**. Kâğıda yazın, iki ayrı güvenli yerde saklayın, ekran görüntüsü almayın.
- Yeniden üretmek önceki kiti tamamen iptal eder.
- Fonksiyon uygulama rolüne (service_role) kapalıdır; yalnız veritabanı yöneticisi çalıştırabilir.

### 3.2 Telefon ve e-posta kaybında Owner girişi

1. Giriş ekranında parola → "kurtarma kodu kullan" → kitteki bir kod.
2. Ayarlar › Giriş Yöntemlerim › "Owner çevrimdışı kurtarma" → parola → **yeni telefon için eşleştirme kodu**.
3. Yeni telefonda uygulamadan cihaz kaydı → "Yönetici ilk cihaz kodu" alanına bu kod → telefon kendi imzasıyla etkinleşir.
4. Kayıp telefonu Giriş Yöntemlerim'den iptal edin; yeni kurtarma kodları oluşturun; gerekirse yeni kit üretin.

### 3.3 Bütün yöntemlerini kaybeden kullanıcı (Yönetim › Hesap kurtarma)

1. Kullanıcıyı **kendi kayıtlarınızdaki** numaradan arayın veya yüz yüze görüşün. Kimlik doğrulanamıyorsa talep açmayın.
2. Talep açın (yöntem + en az 10 karakterlik açıklama). Kullanıcının adresine kod içermeyen bildirim gider.
3. 72 saat bekleyin. Bu sürede kullanıcı giriş yapabilirse talebi kendisi iptal edebilir; kullanıcı talepten sonra
   ikinci doğrulamayla giriş yaptıysa yürütme reddedilir.
4. Kimliği yeniden teyit edin → "Kurtarmayı yürüt" → onay kutusu + kendi parolanız.
5. Ekranda bir kez görünen bileti kullanıcıya yüz yüze veya telefonla okuyun (e-posta / mesaj ile göndermeyin).
   Bilet 24 saat geçerlidir ve parolayla birlikte kullanılır. Parolasını da unuttuysa önce parola sıfırlayın.

## 4. Yayın sırası (tek production yayını)

Sentetik veritabanında kanıtlanan sıra (`pg:deploy-order-f2-pre`, `pg:deploy-order-f2-post`):

1. Migration'lar: `000000` → `000100` → `000300` → `000400` → `000500`. Hepsi ekleyici; mevcut (eski) kod çalışmaya devam
   eder; MFA zorunlu kullanıcıya doğrudan oturum `000100` tetikleyicisiyle zaten kapalıdır.
2. Kod: F2-A…F2-E birlikte tek deploy. Yeni kod `000500` uygulanmadan yayına çıkarsa kurtarma kodu yalnız sunulmaz
   (F2-D davranışı); giriş kesilmez.
3. `000200` (service_role INSERT kilidi) **en son**, yeni kod canlıdayken. Eski kod canlıdayken uygulanırsa admin web
   girişi reddedilir (kesinti — atlatma değil).
4. Env: `AUTH_MFA_METHODS`, `AUTH_MFA_METHOD_SCOPE` (önce `test_accounts`), e-posta için `EMAIL_PROVIDER` + `AUTH_OTP_PEPPER`.
   Kurtarma kodu ayrı bir bayrak istemez; kapsam bayrağı onu da sınırlar.

## 5. Geri dönüş

- Kod geri alınırsa: `000500` yerinde kalabilir (ekleyici; eski kod yeni tabloları kullanmaz; `pg:session-f2d-on-f2e`
  ve eski F2-D kodunun `000500` üzerinde koşan harness'ları bunu doğrular).
- `000500`'ün kendisi yalnız kurtarma kodu / talep / değişim kaydı YOKKEN geri alınır (dosya başlığındaki ROLLBACK notu).
  Kullanılmış kod veya açık talep varken geri alınmamalıdır; aksi hâlde kullanıcılar kurtarma yolunu kaybeder.

## 6. Kalan riskler (bilinçli kabul / sonraki iş)

- Ele geçirilmiş **Owner** oturumu + parola, Owner'ın zaten sahip olduğu güçle (parola sıfırlama, cihaz onayı) bir
  kullanıcı hesabını devralabilir. Bu F2-E'nin kapsamı dışındaki Owner yetkisidir; kurtarma yürütmesi ayrıca Owner
  parolası ve 72 saat bekleme ister.
- Android uygulaması giriş ekranını WebView içinde web arayüzünden açtığı için kurtarma ekranı uygulamada da görünür;
  bu, gerçek Android cihazda ve gerçek iPhone'da test edilmedi (yalnız tarayıcı emülasyonu).
- Gerçek cihaz, gerçek Gmail gönderimi ve production veritabanı üzerinde doğrulama yapılmadı (NOT TESTED).
