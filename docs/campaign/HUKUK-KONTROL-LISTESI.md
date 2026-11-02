# Kampanya Merkezi — Hukuki İnceleme Kontrol Listesi (03.11.2026)

> Hukuki onay VERİLMİŞ SAYILMAZ. Her satır hukuk danışmanı + Owner kararı ister. Teknik varsayılanlar fail-closed: yayın hakkı
> doğrulanmayan yorumlar kampanyada **varsayılan kapalı** (Owner modül + teknik anahtarı ikisi de açılmadıkça yorum yok, rapor da yorumsuz).

| # | Konu | Teknik durum (kod) | Hukuktan beklenen | Karar verilene kadar |
|---|---|---|---|---|
| H1 | Sağlayıcı (Roxy) yorum metinlerinin halka açık kullanımı | HD Sistem Yorumu, Atlas yorum katmanı, Klasik Numeroloji anlam metinleri yalnız yorum anahtarları açıksa ekranda ve raporda | Sağlayıcı sözleşmesi / ToS: üçüncü kişilere (ücretsiz ziyaretçi) gösterme ve Word dosyasına koyma hakkı | Yorumlar KAPALI |
| H2 | Kitap kataloğu metinleri (Bütüncül Numeroloji zamanlama / ilişki / mekân) | Yalnız yorum anahtarları açıksa ekranda; rapor dosyasına hiç girmez | Yayınevi / yazar izni, alıntı sınırı | Yorumlar KAPALI |
| H3 | Hacamat Takvimi | Kozmik paketin parçası (çıkarılmadı). Yalnız tarafsız takvim: Hicri gün + Ay evresi; uygun/yasak gün, sağlık / yarar ifadesi, uzman kuralı YOK; "tıbbi tavsiye değildir" notu | Tarafsız takvim gösteriminin sağlık beyanı sayılıp sayılmadığı; reklam mevzuatı | Tarafsız gösterim korunur, sağlık içeriği eklenmez |
| H4 | KVKK aydınlatma metni | Taslak: `docs/campaign/gizlilik-politikasi-taslak.md` (koddaki gerçek akışla eşlendi). Mevcut `/gizlilik-politikasi` ve `/kvkk-aydinlatma` sayfaları DEĞİŞMEDİ | Metnin onayı; sayfalara ekleme; kampanya formunda aydınlatma bağlantısı | Yayın kontrol listesi 7. adım tamamlanmadan `CAMPAIGN_PUBLIC_ENABLED` açılmaz |
| H5 | Yurt dışı veri aktarımı | Sağlayıcıya giden alanlar teknik bazında taslağın 3. bölümünde; Turnstile tarayıcıdan Cloudflare'e bağlanır; barındırma Vercel, DB Supabase (Frankfurt) | Aktarım dayanağı (açık rıza / standart sözleşme / taahhütname); VERBİS kaydı güncellemesi | — |
| H6 | Alt işleyiciler | Roxy (hesaplama), Cloudflare (Turnstile), Vercel, Supabase | Alt işleyici listesi + sözleşmeler (DPA) | — |
| H7 | İkinci kişinin verisi | Sinastri / uyum / HD bağlantı formlarında ziyaretçi başkasının doğum bilgisini girer; saklanmaz | Aydınlatma yükümlülüğü ve ziyaretçi beyanı yeterli mi | Form notu: "yalnız bu hesap için kullanıldı; kaydedilmedi" |
| H8 | Çerezler | `km_z` (güvenlik, HttpOnly, 30 gün) zorunlu sayılıyor; `km_aid` yalnız analitik onayıyla | Zorunlu çerez nitelemesi; çerez politikasına ekleme | Analitik onay yoksa tekil kimlik yok |
| H9 | Rapor dosyaları | Word / PNG aynı istekte üretilir, saklanmaz; dosyada ad ve doğum bilgisi var (dosya adında yok) | Rapora eklenecek yasal not / sorumluluk reddi yeterli mi (mevcut: "kişisel farkındalık amaçlıdır, tavsiye değildir") | — |
| H10 | Üyelik bağlantısı / pazarlama | Dönüşüm ölçülmüyor; yalnız tıklama sayacı (kimliksiz) | Ticari elektronik ileti / pazarlama izni gerekmediğinin teyidi | — |
