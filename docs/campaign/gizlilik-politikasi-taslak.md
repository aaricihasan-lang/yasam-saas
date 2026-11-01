# Ücretsiz Analiz Kampanyası — Gizlilik Politikası / KVKK Aydınlatma Eki (TASLAK)

> **Bu bir TASLAKTIR. Hukuki uygunluk VARSAYILMAMIŞTIR.** Yayından önce hukuk danışmanı ve Owner onayı gerekir.
> Metin, kodun bugün (02.11.2026, PR #682) gerçekte yaptığını anlatır. Kod değişirse metin de güncellenmelidir.
> Mevcut `/gizlilik-politikasi` ve `/kvkk-aydinlatma` sayfalarına bu PR'da DOKUNULMADI.

## 1. Hangi veriyi işliyoruz?

| Veri | Amaç | Saklama |
|---|---|---|
| Analiz için girdiğiniz bilgiler (ad, doğum tarihi/saati/yeri, ikinci kişinin bilgileri, bina/daire no, isim adayları) | Yalnız istediğiniz analizi hesaplamak | **Saklanmaz.** Yalnız istek süresince bellekte işlenir. Kaydedilmez, loglanmaz, önbelleğe alınmaz. |
| Bağlantı bilgisi (IP adresi) | Kötüye kullanımı ve günlük hakkı sınırlamak | Ham IP saklanmaz. Yalnız günlük değişen, geri çözülemez HMAC özeti tutulur ve 30 gün sonra silinir. IPv6'da adresin ilk 64 biti (ve hız sınırında ilk 48 biti) esas alınır. |
| Tarayıcı kimliği çerezi (`km_z`) | Günlük hakkı tarayıcı başına sınırlamak (zorunlu, güvenlik amaçlı) | HttpOnly, 30 gün. Rastgele kimlik + sunucu imzası. Kişisel veri içermez. Sunucuda yalnız günlük HMAC özeti olarak sayılır (30 gün). |
| Kozmik Takvim paket belirteci (sekme oturumu) | 2 saat içinde aynı paketin diğer özelliklerine yeniden rezervasyonsuz erişim | Tarayıcıda sekme oturumu boyunca. Sunucuda saklanmaz (imzalı). |
| Güvenlik doğrulaması (Cloudflare Turnstile) | Otomatik kötüye kullanımı engellemek | Doğrulama Cloudflare tarafından yapılır. Sunucumuz Cloudflare'e ziyaretçi IP'sini **göndermez** (yalnız tek kullanımlık belirteç). Belirtecin özeti tek kullanım denetimi için 10 dakika tutulur. **Cloudflare'in kendi işlemesi ve yurt dışı aktarım** hukuken ayrıca değerlendirilmelidir. |
| İstatistik sayaçları | Kampanyanın etkinliğini ölçmek (ziyaret, analiz başlatma/tamamlama, rapor indirme, üyelik bağlantısı tıklaması, kaynak `utm_source`) | Toplu sayaç; kimlik, IP, çerez ve doğum bilgisi YOK. |
| Tekil ziyaret özeti | Tekil ziyaretçi sayısı | **Yalnız analitik çerez onayı verdiyseniz.** Tarayıcınızda rastgele bir kimlik (`km_aid`, yerel depolama) oluşturulur. Sunucuda yalnız günlük HMAC özeti tutulur ve 90 gün sonra silinir. Onay yoksa hiçbir kimlik oluşturulmaz. |

## 2. Yapmadıklarımız

- Analiz sonucunu veya girdiyi saklamıyoruz. Bir ziyaretçi başka bir ziyaretçinin sonucunu göremez; sonuç yalnız isteği yapan tarayıcıya döner.
- Uzmanların Bilgi Bankası, danışan kayıtları ve notları ziyaretçi analizlerinde kullanılmaz.
- Kampanya ile üyelik başvurusu arasında bağlantı kurmuyoruz (dönüşüm ölçülmüyor).
- Word raporu sunucuda dosya olarak saklanmaz; yanıtla birlikte tarayıcınıza gelir.

## 3. Üçüncü taraflar (hukuki değerlendirme gerekir)

- **Hesaplama altyapısı sağlayıcısı (astroloji / Human Design / klasik numeroloji):** Analiz için gerekli doğum tarihi, saati, koordinat ve saat dilimi veya ad, istek sırasında sağlayıcıya iletilir. Sağlayıcının saklama politikası ayrıca değerlendirilmelidir.
- **Cloudflare (Turnstile):** Güvenlik doğrulaması.
- **Barındırma (Vercel) ve veritabanı (Supabase):** Mevcut politikadaki gibi.

## 4. Hukuk danışmanına sorular

1. İkinci kişinin (eş, ilişki analizi) verisinin ziyaretçi tarafından girilmesi için aydınlatma yeterli mi?
2. Turnstile ve hesaplama sağlayıcısı için yurt dışı aktarım dayanağı nedir?
3. Güvenlik amaçlı `km_z` çerezi "zorunlu çerez" sayılabilir mi?
4. IP HMAC özetinin 30 günlük saklama süresi uygun mu?
5. Hacamat takvimi metni (tarafsız: Hicri gün + Ay evresi) sağlık iddiası açısından uygun mu?
