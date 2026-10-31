# İleri Transit Motoru (WT-04) — yöntem, veri modeli, doğrulama

Durum: **izole hesap katmanı, ürüne bağlı değil.** Route, ekran ve menü yok, bayrak yok. Mevcut transit, forecast, timing ve Lilly kodu değişmedi. Motorda sağlayıcı (Roxy) çağrısı yok.

Kod: `lib/astrology/pro/transits/`
- `segments.ts`: çekirdek (monoton parça, seviye kesişimi)
- `model.ts`: tipler, doğrulama, ölçülü hata sınırları
- `scan.ts`: tarama
- `display.ts`: IANA yerel gösterim

## 1. Kapsam

| Olay | Açıklama |
|---|---|
| `orb_enter` / `orb_exit` | Transit→natal ve transit–transit açının orb'a giriş ve çıkış anı (kök çözümü, ≤1 sn sayısal hassasiyet). |
| `exact` | Kesin açı anı. Pencere içi sıra (`pass/of`) ve **geri hareket döngüsü** sırası (`cyclePass/cycleOf`, orb'dan bağımsız) taşır. |
| `closest_approach` | Kesinleşmeden geri dönülen yerel en yakın yaklaşma: teğetsel pencere ya da pencere içi yerel minimum. Ayrımı `separationDeg` taşır. |
| `station` | Geri ve doğrudan istasyon (hız sıfırı). |
| `ingress` | Burç girişi; geri hareketle girişler dahil. |

- **Gövdeler:** Güneş … Plüton (10). Düğüm, Kiron ve Lilith transit gövdesi olarak yok; natal hedef boylamı olarak verilebilir.
- **Açılar:** 0, 30, 45, 60, 90, 120, 135, 150, 180. Kimlikler projenin `AspectType` adlarıyla aynı (`semi_sextile`, `semi_square`, …).
- **Hedef ayrımı:** 90° ve 270° (sağ ve sol kare) ayrı ailelerdir.
- **Zaman:** UTC zaman damgası (`ms`, `atUtc`) değişmez. Yerel gösterim `toLocalStamp` / `withLocalTimes` ile yapılır: IANA, o anın ofseti, DST dahil. Ortak `isValidIanaTimeZone` kullanılır.

## 2. Matematiksel yöntem — olay kaçırmama garantisi

1. `d(t)` açısal farktır: `λ_transit(t) − λ_natal` ya da `λ_a(t) − λ_b(t)`. Göreli hız `g(t) = d′(t)`'dir.
2. `g`'nin bütün **işaret değişimleri** aranır (`signChanges`).
   - Dayanak: `|g′| ≤ A` (ivme üst sınırlarının toplamı).
   - Bir `[a, b]` aralığında sıfır varsa `|g(a)| + |g(b)| ≤ A·(b − a)` olmak zorundadır.
   - Bu eşitsizlik sağlanmıyorsa aralıkta sıfır yoktur. Sağlanıyorsa aralık 10 dakikaya kadar ikiye bölünür.
   - İki sıfırın 10 dakikadan yakın olduğu durumda `d`'nin monoton olmayan sapması `A·Δ²/8`'dir (< 0,01″), yani efemeris hatasının çok altındadır.
3. Dönüş anlarıyla `[t0, t1]` **monoton parçalara** ayrılır. Her parçada her hedef seviye en fazla bir kez kesilir (`levelCrossings`). Hedef seviyeler: `T`, `T ± orb`, burç sınırları. Kesişim anı ikiye bölmeyle bulunur (≤1 sn). 0°/360° sürekliliği adım başına yerel sarmal farkla sağlanır (|Δ| < 180°).
4. Pencereler: `T ± orb` kesişimleri durumu değiştirir (içeri ↔ dışarı). Aralık başında orb içindeyse `startsBeforeRange` olur, sonunda içindeyse `endsAfterRange`.
5. **Geri hareket döngüsü:** ardışık iki kesinleşme arasında tam **bir** dönüş varsa iki geçiş aynı ailedir.
   - Ailenin aralık dışına taşıp taşmadığı 800 günlük ek taramayla **gerçekten** denetlenir (`cycleClippedByRange`); tahmin yapılmaz.
   - Göreli hareketi hiç dönemeyen izlerde aile tek geçişlidir. Bu, ölçülen hız aralıklarıyla belirlenir (`relativeMotionCanReverse`; ör. Ay–herhangi, Güneş–Mars).

**İvme sınırları** (`ACCEL_BOUND`, °/gün²): 1800–2200 aralığında astronomy-engine ile ölçülen en büyük değerin yaklaşık 2 katıdır.
- Ölçülen değerler: Ay 0,515 · Merkür 0,199 · Venüs 0,042 · Mars 0,015 · Jüpiter 0,0035 · Satürn 0,0019.
- Test T01'de yoğun örneklemle en yüksek oran 0,496 çıktı; sınır aşılmadı.

## 3. Konum kaynağı ve zaman belirsizliği

- **Kaynak:** mevcut Lilly olay çizelgesinin `lonAt` / `speedAt` fonksiyonları, import edilerek. Altta astronomy-engine 2.1.19 (MIT) çalışır: geosantrik görünür boylam, gerçek ekliptik.
- **Ölçülü konum hatası:** 1900–2100 arasında 3.000 rastgele anda astronomy-engine ↔ JPL DE440 (skyfield) karşılaştırıldı. Gövde başına sınır (`positionErrorArcsec`) ölçülen en büyük farkın yaklaşık 1,5 katıdır.

| Gövde | Ölçülen maks. (″) | Sınır (″) |
|---|---:|---:|
| Güneş | 8,2 | 12 |
| Ay | 31,0 (1950–2050) · 100,5 (2050–2100) · 27,3 (1900–1950) | 47 · 150 (1950–2050 dışı) |
| Merkür | 16,6 | 25 |
| Venüs | 21,0 | 32 |
| Mars | 12,8 | 20 |
| Jüpiter | 10,2 | 16 |
| Satürn | 12,8 | 20 |
| Uranüs | 12,1 | 19 |
| Neptün | 18,8 | 29 |
| Plüton | 8,7 | 13 |

- **Olay zamanı belirsizliği** (her olayla birlikte döner): `min(δ/|g|, √(2δ/|g′|))`.
  - δ transit→natal için gövde hatasıdır, transit–transit için iki gövdenin hata toplamıdır.
  - İkinci terim istasyon yakınında düşük hızda geçerlidir.
  - İstasyon belirsizliği hız hatası / |ivme| ile hesaplanır. Hız hatası sınırları Güneş'e 3°'den uzak örneklerden ölçüldü (ölçülenin ~1,5 katı).
- **Belirsizlik bayrakları:**
  - `passCountUncertain`: kesin açıya hata kadar yakın bir dönüş var; geçiş sayısı ±2 değişebilir.
  - `windowUncertain`: orb sınırına hata kadar yakın bir dönüş var.
  - `nearMisses`: orb dışında ama sınıra hata kadar yakın dönüş; burada fazladan bir pencere olabilir.

**Not (kapsam dışı bulgu):** mevcut Lilly olay çizelgesindeki genel 20″ varsayımı (`timeline.ts POSITION_ERROR_ARCSEC`) bu ölçümde Ay (31″) ve Venüs (21″) için aşılıyor. O dosyaya dokunulmadı.

## 4. Doğrulama özeti

Ayrıntılı tablolar `C:/YasamSistemi-QA/ASTRO-GECE-4-MOTOR-2026-10-31/04-ILERI-TRANSIT.md` dosyasında.

- **`scripts/astrology/pro-transits.harness.ts` (26 test)**
  - Bağımsız DE440 referansı 8 senaryoda: Python/skyfield, yoğun ızgara, ayrı algoritma, toplam 4.452 olay.
  - Açıklanamayan kaçan ya da fazla olay: **0**.
  - En kötü Δt/tolerans oranı: 0,733.
  - Referans artefaktı 2 adet: Güneş diskinin arkasındaki Uranüs için DE440'ın sahte istasyonu. Ayrı sayıldı, raporlandı.
- **`scripts/astrology/pro-transits-roxy.harness.ts` (4 test, çevrimdışı)** — 2026-10-31'de alınan gerçek Roxy yanıtları:

| Karşılaştırma | Olay | Sonuç |
|---|---:|---|
| Burç girişi | 478 | Hepsi eşleşti |
| Aylık transit–transit kesin an | 730 | Hepsi eşleşti; motorda fazla olay 0 |
| Kesinleşmeyen en yakın yaklaşma | 26 | Hepsi eşleşti |
| Forecast transit→natal kesin an | 2.746 | Birebir aynı küme (ASC/MC hariç; sağlayıcı ASC/MC hedeflemiyor) |
| İstasyon | 108 | Hepsi eşleşti |
| Giriş | 288 | Hepsi eşleşti |
| Tek-an orb ve applying | 1.834 | 0 fark |

## 5. Sınırlar ve açık kararlar

- **Dış gezegen olay zamanı** saatler mertebesinde belirsizdir. Roxy forecast'a karşı medyan fark: Satürn 41 dk, Neptün 2,7 sa. Neden: astronomy-engine'in 10–20″ konum hatası ve yavaş göreli hız.
  - Seçenek 1: sağlayıcı ile olay başına inceltme (~2–3 çağrı).
  - Seçenek 2: sağlayıcının aylık efemerisiyle düzeltme tablosu (aylık 1 çağrı, genel önbellek).
  - Seçenek 3: lisanslı yüksek doğruluklu efemeris.
  - Karar Owner'da.
- **Varsayılan orb `DEFAULT_ORB_DEG = 1°`** tüm açılar için geçerli. Owner/eğitmen kararı bekliyor; istek başına değiştirilebilir.
- **Yıl aralığı** 1900–2100 (ölçülü doğruluk aralığı).
- **Süre sınırı:** en fazla 30 yıl; Ay dahilse 400 gün.
- Düğümler, Kiron ve Lilith transit gövdesi olarak yok.
- **Ürün entegrasyonu önerisi** (yapılmadı):
  - Sunucu route: `requireAstrologyAccess` + oran sınırı. Girdi natal boylamlar; natal sonuç önbellekten alınır, yeni sağlayıcı çağrısı yok.
  - İstemcide sanallaştırılmış olay tablosu.
  - Varsayılan kapalı bayrak.
