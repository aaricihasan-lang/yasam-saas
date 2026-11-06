# Ücretsiz Analiz Kampanyası — Gizlilik Politikası / KVKK Aydınlatma Eki (TASLAK)

> **Bu bir TASLAKTIR. Hukuki uygunluk VARSAYILMAMIŞTIR.** Yayından önce hukuk danışmanı ve Owner onayı gerekir.
> Metin, kodun bugün (03.11.2026, PR #682) gerçekte yaptığını anlatır. Kod değişirse metin de güncellenmelidir.
> Hukuki inceleme maddeleri ayrıca: `docs/campaign/HUKUK-KONTROL-LISTESI.md`.
> Mevcut `/gizlilik-politikasi` ve `/kvkk-aydinlatma` sayfalarına bu PR'da DOKUNULMADI.

## 1. Hangi veriyi işliyoruz?

| Veri | Amaç | Saklama |
|---|---|---|
| Analiz için girdiğiniz bilgiler (ad, doğum tarihi/saati/yeri, ikinci kişinin bilgileri, bina/daire no, isim adayları) | Yalnız istediğiniz analizi hesaplamak | **Saklanmaz.** Yalnız istek süresince bellekte işlenir. Kaydedilmez, loglanmaz, önbelleğe alınmaz. |
| Bağlantı bilgisi (IP adresi) | Kötüye kullanımı ve günlük hakkı sınırlamak | Ham IP saklanmaz. Yalnız günlük değişen, geri çözülemez HMAC özeti tutulur ve 30 gün sonra silinir. IPv6'da adresin ilk 64 biti (ve hız sınırında ilk 48 biti) esas alınır. |
| Tarayıcı kimliği çerezi (`km_z`) | Günlük hakkı tarayıcı başına sınırlamak (zorunlu, güvenlik amaçlı) | HttpOnly, 30 gün. Rastgele kimlik + sunucu imzası. Kişisel veri içermez. Sunucuda yalnız günlük HMAC özeti olarak sayılır (30 gün). |
| Kozmik Takvim paket belirteci (sekme oturumu) | 2 saat içinde aynı paketin diğer özelliklerine yeniden rezervasyonsuz erişim | Tarayıcıda sekme oturumu boyunca. Sunucuda saklanmaz (imzalı). |
| Güvenlik doğrulaması (Cloudflare Turnstile) | Otomatik kötüye kullanımı engellemek | Doğrulama aracı yalnız bir analiz formu açıldığında yüklenir. Araç **tarayıcınızdan doğrudan Cloudflare'e** bağlanır; bu sırada Cloudflare IP adresinizi ve tarayıcı sinyallerini kendi politikasıyla işler. Sunucumuz doğrulama sırasında Cloudflare'e IP'nizi ayrıca **göndermez** (yalnız tek kullanımlık belirteç). Belirtecin özeti tek kullanım denetimi için 10 dakika tutulur. **Cloudflare'in işlemesi ve yurt dışı aktarım** hukuken ayrıca değerlendirilmelidir. |
| Hız sınırı kayıtları | Aşırı istek ve kötüye kullanımı engellemek | IP ve tarayıcı kimliği ham hâliyle tutulmaz; yalnız sunucu sırrıyla HMAC'lenmiş kova adı olarak (pencere: 10 dk – 2 saat) uygulamanın genel hız sınırı tablosunda sayılır. Bu tablonun eski satırlarını temizleme süresi genel altyapıya bağlıdır (hukuk incelemesinde belirtilmeli). |
| Rapor dosyaları (Word / görsel PNG) | İstediğiniz analizin raporunu vermek | **Saklanmaz.** Analizle aynı istekte, ekranda gösterilen sonuçtan üretilir ve yanıtla tarayıcınıza gelir. Dosya içinde girdiğiniz ad / doğum bilgileri yer alır; dosya adında yer almaz. İndirdiğiniz dosya yalnız cihazınızdadır. |
| İstatistik sayaçları | Kampanyanın etkinliğini ölçmek (ziyaret, analiz başlatma/tamamlama, rapor indirme, üyelik bağlantısı tıklaması, kaynak `utm_source`) | Toplu sayaç; kimlik, IP, çerez ve doğum bilgisi YOK. |
| Tekil ziyaret özeti | Tekil ziyaretçi sayısı | **Yalnız analitik çerez onayı verdiyseniz.** Tarayıcınızda rastgele bir kimlik (`km_aid`, yerel depolama) oluşturulur. Sunucuda yalnız günlük HMAC özeti tutulur ve 90 gün sonra silinir. Onay yoksa hiçbir kimlik oluşturulmaz. |

## 2. Yapmadıklarımız

- Analiz sonucunu veya girdiyi saklamıyoruz. Bir ziyaretçi başka bir ziyaretçinin sonucunu göremez; sonuç yalnız isteği yapan tarayıcıya döner.
- Uzmanların Bilgi Bankası, danışan kayıtları ve notları ziyaretçi analizlerinde kullanılmaz.
- Kampanya ile üyelik başvurusu arasında bağlantı kurmuyoruz (dönüşüm ölçülmüyor).
- Rapor dosyaları (Word / PNG) sunucuda saklanmaz, paylaşım bağlantısı üretilmez; yanıtla birlikte yalnız isteği yapan tarayıcıya gelir.
- Yorumlar kampanyada kapalıysa raporda da yorum metni yer almaz. Taş / ürün önerisi, uzman notu ve uzman Bilgi Bankası hiçbir raporda yoktur.
- Horary sorunuzun metni sunucuya gönderilmez ve rapora girmez.

## 3. Üçüncü taraflar (hukuki değerlendirme gerekir)

- **Hesaplama altyapısı sağlayıcısı (yurt dışı):** Yalnız aşağıdaki tekniklerde, istek sırasında iletilir. Sağlayıcının saklama politikası ayrıca değerlendirilmelidir.
  - Human Design: doğum tarihi, saati, koordinat ve saat dilimi (ad gönderilmez).
  - Gökyüzü Atlası (Lilly horary hariç): doğum tarihi, saati, koordinat, saat dilimi; iki kişilik tekniklerde ikinci kişinin aynı bilgileri; seçilen tarih / yer seçenekleri (ad gönderilmez).
  - Klasik Numeroloji: ad soyad ve doğum tarihi (isim adaylarında adaylar; işletme adında işletme adı; uyumda iki kişinin adı ve doğum tarihi).
- **Sağlayıcıya HİÇ veri gitmeyen teknikler (yerel hesap):** Bütüncül Numeroloji, Lilly horary, Kozmik Takvim paketi.
- **Cloudflare (Turnstile):** Güvenlik doğrulaması.
- **Barındırma (Vercel) ve veritabanı (Supabase):** Mevcut politikadaki gibi.

## 4. Hukuk danışmanına sorular

1. İkinci kişinin (eş, ilişki analizi) verisinin ziyaretçi tarafından girilmesi için aydınlatma yeterli mi?
2. Turnstile ve hesaplama sağlayıcısı için yurt dışı aktarım dayanağı nedir?
3. Güvenlik amaçlı `km_z` çerezi "zorunlu çerez" sayılabilir mi?
4. IP HMAC özetinin 30 günlük saklama süresi uygun mu?
5. Hacamat takvimi metni (tarafsız: Hicri gün + Ay evresi) sağlık iddiası açısından uygun mu?
