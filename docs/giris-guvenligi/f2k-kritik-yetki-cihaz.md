# Giriş Güvenliği F2-K — Kritik Yetki ve Cihaz Güvenliği Kapatma (17.11.2026)

Bağımlılık: F2-J (#812). Migration: `supabase/migrations/20280103001100_auth_critical_privilege_device_f2k.sql` (ekleyici; şema
düzeyi 1100). Production'a hiçbir şey uygulanmadı. Bütün kanıtlar sentetik PostgreSQL, gerçek route'lar ve gerçek P-256 imzalarıyla
alındı. Her düzeltme önce düzeltmesiz zincirde FAIL olarak ölçüldü, sonra PASS'e çevrildi.

## 1. N2 — Yönetici yetkisi verme (BLOCKER → kapandı)

- `users` tablosunda BEFORE INSERT/UPDATE tetikleyicisi bulunur. Bir satırın yeni yönetici erişimi kazanması (`role='admin'`
  ve aktif) ya da `is_super_admin` değerinin true olması yalnız yetkili DB yolunda açılan işlem bayrağıyla mümkündür. Diğer
  bütün yollar 42501 alır.
- Yetkili yollar `auth_admin_create_admin` ve `auth_admin_role_grant` (`promote` / `activate`) şunları ister:
  - Owner hesabı,
  - MFA'lı ve son 30 dakikada açılmış oturum,
  - **işleme özel doğrulama** (`admin_grant`; hedef kullanıcıya bağlı, tek kullanımlık).
- Yeni yönetici:
  - `mfa_required=true` ile doğar,
  - mevcut oturumları kapanır,
  - `admin_role_granted` güvenlik olayı yazılır.
- Arayüz: kullanıcı oluşturma, rol değiştirme ve yeniden etkinleştirme ekranları `STEP_UP_REQUIRED` aldığında telefon /
  e-posta doğrulama penceresini açar ve işlemi yeniden dener.
- Test: `f2k-yonetici` 19/0. Düzeltmesiz ölçüm 0/5.

## 2. A3 — Oturum anahtarının sayfaya verilmesi

- Android uygulama kanalı tek başına `; wv)` kullanıcı ajanı ya da istemci ipucu ile **belirlenmez**. Kanal kararı sunucudadır.
- Varsayılan taşıma (`ANDROID_APP_SESSION_TRANSPORT` boş): anahtar yalnız sunucunun Android uygulaması dediği isteklerde sayfaya
  verilir (`data-android-token`). Uygulama içi tarayıcılar ve sahte ipuçları HttpOnly çerez yolunda kalır.
- `ANDROID_APP_SESSION_TRANSPORT=cookie` (isteğe bağlı): resmî uygulama da HttpOnly çerez kullanır. **Varsayılan kapalıdır;
  açılmadan önce fiziksel cihazda denenmelidir.**
- Test: `f2k-token` 16/0 (F2-J ağacında 9/7). HttpOnly H1–H6 harness'ları yeni sözleşmeye güncellendi.

## 3. O1 — QR onayında 6 haneli yazılan kod

- Giriş ve Owner kritik işlem istekleri kriptografik rastgele 6 haneli kod üretir. Telefona seçenek listesi **gönderilmez**;
  kullanıcı bilgisayardaki kodu telefonda yazar. Körlemesine doğru seçim olasılığı 1/3'ten 1/10⁶'ya iner.
- Telefon önce işlem başlığını, amacı (giriş / kritik işlem + işlem adı), tarayıcıyı ve zamanı gösterir. Onay yine güvenilir
  cihazın anahtarıyla imzalanır; kod tek başına yetmez (test: anahtar olmadan doğru kod → `BAD_SIGNATURE`).
- Yanlış kod girilirse o istek ve kullanıcının **bütün açık QR istekleri** kapanır, böylece paralel oltalama bağlantıları tek
  denemeye iner. Bilinçli "Reddet" yalnız o isteği kapatır. Kararlar kullanıcı bazında kilitlidir.
- Geçiş: eski 2 haneli istekler (en çok 5 dakika ömürlü) karşılaştırılmaya devam eder. Android uygulaması iki kipi de destekler.
- Test:
  - `session-f2k` O1 (11 madde) ve `f2k-qr` 7/0;
  - ölçüm F2-J'de `kod=82 seçenek=3 yanlış seçim sonrası açık kardeş=1`, F2-K'da `kod=6 hane seçenek=0 açık kardeş=0`;
  - Android JVM 17/17.

## 4. O5 — Bekleyen cihaz eşleştirmesi 15 dakika

- Owner onayı 15 dakikada gelmeyen `pending_owner` talebi `expired` olur ve **onaylanmış sayılmaz**. Satır ve karar geçmişi korunur;
  `device_enroll_expired` güvenlik olayı yazılır.
- Kapanış tembeldir: yeni talep, durum sorgusu ya da Owner kararı anında gerçekleşir. Owner listesi süresi geçen talebi göstermez.
  Bir tetikleyici, süresi geçmiş talebin hiçbir yoldan onaylanamamasını sağlar.
- Aynı anahtarla tekrar idempotenttir (aynı talep döner). Süre dolunca yeni talep açılabilir.
- Android: ağ hatası ya da 5xx'te anahtar artık **silinmez**; yeniden denemede aynı anahtar gönderilir. Diğer hatalarda davranış
  aynen kalır.
