# Küçük eksik teknikler — sıralama (2026-10-28)

Ölçüt: (1) gerçekten yeni hesap mı (başka teknikte yok / aynı hesabın başka ucu değil), (2) yöntem tek ve bağımsız
doğrulanabilir mi, (3) uzman için anlamlı mı. Bu çalışmada **hiçbiri için ürün PR'ı açılmadı**: her biri ya yöntem kararı ister
ya da gerçek sağlayıcı yanıtı golden'ı olmadan "tam ve doğru" ilkesini karşılamaz (çağrı bütçesi korunuyor).

| Sıra | Aday | Yeni mi? | Yöntem | Doğrulama | Engel | Önerilen yol |
|---|---|---|---|---|---|---|
| 1 | Ekliptik geçişleri (gezegenin ekliptik enlemi 0'dan geçişi / düğüm geçişleri, yıllık) | Evet (Yakında listesinde; hiçbir teknikte yok) | Tek ve astronomik | astronomy-engine ekliptik enlem işaret değişimi + Swiss Ephemeris | Sağlayıcı (`/astrology/ecliptic-crossings`, `/vedic-astrology/ecliptic-crossings`) gerçek yanıtı yok | 2 çağrı (Batı + Vedik) golden → izole Draft PR |
| 2 | Harita yöneticisi | Evet (natal'de alan yok) | ASC burcunun yöneticisi | Tablo | Geleneksel (Satürn/Mars/Jüpiter) ↔ modern (Uranüs/Plüton/Neptün) | Owner: ikisini etiketli göster mi? 0 çağrı |
| 3 | Gün/saat yöneticisi (Batı) | Evet (Batı tarafında) | Kalde sırası | Horary `planetaryHour` 24/24 sağlayıcı hora ile | Gün doğumu tanımı | Horary entegrasyonuyla birlikte |
| 4 | Baskın gezegen | Evet | **Çok sayıda puanlama sistemi** (asalet, açısallık, yönetici zinciri, açı sayısı…) | Sisteme göre | Yöntem kararı | Eğitmen bir sistem seçmeden yapılmaz |
| 5 | Ayrıntılı transit–natal, aylık efemeris, Ay evreleri takvimi | Hayır (`western.forecast`, `western.transit` aynı hesap) | — | — | Yakında notu: aynı hesap yeni adla tekrarlanmaz | Yapılmaz; yalnız mevcut tekniklerin ekran ayrıntısı olarak ele alınır |
| 6 | Burç/gezegen/Rashi/Nakshatra açıklamaları, günlük yorumlar | Hesap değil | — | — | İçerik kararı | Kapsam dışı |