- Mevcut kayıtlar: migration hiçbir satırı değiştirmez. F2 tabloları production'da henüz yoktur, bu yüzden taşınacak veri yoktur.
- Test: `session-f2k` O5 (11 madde). Negatif kontrolde F2-J zincirinde 7 madde FAIL, F2-K'da 0.

## 5. C3 — Kalıcı silme × yasal saklama

- Uzmanın kendisi ya da cihazlarından biri için açık yasal saklama (`auth_retention_holds`) varken kalıcı silme **başlamaz**
  (UP011 → HTTP 409). Aynı işlemde hiçbir satır silinmez, yani kısmi silme yoktur.
- Silme fonksiyonu değişmedi (gövde md5 testi aynen geçer). Kontrol, fonksiyonun silmeden önce yazdığı işlem işaretine bağlı bir
  tetikleyicidir.
- Saklama kaydı otomatik kaldırılmaz. Kaldırma yalnız Owner'ın `auth_retention_hold_release` kararıdır. Yasal süre bu kodda
  tanımlanmaz.
- Test: `purge-senaryolari` S6 (6 madde) 25/0. Düzeltmesiz ölçüm 21/4: açık saklamaya rağmen kullanıcı, oturum, güvenlik olayı
  ve cihaz siliniyordu.

## 6. Diğer kapatmalar

- **L4:**
  - Güvenlik bildirimleri e-posta kotasının en çok %80'ini kullanır; kalan pay giriş ve işlem kodlarına ayrılır
    (`auth_email_notice_reserve_quota`).
  - Gönderilemeyen bildirim `security_notice_undelivered` güvenlik olayı olur (adres ve içerik içermez; saatte bir).
  - 001100 uygulanmamış veritabanında kod eski ayırmaya düşer.
- **L5:** Gmail gönderiminde zaman aşımı ya da bağlantı kopmasından sonra otomatik ikinci gönderim yapılmaz. Gmail'in açık 5xx
  yanıtında tek tekrar korunur (Google önerisi). Eski kod ölçümü: ikinci gönderim yapılıyordu.
- **`AUTH_MFA_EMAIL_ROLES`:**
  - Yeni değer `owner`: e-posta yöntemi yalnız Owner yönetici hesabına açılır. Owner kararı DB işaretinden gelir; hata olursa kapalı.
  - Varsayılan (`expert`) değişmedi.
  - Öneri: Owner'ın telefon yedeği için `expert,owner`. `admin` bütün yöneticilere açar.

## 7. Bilinçli olarak değiştirilmeyenler

- **D2 (`users.email_verified_at`, `user_sessions` kolonları):**
  - `service_role` uygulama sunucusunun tam yetkili kimliğidir; kolon düzeyi kısıt onu durdurmaz, yalnız kod hatasına karşı korur.
  - Yönetici güncelleme yolu açık beyaz liste kullanır (ad / e-posta / rol).
  - `is_super_admin` ve yönetici yetkisi artık N2 tetikleyicisiyle korunur.
  - Kalan risk kuramsaldır.
- **C1 / C5 (anonimleştirme kapsamı):** imha / anonimleştirme takma adlandırmadır ve JSON yalnız üst düzeyde temizlenir.
  Kapsamı genişletmek saklama politikası kararıdır (Owner + hukuk). Bu PR'de değiştirilmedi.
- **Eski süresiz Android oturumları:** F2-J geçiş altyapısı hazırdır, varsayılan `kapali`. Açılması ve son tarih Owner kararıdır.
  Production oturumlarına yazılmadı.

## 8. Yayın sırası

1. Ön kontrol: `f2-preflight.sql` → 000000 UYGULANABİLİR, geçmiş UYUMLU.
2. Migration'lar `000000 → 000100 → 000300 → … → 001000 → 001100` sırasıyla uygulanır. Her adımdan önce ön kontrol "UYGULANABİLİR"
   olmalıdır.
3. `f2-postflight-check.sql` (000200 öncesi) → PASS.
4. PR zinciri üstten aşağı normal merge commit (#813 → #812 → … → #792 → main) ve tek yayın.
5. Android F2 sürümü (O1 yazma kipi, O5 tekrar) web ile aynı yayında olmalıdır. F2 Android uygulaması henüz dağıtılmadığı için
   sahada eski F2 istemcisi yoktur.
6. Canlı doğrulama, ardından `000200` (en son) ve `f2.postflight_final=on` ile postflight → PASS.

Geri dönüş:
- 001100 tek başına geri alınırsa yönetici yetkisi korumasız kalır. Eski koda dönülecekse 001100 da bırakılabilir.
- Eski kod yönetici oluşturamaz (fail-closed). 6 haneli kodları eski web kodu göstermez, bu yüzden geri dönüşte QR girişi için
  web ve 001100 birlikte düşünülmelidir.

## 9. Gerçek ortamda doğrulanmayanlar (NOT TESTED)

- Fiziksel Android (yazılan kod girişi, Keystore, biyometri, App Links, Android 7–10),
- `ANDROID_APP_SESSION_TRANSPORT=cookie` ile gerçek uygulama,
- iPhone Safari,
- gerçek Gmail gönderimi ve kota davranışı,
- production ortam değişkenleri,
- donanım attestation.
